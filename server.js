import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { Resend } from 'resend';

dotenv.config();

const app = express();

// Enable open CORS for all domains to prevent preflight OPTIONS failures
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://zord-pakistan-paypal1.vercel.app',
  'https://zordpakistan.shop',
  'https://www.zordpakistan.shop'
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like curl or server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

const PORT = process.env.PORT || 3001;

// Production frontend URL — used for payment redirect callbacks.
// Falls back to the live Vercel deployment so redirects always land correctly.
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://zord-pakistan-paypal1.vercel.app';

// ZionPe configurations are read dynamically from process.env inside the routes

// 1. Create ZionPe Checkout Session
app.post('/api/payment/zionpe/create-session', async (req, res) => {
  try {
    const { orderId, amount, customer, items } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({ error: 'Missing orderId or amount' });
    }

    const apiKey = process.env.ZIONPE_API_KEY;
    if (!apiKey) {
      throw new Error('ZIONPE_API_KEY is not configured in environment variables.');
    }

    const pkrAmount = parseFloat(amount);
    const usdAmount = parseFloat((pkrAmount / 280).toFixed(2));
    console.log("Converted PKR to USD:", pkrAmount, "->", usdAmount);

    // Map items to clean line_items (only essential fields — no image URLs, arrays, etc.)
    const line_items = (items || []).map(item => ({
      name: `${item.name} - Size ${item.size}`,
      amount: parseFloat((item.price / 280).toFixed(2)),
      quantity: 1
    }));

    // Build a short human-readable summary for metadata (avoids size limits)
    const itemsSummary = (items || [])
      .map(item => `${item.name} (Size ${item.size})`)
      .join(', ')
      .substring(0, 200); // Hard cap to prevent oversized metadata

    const payload = {
      site_key: process.env.ZIONPE_API_KEY,
      amount: usdAmount,
      currency: 'USD',
      order_id: orderId,
      success_url: `${req.headers.origin || FRONTEND_URL}/order-success`,
      cancel_url: `${req.headers.origin || FRONTEND_URL}/cart`,
      customer: {
        name: customer?.name || 'Customer',
        email: customer?.email || 'customer@zordpakistan.shop',
        phone: customer?.phone || '00000000000',
        address: customer?.address || ''
      },
      line_items,
      // Lightweight metadata only — no large JSON blobs
      metadata: {
        order_id: orderId,
        items_summary: itemsSummary,
        customer_name: (customer?.name || '').substring(0, 50),
        customer_phone: (customer?.phone || '').substring(0, 20),
        total_pkr: pkrAmount
      }
    };

    const sessionRes = await fetch('https://zionpe.com/api/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!sessionRes.ok) {
      const errText = await sessionRes.text();
      throw new Error(`ZionPe session creation failed: ${errText}`);
    }

    const sessionData = await sessionRes.json();
    
    // Assuming ZionPe returns { checkout_url: '...' } or { url: '...' }
    const checkout_url = sessionData.checkout_url || sessionData.url;
    
    if (!checkout_url) {
      throw new Error('checkout_url not found in ZionPe response');
    }

    // Save pending order to Firebase
    const dbUrl = process.env.FIREBASE_DB_URL;
    if (dbUrl) {
      try {
        const pendingOrder = {
          id: orderId,
          items,
          total: pkrAmount,
          customer,
          status: 'Pending',
          paymentMethod: 'Online Card (ZionPe)',
          paymentStatus: 'Pending',
          timestamp: new Date().toISOString()
        };
        await fetch(`${dbUrl}/orders/${orderId}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pendingOrder)
        });
      } catch (dbErr) {
        console.error('Error creating pending order in Firebase:', dbErr);
      }
    }

    res.json({ checkout_url });

  } catch (err) {
    console.error('Error creating ZionPe session:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to create ZionPe session' });
  }
});

// 2. ZionPe Webhook
app.post('/api/payment/zionpe/webhook', async (req, res) => {
  try {
    const event = req.body;
    
    // Validate webhook securely
    const signature = req.headers['x-zionpe-signature'];
    
    const webhookSecret = process.env.ZIONPE_WEBHOOK_SECRET;
    
    if (webhookSecret) {
      if (!signature) {
        return res.status(401).json({ success: false, message: 'Missing signature' });
      }

      // Compute HMAC SHA256 signature using the raw body
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(req.rawBody)
        .digest('hex');

      // Compare signatures
      // Note: If ZionPe uses a specific signature format (like Stripe's t=...,v1=...), this logic may need adjusting.
      if (signature !== expectedSignature) {
        console.error('Webhook signature verification failed.', { expectedSignature, signature });
        return res.status(401).json({ success: false, message: 'Invalid signature' });
      }
    }

    // Assuming the event structure has { event_type: 'payment.success', data: { order_id: '...' } }
    // We handle success cases to create the final confirmed order in Firebase
    const isSuccessEvent = event.event_type === 'payment.success' || event.status === 'success' || event.status === 'Paid';
    const isFailedEvent = event.event_type === 'payment.failed' || event.event_type === 'payment_intent.payment_failed' || event.status === 'failed' || event.status === 'Declined';
    const orderId = event.data?.order_id || event.order_id || event.metadata?.orderId || event.metadata?.order_id;

    if (orderId) {
      const dbUrl = process.env.FIREBASE_DB_URL;
      if (dbUrl) {
        try {
          if (isSuccessEvent) {
            const updates = {
              status: 'Processing',
              paymentStatus: 'Paid',
              timestamp: new Date().toISOString()
            };
            const firebaseRes = await fetch(`${dbUrl}/orders/${orderId}.json`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updates)
            });
            if (!firebaseRes.ok) {
              console.error('Firebase DB update success error:', await firebaseRes.text());
            } else {
              console.log(`✅ Order ${orderId} successfully marked as Paid in Firebase.`);
              
              // Send emails
              try {
                const orderRes = await fetch(`${dbUrl}/orders/${orderId}.json`);
                if (orderRes.ok) {
                  const orderData = await orderRes.json();
                  if (orderData && process.env.RESEND_API_KEY) {
                    const resend = new Resend(process.env.RESEND_API_KEY);
                    const adminEmail = process.env.ADMIN_EMAIL || 'zordofficialpk@gmail.com';
                    const senderEmail = process.env.SENDER_EMAIL || 'orders@zordpakistan.shop';
                    const customerEmail = orderData.customer?.email;
                    const customerName = orderData.customer?.name || 'Customer';

                    const itemsRowsHtml = (orderData.items || []).map(item =>
                      `<tr>
                        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;">${item.name}</td>
                        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;text-align:center;">${item.size}</td>
                        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;text-align:right;">PKR ${item.price}</td>
                      </tr>`
                    ).join('');

                    const customerHtml = `
                    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
                      <div style="background:#000;padding:24px 32px;text-align:center;">
                        <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:2px;">ZORD PAKISTAN</h1>
                      </div>
                      <div style="padding:32px;">
                        <h2 style="color:#1a1a1a;margin:0 0 8px;">Order Confirmed ✓</h2>
                        <p style="color:#555;font-size:14px;margin:0 0 24px;">Hi ${customerName}, thank you for shopping with us!</p>
                        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
                          <tr style="background:#f8f8f8;">
                            <td style="padding:8px 12px;font-weight:600;font-size:13px;color:#888;">ITEM</td>
                            <td style="padding:8px 12px;font-weight:600;font-size:13px;color:#888;text-align:center;">SIZE</td>
                            <td style="padding:8px 12px;font-weight:600;font-size:13px;color:#888;text-align:right;">PRICE</td>
                          </tr>
                          ${itemsRowsHtml}
                        </table>
                        <div style="background:#f8f8f8;padding:16px;border-radius:8px;margin-bottom:24px;">
                          <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#1a1a1a;">Total: PKR ${orderData.total}</p>
                          <p style="margin:0;font-size:13px;color:#888;">Payment: Online Card (ZionPe) • Paid</p>
                        </div>
                        <div style="margin-bottom:24px;">
                          <p style="font-size:13px;font-weight:600;color:#888;margin:0 0 4px;">SHIPPING TO</p>
                          <p style="font-size:14px;color:#333;margin:0;">${customerName}</p>
                          <p style="font-size:14px;color:#333;margin:0;">${orderData.customer?.phone || ''}</p>
                          <p style="font-size:14px;color:#333;margin:0;">${orderData.customer?.address || 'N/A'}</p>
                        </div>
                        <p style="font-size:14px;color:#555;">We are preparing your order and will notify you once it ships. If you have any questions, reply to this email.</p>
                      </div>
                      <div style="background:#f8f8f8;padding:16px 32px;text-align:center;">
                        <p style="font-size:12px;color:#aaa;margin:0;">Order #${orderId} • ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        <p style="font-size:12px;color:#aaa;margin:4px 0 0;">© Zord Pakistan — zordpakistan.shop</p>
                      </div>
                    </div>`;

                    const adminHtml = `
                    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
                      <div style="background:#16a34a;padding:18px 32px;">
                        <h1 style="color:#fff;margin:0;font-size:18px;">💰 New Paid Order — #${orderId}</h1>
                      </div>
                      <div style="padding:24px 32px;">
                        <div style="display:flex;gap:32px;margin-bottom:20px;">
                          <div>
                            <p style="font-size:12px;font-weight:600;color:#888;margin:0 0 2px;">CUSTOMER</p>
                            <p style="font-size:14px;color:#1a1a1a;margin:0;">${customerName}</p>
                          </div>
                          <div>
                            <p style="font-size:12px;font-weight:600;color:#888;margin:0 0 2px;">EMAIL</p>
                            <p style="font-size:14px;color:#1a1a1a;margin:0;">${customerEmail || 'N/A'}</p>
                          </div>
                          <div>
                            <p style="font-size:12px;font-weight:600;color:#888;margin:0 0 2px;">PHONE</p>
                            <p style="font-size:14px;color:#1a1a1a;margin:0;">${orderData.customer?.phone || 'N/A'}</p>
                          </div>
                        </div>
                        <div style="margin-bottom:20px;">
                          <p style="font-size:12px;font-weight:600;color:#888;margin:0 0 2px;">ADDRESS</p>
                          <p style="font-size:14px;color:#1a1a1a;margin:0;">${orderData.customer?.address || 'N/A'}</p>
                        </div>
                        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                          <tr style="background:#f0fdf4;">
                            <td style="padding:8px 12px;font-weight:600;font-size:13px;color:#888;">ITEM</td>
                            <td style="padding:8px 12px;font-weight:600;font-size:13px;color:#888;text-align:center;">SIZE</td>
                            <td style="padding:8px 12px;font-weight:600;font-size:13px;color:#888;text-align:right;">PRICE</td>
                          </tr>
                          ${itemsRowsHtml}
                        </table>
                        <p style="font-size:18px;font-weight:700;color:#16a34a;margin:0;">Total: PKR ${orderData.total}</p>
                      </div>
                    </div>`;

                    // Send Customer Confirmation Email
                    if (customerEmail) {
                      resend.emails.send({
                        from: `Zord Pakistan <${senderEmail}>`,
                        to: customerEmail,
                        subject: `Order Confirmed — #${orderId}`,
                        html: customerHtml
                      }).then(() => console.log(`📧 Customer email sent to ${customerEmail}`))
                        .catch(err => console.error('Customer email failed:', err));
                    }

                    // Send Admin Notification Email
                    resend.emails.send({
                      from: `Zord Orders <${senderEmail}>`,
                      to: adminEmail,
                      subject: `💰 New Order #${orderId} — PKR ${orderData.total}`,
                      html: adminHtml
                    }).then(() => console.log(`📧 Admin email sent to ${adminEmail}`))
                      .catch(err => console.error('Admin email failed:', err));
                  }
                }
              } catch (emailErr) {
                console.error('Error sending order emails:', emailErr);
              }
            }
          } else if (isFailedEvent) {
            const failureReason = event.data?.failure_reason || event.failure_reason || event.data?.message || 'Payment failed or declined';
            const updates = {
              status: 'Failed',
              paymentStatus: 'Failed',
              failure_reason: failureReason,
              timestamp: new Date().toISOString()
            };
            const firebaseRes = await fetch(`${dbUrl}/orders/${orderId}.json`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updates)
            });
            if (!firebaseRes.ok) {
              console.error('Firebase DB update failure error:', await firebaseRes.text());
            } else {
              console.log(`❌ Order ${orderId} marked as Failed in Firebase. Reason: ${failureReason}`);
            }
          }
        } catch (dbErr) {
          console.error('Error connecting to Firebase REST API:', dbErr);
        }
      }
    }

    res.json({ received: true });

  } catch (err) {
    console.error('Error handling ZionPe webhook:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to handle webhook' });
  }
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export the app for Vercel Serverless Functions
export default app;

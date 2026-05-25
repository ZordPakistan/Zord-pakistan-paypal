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
      webhook_url: 'https://zord-pakistan-paypal1.vercel.app/api/payment/zionpe/webhook',
      customer: {
        name: customer?.name || 'Customer',
        email: customer?.email || 'customer@zordpakistan.shop',
        phone: customer?.phone || '00000000000',
        address: customer?.address || ''
      },
      line_items,
      // Pass all necessary order data in metadata
      metadata: {
        order_id: orderId,
        customer_email: customer?.email || '',
        customer_name: (customer?.name || '').substring(0, 50),
        customer_phone: (customer?.phone || '').substring(0, 20),
        cart_items: JSON.stringify(items || []).substring(0, 500),
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
    const dbUrl = process.env.FIREBASE_DB_URL || 'https://zord-pakistan-default-rtdb.firebaseio.com';
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

// ─── Failed Payment Email Helper ─────────────────────────────────────────────
async function sendFailureAlertEmail({ orderId, orderData, failureReason }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('⚠️ RESEND_API_KEY not set — skipping failure email.');
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const adminEmail = process.env.ADMIN_EMAIL || 'zordofficialpk@gmail.com';
  const senderEmail = process.env.SENDER_EMAIL || 'orders@zordpakistan.shop';
  const customerName = orderData.customer?.name || 'Customer';
  const customerPhone = orderData.customer?.phone || 'N/A';
  const usdAmount = parseFloat((orderData.total / 280).toFixed(2));
  
  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #fee2e2;">
    <div style="background:#dc2626;padding:18px 32px;">
      <h1 style="color:#fff;margin:0;font-size:18px;">❌ Payment Failed Alert — #${orderId}</h1>
    </div>
    <div style="padding:24px 32px;">
      <p style="font-size:16px;color:#333;">A transaction has failed on ZionPe.</p>
      <ul style="list-style:none;padding:0;margin:20px 0;font-size:14px;color:#1a1a1a;">
        <li style="margin-bottom:8px;"><strong>Customer Name:</strong> ${customerName}</li>
        <li style="margin-bottom:8px;"><strong>Phone:</strong> ${customerPhone}</li>
        <li style="margin-bottom:8px;"><strong>Attempted Amount:</strong> $${usdAmount} USD (PKR ${orderData.total})</li>
        <li style="margin-bottom:8px;"><strong>Reason:</strong> ${failureReason}</li>
      </ul>
      <p style="font-size:14px;color:#555;">Please follow up with the customer to assist them.</p>
    </div>
  </div>`;

  try {
    const { data, error } = await resend.emails.send({
      from: `Zord Alerts <${senderEmail}>`,
      to: adminEmail,
      subject: `❌ Payment Failed Alert #${orderId} — $${usdAmount} USD`,
      html
    });
    
    if (error) {
      console.error('❌ Resend API Error (Failed Alert):', error);
    } else {
      console.log(`📧 Failed payment alert sent to ${adminEmail}`, data);
    }
  } catch (err) {
    console.error('Failed payment alert email exception:', err);
  }
}

// ─── Reusable Email Helper ────────────────────────────────────────────────────
async function sendOrderEmails({ orderId, orderData, paymentMethod }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('⚠️  RESEND_API_KEY not set — skipping emails.');
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const adminEmail = process.env.ADMIN_EMAIL || 'zordofficialpk@gmail.com';
  const senderEmail = process.env.SENDER_EMAIL || 'orders@zordpakistan.shop';
  const customerEmail = orderData.customer?.email;
  const customerName = orderData.customer?.name || 'Customer';
  const paymentLabel = paymentMethod || orderData.paymentMethod || 'N/A';
  const paymentStatusLabel = orderData.paymentStatus === 'Paid' ? 'Paid' : 'Pay on Delivery';

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
        <p style="margin:0;font-size:13px;color:#888;">Payment: ${paymentLabel} • ${paymentStatusLabel}</p>
      </div>
      <div style="margin-bottom:24px;">
        <p style="font-size:13px;font-weight:600;color:#888;margin:0 0 4px;">SHIPPING TO</p>
        <p style="font-size:14px;color:#333;margin:0;">${customerName}</p>
        <p style="font-size:14px;color:#333;margin:0;">${orderData.customer?.phone || ''}</p>
        <p style="font-size:14px;color:#333;margin:0;">${orderData.customer?.city ? orderData.customer.city + ', ' : ''}${orderData.customer?.address || 'N/A'}</p>
      </div>
      <p style="font-size:14px;color:#555;">We are preparing your order and will notify you once it ships. If you have any questions, reply to this email.</p>
    </div>
    <div style="background:#f8f8f8;padding:16px 32px;text-align:center;">
      <p style="font-size:12px;color:#aaa;margin:0;">Order #${orderId} • ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <p style="font-size:12px;color:#aaa;margin:4px 0 0;">© Zord Pakistan — zordpakistan.shop</p>
    </div>
  </div>`;

  const isCOD = paymentLabel.toLowerCase().includes('cod') || paymentLabel.toLowerCase().includes('cash');
  const adminBannerColor = isCOD ? '#d97706' : '#16a34a';
  const adminBannerEmoji = isCOD ? '📦' : '💰';
  const adminBannerLabel = isCOD ? 'New COD Order' : 'New Paid Order';

  const adminHtml = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
    <div style="background:${adminBannerColor};padding:18px 32px;">
      <h1 style="color:#fff;margin:0;font-size:18px;">${adminBannerEmoji} ${adminBannerLabel} — #${orderId}</h1>
    </div>
    <div style="padding:24px 32px;">
      <div style="margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:4px 0;vertical-align:top;">
              <p style="font-size:12px;font-weight:600;color:#888;margin:0 0 2px;">CUSTOMER</p>
              <p style="font-size:14px;color:#1a1a1a;margin:0;">${customerName}</p>
            </td>
            <td style="padding:4px 0;vertical-align:top;">
              <p style="font-size:12px;font-weight:600;color:#888;margin:0 0 2px;">EMAIL</p>
              <p style="font-size:14px;color:#1a1a1a;margin:0;">${customerEmail || 'N/A'}</p>
            </td>
            <td style="padding:4px 0;vertical-align:top;">
              <p style="font-size:12px;font-weight:600;color:#888;margin:0 0 2px;">PHONE</p>
              <p style="font-size:14px;color:#1a1a1a;margin:0;">${orderData.customer?.phone || 'N/A'}</p>
            </td>
          </tr>
        </table>
      </div>
      <div style="margin-bottom:20px;">
        <p style="font-size:12px;font-weight:600;color:#888;margin:0 0 2px;">ADDRESS</p>
        <p style="font-size:14px;color:#1a1a1a;margin:0;">${orderData.customer?.city ? orderData.customer.city + ', ' : ''}${orderData.customer?.address || 'N/A'}</p>
      </div>
      <div style="margin-bottom:20px;">
        <p style="font-size:12px;font-weight:600;color:#888;margin:0 0 2px;">PAYMENT</p>
        <p style="font-size:14px;color:#1a1a1a;margin:0;">${paymentLabel} — ${paymentStatusLabel}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr style="background:${isCOD ? '#fffbeb' : '#f0fdf4'};">
          <td style="padding:8px 12px;font-weight:600;font-size:13px;color:#888;">ITEM</td>
          <td style="padding:8px 12px;font-weight:600;font-size:13px;color:#888;text-align:center;">SIZE</td>
          <td style="padding:8px 12px;font-weight:600;font-size:13px;color:#888;text-align:right;">PRICE</td>
        </tr>
        ${itemsRowsHtml}
      </table>
      <p style="font-size:18px;font-weight:700;color:${adminBannerColor};margin:0;">Total: PKR ${orderData.total}</p>
    </div>
  </div>`;

  // Send Customer Email (only if we have their email)
  if (customerEmail) {
    try {
      const { data, error } = await resend.emails.send({
        from: `Zord Pakistan <${senderEmail}>`,
        to: customerEmail,
        subject: `Order Confirmed — #${orderId}`,
        html: customerHtml
      });
      if (error) {
        console.error('❌ Resend API Error (Customer Confirm):', error);
      } else {
        console.log(`📧 Customer email sent to ${customerEmail}`, data);
      }
    } catch (err) {
      console.error('Customer email exception:', err);
    }
  }

  // Send Admin Email
  try {
    const { data, error } = await resend.emails.send({
      from: `Zord Orders <${senderEmail}>`,
      to: adminEmail,
      subject: `${adminBannerEmoji} ${adminBannerLabel} #${orderId} — PKR ${orderData.total}`,
      html: adminHtml
    });
    if (error) {
      console.error('❌ Resend API Error (Admin Confirm):', error);
    } else {
      console.log(`📧 Admin email sent to ${adminEmail}`, data);
    }
  } catch (err) {
    console.error('Admin email exception:', err);
  }
}

// ─── 2. ZionPe Webhook ───────────────────────────────────────────────────────
app.post('/api/payment/zionpe/webhook', async (req, res) => {
  try {
    const event = req.body;
    
    // --- DEBUGGING LOGS ADDED ---
    console.log('===================================================');
    console.log('🚨 WEBHOOK RECEIVED 🚨');
    console.log('Event Type / Event_Type:', event.type || event.event_type || 'Unknown Type');
    console.log('Event Status:', event.status || 'No Status');
    console.log('Headers x-zionpe-signature:', req.headers['x-zionpe-signature'] || 'Missing');
    console.log('Full Webhook Payload (req.body):', JSON.stringify(event, null, 2));
    console.log('===================================================');

    console.log('🔔 Incoming ZionPe Webhook Event:', event.event_type || event.type || event.status, '| Order:', event.data?.order_id || event.order_id);
    
    // Validate webhook securely
    const signature = req.headers['x-zionpe-signature'];
    
    const webhookSecret = process.env.ZIONPE_WEBHOOK_SECRET?.trim();
    
    if (webhookSecret) {
      if (!signature) {
        console.error('❌ Webhook rejected: 401 Missing signature. Make sure ZionPe sends this header.');
        return res.status(401).json({ success: false, message: 'Missing signature' });
      }

      // On Vercel, req.rawBody might be undefined because Vercel parses the body before Express does.
      // In that case, we fallback to stringifying req.body.
      const payload = req.rawBody ? req.rawBody : JSON.stringify(req.body);

      // Compute HMAC SHA256 signature
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      // Compare signatures
      if (signature !== expectedSignature) {
        console.error(`❌ Webhook rejected: 401 Invalid signature. Expected: ${expectedSignature}, Received: ${signature}`);
        return res.status(401).json({ success: false, message: 'Invalid signature' });
      }
    } else {
      console.log('⚠️ WARNING: ZIONPE_WEBHOOK_SECRET is not set. Skipping signature verification.');
    }

    const isSuccessEvent = 
      event.event_type === 'payment.success' || 
      event.type === 'checkout.session.completed' ||
      event.status === 'success' || 
      event.status === 'Paid';

    const isFailedEvent = 
      event.event_type === 'payment.failed' || 
      event.event_type === 'payment_intent.payment_failed' || 
      event.type === 'charge.failed' ||
      event.event_type === 'charge.failed' ||
      event.status === 'failed' || 
      event.status === 'Declined' || 
      event.status === 'declined' ||
      (event.event_type && typeof event.event_type === 'string' && (event.event_type.toLowerCase().includes('fail') || event.event_type.toLowerCase().includes('decline'))) ||
      (event.type && typeof event.type === 'string' && (event.type.toLowerCase().includes('fail') || event.type.toLowerCase().includes('decline'))) ||
      (event.status && typeof event.status === 'string' && (event.status.toLowerCase().includes('fail') || event.status.toLowerCase().includes('decline')));
      
    // Extract metadata carefully from standard or Stripe-like payload
    const metadata = event.data?.object?.metadata || event.metadata || event.data?.metadata || {};
    const orderId = metadata.order_id || metadata.orderId || event.data?.order_id || event.order_id || event.data?.object?.client_reference_id;

    if (orderId) {
      const dbUrl = process.env.FIREBASE_DB_URL || 'https://zord-pakistan-default-rtdb.firebaseio.com';
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
              
              // Fetch full order and send emails
              try {
                const orderRes = await fetch(`${dbUrl}/orders/${orderId}.json`);
                let orderData = null;
                if (orderRes.ok) {
                  orderData = await orderRes.json();
                }

                // If DB fetch fails or is incomplete, reconstruct from metadata
                if (!orderData || !orderData.customer) {
                  console.log('Reconstructing orderData from metadata...');
                  let parsedItems = [];
                  try {
                    parsedItems = JSON.parse(metadata.cart_items || '[]');
                  } catch(e) {}
                  
                  orderData = {
                    ...orderData,
                    id: orderId,
                    total: metadata.total_pkr || 0,
                    paymentStatus: 'Paid',
                    paymentMethod: 'Online Card (ZionPe)',
                    customer: {
                      name: metadata.customer_name || 'Customer',
                      email: metadata.customer_email || '',
                      phone: metadata.customer_phone || ''
                    },
                    items: parsedItems.length ? parsedItems : [{ name: 'Items from Webhook', price: metadata.total_pkr || 0, size: 'N/A' }]
                  };
                }

                if (orderData) {
                  await sendOrderEmails({
                    orderId,
                    orderData,
                    paymentMethod: 'Online Card (ZionPe)'
                  });
                }
              } catch (emailErr) {
                console.error('Error sending order emails:', emailErr);
              }
            }
          } else if (isFailedEvent) {
            const failureReason = event.data?.failure_reason || event.failure_reason || event.data?.message || event.message || event.data?.reason || 'Payment failed or declined';
            const updates = {
              status: 'Payment Failed',
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
              console.log(`❌ Order ${orderId} marked as Payment Failed in Firebase. Reason: ${failureReason}`);
              
              // Fetch full order to get customer details and amount for the alert email
              try {
                const orderRes = await fetch(`${dbUrl}/orders/${orderId}.json`);
                let orderData = null;
                if (orderRes.ok) {
                  orderData = await orderRes.json();
                }

                if (!orderData || !orderData.customer) {
                  console.log('Reconstructing failed orderData from metadata...');
                  orderData = {
                    ...orderData,
                    id: orderId,
                    total: metadata.total_pkr || 0,
                    customer: {
                      name: metadata.customer_name || 'Customer',
                      email: metadata.customer_email || '',
                      phone: metadata.customer_phone || ''
                    }
                  };
                }

                if (orderData) {
                  await sendFailureAlertEmail({ orderId, orderData, failureReason });
                }
              } catch (err) {
                 console.error('Error sending failed payment email alert:', err);
              }
            }
          }
        } catch (dbErr) {
          console.error('Error connecting to Firebase REST API:', dbErr);
        }
      } else {
        console.error('❌ FIREBASE_DB_URL is not configured. Skipping webhook database and email actions.');
      }
    } else {
      console.error('⚠️ Could not extract orderId from webhook metadata.');
    }

    res.json({ received: true });

  } catch (err) {
    console.error('❌ Webhook rejected: 500 Internal Server Error handling ZionPe webhook:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to handle webhook' });
  }
});

// ─── 3. COD Order Email Notification ─────────────────────────────────────────
app.post('/api/order/notify', async (req, res) => {
  console.log('📨 /api/order/notify hit — orderId:', req.body?.orderId);
  try {
    const { orderId, orderData } = req.body;

    if (!orderId || !orderData) {
      console.error('❌ /api/order/notify — Missing orderId or orderData');
      return res.status(400).json({ error: 'Missing orderId or orderData' });
    }

    console.log('📧 Sending emails for order', orderId, '| RESEND_API_KEY set:', !!process.env.RESEND_API_KEY);

    await sendOrderEmails({
      orderId,
      orderData,
      paymentMethod: orderData.paymentMethod || 'Cash on Delivery (COD)'
    });

    console.log('✅ /api/order/notify — emails sent successfully for', orderId);
    res.json({ success: true, message: 'Notification emails sent.' });

  } catch (err) {
    console.error('❌ Error in /api/order/notify:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to send notification emails' });
  }
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export the app for Vercel Serverless Functions
export default app;


import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import crypto from 'crypto';

dotenv.config();

const app = express();

// Enable open CORS for all domains to prevent preflight OPTIONS failures
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

const PORT = process.env.PORT || 3001;

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

    // Assuming ZionPe expects amount, currency, success_url, cancel_url, customer_email
    // Note: This payload is an assumption based on standard payment gateways like Stripe/Paymob.
    const payload = {
      site_key: process.env.ZIONPE_SITE_KEY, // ADDED: ZionPe requires a site_key
      amount: parseFloat(amount),
      currency: 'PKR',
      order_id: orderId,
      success_url: `${req.headers.origin || 'https://zordpakistan.shop'}/order-success`,
      cancel_url: `${req.headers.origin || 'https://zordpakistan.shop'}/cart`,
      customer: {
        name: customer?.name || 'Customer',
        email: customer?.email || 'customer@zordpakistan.shop',
        phone: customer?.phone || '00000000000',
        address: customer?.address || ''
      },
      // Serialize full order data into metadata so the webhook can reconstruct the order
      metadata: {
        orderId,
        items: JSON.stringify(items || []),
        customer: JSON.stringify(customer || {}),
        total: parseFloat(amount)
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
    const orderId = event.data?.order_id || event.order_id || event.metadata?.orderId;

    if (isSuccessEvent && orderId) {
      const dbUrl = process.env.FIREBASE_DB_URL;
      if (dbUrl) {
        try {
          // Extract and parse the full order data from metadata (set during session creation)
          const metadata = event.metadata || event.data?.metadata || {};
          let items = [];
          let customer = {};
          let total = event.amount || event.data?.amount || 0;

          try { items = JSON.parse(metadata.items || '[]'); } catch (_) { items = []; }
          try { customer = JSON.parse(metadata.customer || '{}'); } catch (_) { customer = {}; }
          if (metadata.total) total = parseFloat(metadata.total);

          // Build the complete, confirmed order object
          const confirmedOrder = {
            id: orderId,
            items,
            total,
            customer,
            status: 'Processing',
            paymentMethod: 'Online Card (ZionPe)',
            paymentStatus: 'Paid',
            timestamp: new Date().toISOString()
          };

          // Use PUT to create the full order document in Firebase
          const firebaseRes = await fetch(`${dbUrl}/orders/${orderId}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(confirmedOrder)
          });

          if (!firebaseRes.ok) {
            console.error('Firebase DB create order error:', await firebaseRes.text());
          } else {
            console.log(`✅ Order ${orderId} successfully created in Firebase after ZionPe payment.`);
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

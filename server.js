import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const app = express();

// Enable open CORS for all domains to prevent preflight OPTIONS failures
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const PORT = process.env.PORT || 3001;

// ZionPe configurations
const ZIONPE_API_KEY = process.env.ZIONPE_API_KEY;
const ZIONPE_WEBHOOK_SECRET = process.env.ZIONPE_WEBHOOK_SECRET;

// 1. Create ZionPe Checkout Session
app.post('/api/payment/zionpe/create-session', async (req, res) => {
  try {
    const { orderId, amount, customer, items } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({ error: 'Missing orderId or amount' });
    }

    if (!ZIONPE_API_KEY) {
      throw new Error('ZIONPE_API_KEY is not configured in environment variables.');
    }

    // Assuming ZionPe expects amount, currency, success_url, cancel_url, customer_email
    // Note: This payload is an assumption based on standard payment gateways like Stripe/Paymob.
    const payload = {
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
      metadata: { orderId }
    };

    const sessionRes = await fetch('https://zionpe.com/api/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ZIONPE_API_KEY}`,
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
    
    // Validate webhook if a secret is provided
    // This is a placeholder validation logic, adapt to ZionPe's actual webhook verification method
    const signature = req.headers['x-zionpe-signature'];
    
    // Typically you'd check:
    // if (ZIONPE_WEBHOOK_SECRET && !isValidSignature(payload, signature, secret)) return res.status(401);

    // Assuming the event structure has { event_type: 'payment.success', data: { order_id: '...' } }
    // We handle success cases to update Firebase
    const isSuccessEvent = event.event_type === 'payment.success' || event.status === 'success' || event.status === 'Paid';
    const orderId = event.data?.order_id || event.order_id || event.metadata?.orderId;

    if (isSuccessEvent && orderId) {
      // Update order status in Firebase database via REST API
      const dbUrl = process.env.FIREBASE_DB_URL;
      if (dbUrl) {
        try {
          const firebaseRes = await fetch(`${dbUrl}/orders/${orderId}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentStatus: 'Paid',
              status: 'Processing',
              paymentMethod: 'Credit/Debit Card (ZionPe)'
            })
          });

          if (!firebaseRes.ok) {
            console.error('Firebase DB update error:', await firebaseRes.text());
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

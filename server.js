import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const app = express();

// Set up restricted CORS for production and local development
const allowedOrigins = [
  process.env.SITE_URL, // e.g., https://zordpakistan.shop
  'http://localhost:5173', // Local Vite development
  'http://127.0.0.1:5173'
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

const PORT = process.env.PORT || 3001;

// PayPal configurations
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_EXCHANGE_RATE = parseFloat(process.env.PAYPAL_EXCHANGE_RATE || '280');

const PAYPAL_API_BASE = PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

/**
 * Generate Access Token from PayPal REST API
 */
async function getPayPalAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal client credentials are not configured in environment variables.');
  }

  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  
  const tokenRes = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Failed to obtain PayPal access token: ${errText}`);
  }

  const data = await tokenRes.json();
  return data.access_token;
}

// 1. Create PayPal Order
app.post('/api/payment/paypal/create-order', async (req, res) => {
  try {
    const { orderId, amount } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({ error: 'Missing orderId or amount' });
    }

    // Convert PKR to USD as PayPal does not support PKR
    const amountUSD = (parseFloat(amount) / PAYPAL_EXCHANGE_RATE).toFixed(2);

    const accessToken = await getPayPalAccessToken();

    const orderRes = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: orderId,
            description: `ZORD Footwear Order ${orderId}`,
            amount: {
              currency_code: 'USD',
              value: amountUSD
            }
          }
        ]
      })
    });

    if (!orderRes.ok) {
      const errText = await orderRes.text();
      throw new Error(`PayPal order creation failed: ${errText}`);
    }

    const orderData = await orderRes.json();
    res.json({ id: orderData.id });

  } catch (err) {
    console.error('Error creating PayPal order:', err);
    res.status(500).json({ error: err.message || 'Failed to create PayPal order' });
  }
});

// 2. Capture PayPal Order and Sync with Firebase
app.post('/api/payment/paypal/capture-order', async (req, res) => {
  try {
    const { paypalOrderId, orderId } = req.body;

    if (!paypalOrderId || !orderId) {
      return res.status(400).json({ error: 'Missing paypalOrderId or orderId' });
    }

    const accessToken = await getPayPalAccessToken();

    const captureRes = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!captureRes.ok) {
      const errText = await captureRes.text();
      throw new Error(`PayPal order capture failed: ${errText}`);
    }

    const captureData = await captureRes.json();

    if (captureData.status === 'COMPLETED') {
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
              paypalOrderId: paypalOrderId
            })
          });

          if (!firebaseRes.ok) {
            console.error('Firebase DB update error:', await firebaseRes.text());
          }
        } catch (dbErr) {
          console.error('Error connecting to Firebase REST API:', dbErr);
        }
      }

      res.json({ success: true });
    } else {
      res.status(400).json({ error: `Payment was not completed. Status: ${captureData.status}` });
    }

  } catch (err) {
    console.error('Error capturing PayPal order:', err);
    res.status(500).json({ error: err.message || 'Failed to capture PayPal order' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

/**
 * ZORD Footwear — Payment Service (Frontend)
 * ------------------------------------------
 * Calls our secure backend (/api/payment/paypal/*).
 * The PayPal Client Secret is NEVER exposed here.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'https://zord-pakistan-paypal-1pav.vercel.app';

/**
 * Call the backend to create a PayPal order.
 * 
 * @param {Object} params
 * @param {string} params.orderId - Internal order ID
 * @param {number} params.amount  - PKR amount to be converted
 * @returns {Promise<{id?: string, error?: string}>}
 */
export async function createPayPalOrder({ orderId, amount }) {
  try {
    const res = await fetch(`${API_BASE}/api/payment/paypal/create-order`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ orderId, amount })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Full Server Error:", errorText, "Status:", res.status);
      return { error: `Server Error ${res.status}: ${errorText}` };
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.error("Full Server Error:", err);
    return { error: 'Could not connect to the payment server. Please check your internet connection.' };
  }
}

/**
 * Call the backend to capture a PayPal order after authorization.
 * 
 * @param {Object} params
 * @param {string} params.paypalOrderId - PayPal order ID to capture
 * @param {string} params.orderId       - Internal order ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function capturePayPalOrder({ paypalOrderId, orderId }) {
  try {
    const res = await fetch(`${API_BASE}/api/payment/paypal/capture-order`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ paypalOrderId, orderId })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Full Server Error:", errorText, "Status:", res.status);
      return { success: false, error: `Server Error ${res.status}: ${errorText}` };
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.error("Full Server Error:", err);
    return { success: false, error: err.message };
  }
}


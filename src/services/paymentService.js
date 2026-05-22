/**
 * ZORD Footwear — Payment Service (Frontend)
 * ------------------------------------------
 * Calls our secure backend (/api/payment/zionpe/*).
 * The ZionPe API Key is NEVER exposed here.
 */

const API_BASE = import.meta.env.DEV 
  ? 'http://localhost:3001' 
  : import.meta.env.VITE_API_URL || 'https://zord-pakistan-paypal1.vercel.app';

/**
 * Call the backend to create a ZionPe session.
 * 
 * @param {Object} params
 * @param {string} params.orderId - Internal order ID
 * @param {number} params.amount  - PKR amount
 * @param {Object} params.customer - Customer information
 * @param {Array} params.items - Cart items
 * @returns {Promise<{checkout_url?: string, error?: string}>}
 */
export async function createZionPeSession({ orderId, amount, customer, items }) {
  try {
    const res = await fetch(`${API_BASE}/api/payment/zionpe/create-session`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ orderId, amount, customer, items })
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

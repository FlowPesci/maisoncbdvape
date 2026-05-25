/**
 * functions/_shared/viva.js
 * Smart Checkout Viva Wallet — fetch direct (Web standard).
 */

function hosts(env) {
  const isLive = (env.VIVA_ENV || "demo").toLowerCase() === "live";
  return isLive
    ? { api: "https://api.vivapayments.com",      web: "https://www.vivapayments.com" }
    : { api: "https://demo-api.vivapayments.com", web: "https://demo.vivapayments.com" };
}

function authHeader(env) {
  const id  = env.VIVA_MERCHANT_ID;
  const key = env.VIVA_API_KEY;
  if (!id || !key) throw new Error("VIVA_MERCHANT_ID / VIVA_API_KEY manquants");
  // btoa() est dispo dans Workers (Web Standards), pas Buffer
  const token = btoa(`${id}:${key}`);
  return { Authorization: `Basic ${token}` };
}

export async function createCheckoutOrder(env, {
  amountCents, merchantTrns, customerTrns, customer, successUrl, failureUrl,
}) {
  const sourceCode = env.VIVA_SOURCE_CODE;
  if (!sourceCode) throw new Error("VIVA_SOURCE_CODE manquant");

  const body = {
    amount: amountCents,
    customerTrns, merchantTrns, customer,
    paymentTimeout: 1800,
    preauth: false, allowRecurring: false,
    sourceCode,
    successUrl, failureUrl,
    requestLang: customer?.requestLang || "fr-FR",
    disableExactAmount: false, disableCash: true, disableWallet: false,
  };

  const { api, web } = hosts(env);
  const res = await fetch(`${api}/checkout/v2/orders`, {
    method: "POST",
    headers: { ...authHeader(env), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Viva createCheckoutOrder (${res.status}) : ${txt}`);
  }
  const data = await res.json();
  const orderCode = String(data.orderCode);
  return { orderCode, checkoutUrl: `${web}/web/checkout?ref=${orderCode}` };
}

export async function getTransaction(env, transactionId) {
  const { api } = hosts(env);
  const res = await fetch(`${api}/checkout/v2/transactions/${transactionId}`, {
    method: "GET",
    headers: { ...authHeader(env), Accept: "application/json" },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Viva getTransaction (${res.status}) : ${txt}`);
  }
  return await res.json();
}

export function webhookKey(env) {
  return env.VIVA_WEBHOOK_KEY || null;
}

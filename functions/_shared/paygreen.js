/**
 * functions/_shared/paygreen.js
 * Intégration PayGreen v3 — Cloudflare Pages Functions
 *
 * Auth : JWT Bearer token (valable 10 min) obtenu via l'Auth API
 * Flow : createPaymentOrder() → redirect vers hosted_payment_url
 *        → retour sur paygreen-callback.js
 *        → confirmation asynchrone via paygreen-webhook.js
 */

function apiBase(env) {
  const isSandbox = (env.PAYGREEN_ENV || "sandbox").toLowerCase() === "sandbox";
  return isSandbox ? "https://sb-api.paygreen.fr" : "https://api.paygreen.fr";
}

/**
 * Obtenir un JWT Bearer token depuis l'Auth API PayGreen.
 * Le token est valable ~10 minutes — on le récupère à chaque appel
 * (les Workers ont une durée de vie très courte, pas besoin de cache partagé).
 */
async function getAuthToken(env) {
  const base = apiBase(env);
  const shopId    = env.PAYGREEN_SHOP_ID;
  const secretKey = env.PAYGREEN_SECRET_KEY;

  if (!shopId || !secretKey) {
    throw new Error("PAYGREEN_SHOP_ID / PAYGREEN_SECRET_KEY manquants");
  }

  // Endpoint réel : POST /auth/authentication/{shopId}/secret-key
  // La secret key va dans le header Authorization (sans préfixe)
  const res = await fetch(`${base}/auth/authentication/${shopId}/secret-key`, {
    method: "POST",
    headers: { Authorization: secretKey },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`PayGreen Auth (${res.status}) : ${txt}`);
  }

  const json = await res.json();
  const token = json?.data?.token;
  if (!token) throw new Error("PayGreen Auth : token manquant dans la réponse");
  return token;
}

/**
 * Créer un Payment Order PayGreen et retourner l'URL de paiement hébergée.
 *
 * @param {object} env - Variables d'environnement Cloudflare
 * @param {object} params
 * @param {number}  params.amountCents   - Montant en centimes (ex: 4990 pour 49,90 €)
 * @param {string}  params.reference     - Ton ID de commande interne
 * @param {string}  params.description   - Description affichée au client
 * @param {object}  params.buyer         - { email, firstName, lastName }
 * @param {string}  params.returnUrl     - URL de retour après paiement réussi
 * @param {string}  params.cancelUrl     - URL de retour après annulation
 * @returns {{ paymentOrderId: string, hostedPaymentUrl: string }}
 */
export async function createPaymentOrder(env, {
  amountCents, reference, description, buyer, returnUrl, cancelUrl,
}) {
  const base  = apiBase(env);
  const token = await getAuthToken(env);

  const body = {
    amount:      amountCents,
    currency:    "eur",
    mode:        "instant",
    reference,
    description: description || "Commande MaisonCBDVape",
    buyer: {
      email:      buyer.email,
      first_name: buyer.firstName,
      last_name:  buyer.lastName,
    },
    return_url: returnUrl,
    cancel_url: cancelUrl,
    ttl:        1800, // 30 min
  };

  const res = await fetch(`${base}/payment/payment-orders`, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept:         "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`PayGreen createPaymentOrder (${res.status}) : ${txt}`);
  }

  const json = await res.json();
  const data = json?.data;

  const paymentOrderId  = data?.id;
  const hostedPaymentUrl = data?.hosted_payment_url;

  if (!paymentOrderId || !hostedPaymentUrl) {
    throw new Error("PayGreen : réponse inattendue — " + JSON.stringify(json));
  }

  return { paymentOrderId, hostedPaymentUrl };
}

/**
 * Récupérer les détails d'un Payment Order (pour vérifier le statut après callback).
 *
 * @param {object} env
 * @param {string} paymentOrderId - ID PayGreen (po_...)
 * @returns {object} Payment Order complet
 */
export async function getPaymentOrder(env, paymentOrderId) {
  const base  = apiBase(env);
  const token = await getAuthToken(env);

  const res = await fetch(`${base}/payment/payment-orders/${paymentOrderId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept:        "application/json",
    },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`PayGreen getPaymentOrder (${res.status}) : ${txt}`);
  }

  const json = await res.json();
  return json?.data;
}

/**
 * Vérifier la signature HMAC SHA-256 d'un webhook PayGreen.
 * PayGreen envoie : header "signature" = base64(hmac-sha256(body, hmacKey))
 *
 * @param {string} rawBody   - Corps de la requête (texte brut, pas parsé)
 * @param {string} signature - Valeur du header "signature"
 * @param {string} hmacKey   - HMAC key du Listener PayGreen
 * @returns {boolean}
 */
export async function verifyWebhookSignature(rawBody, signature, hmacKey) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(hmacKey);
  const msgData = encoder.encode(rawBody);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData,
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const computedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

  return computedSignature === signature;
}

/**
 * Indique si un Payment Order est considéré comme payé.
 * Statuts PayGreen : "pending", "authorized", "partial_authorized",
 *                   "canceled", "expired", "refunded"
 */
export function isOrderPaid(paymentOrder) {
  return paymentOrder?.status === "authorized";
}

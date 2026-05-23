/**
 * netlify/functions/_shared/templates.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Templates HTML + texte des emails transactionnels VapeLab.
 *
 * 5 modèles disponibles :
 *  - reservationClient(order)        → confirmation Click & Collect au client
 *  - reservationMerchant(order)      → notification commerçant nouvelle commande
 *  - paiementClient(order)           → confirmation paiement reçu (Viva)
 *  - paiementMerchant(order)         → notification commerçant paiement reçu
 *  - readyClient(order)              → "votre commande est prête à être récupérée"
 *
 * Chaque fonction retourne { subject, html, text }.
 * Style email : compatible clients mail (inline styles, pas de Tailwind).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const formatEur = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

// Couleurs VapeLab en inline (les clients email ne supportent pas <link rel="stylesheet">)
const C = {
  bg:    "#0A0A0F",
  card:  "#12121A",
  border:"#1E1E2E",
  green: "#39FF14",
  violet:"#BF5FFF",
  blue:  "#00D4FF",
  smoke: "#8A8A9A",
  white: "#FFFFFF",
  warning:"#FF6020",
};

/** Layout commun à tous les emails. */
function shell({ preheader, title, intro, body, cta, footer }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<!-- Preheader (caché, juste pour l'aperçu inbox) -->
<div style="display:none;font-size:1px;color:#fefefe;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader || "")}</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f8;padding:24px 12px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 6px 30px rgba(10,10,15,0.08);">

      <!-- Header sombre VapeLab -->
      <tr><td style="background:${C.bg};padding:24px;text-align:center;">
        <div style="display:inline-block;background:linear-gradient(135deg,${C.green},${C.violet});width:38px;height:38px;border-radius:8px;line-height:38px;color:${C.bg};font-weight:bold;font-size:18px;">VL</div>
        <div style="color:${C.white};font-family:'Bebas Neue',Impact,sans-serif;font-size:22px;letter-spacing:3px;margin-top:8px;">VAPELAB</div>
        <div style="color:${C.smoke};font-size:11px;letter-spacing:4px;text-transform:uppercase;font-family:monospace;">CBD &amp; Vape</div>
      </td></tr>

      <!-- Titre -->
      <tr><td style="padding:32px 32px 8px;">
        <h1 style="margin:0;color:#0A0A0F;font-size:24px;line-height:1.2;">${title}</h1>
      </td></tr>

      <!-- Intro -->
      ${intro ? `<tr><td style="padding:8px 32px 0;color:#444;font-size:15px;line-height:1.6;">${intro}</td></tr>` : ""}

      <!-- Body -->
      <tr><td style="padding:24px 32px;">${body}</td></tr>

      ${cta ? `<tr><td style="padding:0 32px 32px;">${cta}</td></tr>` : ""}

      <!-- Footer -->
      <tr><td style="background:#fafafa;padding:20px 32px;text-align:center;font-size:12px;color:#888;border-top:1px solid #eee;">
        ${footer || "VapeLab — 48 Rue de Genève, 01170 Gex, France"}
      </td></tr>
    </table>

    <p style="color:#aaa;font-size:11px;margin:16px 0 0;">© VapeLab · Cet email vous est envoyé suite à une commande sur notre site.</p>
  </td></tr>
</table>
</body>
</html>`;
}

/** Tableau récap des items (HTML). */
function itemsTableHtml(order) {
  const rows = order.items.map((it) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;color:#333;">${it.qty} × ${escapeHtml(it.nom)}<br/><span style="color:#888;font-size:12px;">${escapeHtml(it.marque || "")}</span></td>
      <td style="padding:10px 0;border-bottom:1px solid #eee;font-family:monospace;font-size:14px;text-align:right;color:#333;">${formatEur(it.prix * it.qty)}</td>
    </tr>
  `).join("");

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><td style="padding-top:14px;color:#888;font-size:13px;">Sous-total HT</td><td style="padding-top:14px;text-align:right;font-family:monospace;font-size:13px;color:#888;">${formatEur(order.totalHT)}</td></tr>
      <tr><td style="color:#888;font-size:13px;">TVA (20 %)</td><td style="text-align:right;font-family:monospace;font-size:13px;color:#888;">${formatEur(order.totalTVA)}</td></tr>
      <tr><td style="padding-top:8px;border-top:2px solid #0A0A0F;font-size:16px;font-weight:bold;color:#0A0A0F;">TOTAL TTC</td><td style="padding-top:8px;border-top:2px solid #0A0A0F;text-align:right;font-family:monospace;font-size:18px;font-weight:bold;color:${C.green};">${formatEur(order.totalTTC)}</td></tr>
    </tfoot>
  </table>`;
}

function infoBox(label, value, color = C.green) {
  return `<div style="background:#f7f7fa;border-left:4px solid ${color};padding:14px 16px;border-radius:6px;margin:8px 0;">
    <div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-family:monospace;">${escapeHtml(label)}</div>
    <div style="color:#0A0A0F;font-size:15px;margin-top:4px;font-weight:500;">${value}</div>
  </div>`;
}

function ctaButton(label, url, color = C.green) {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td style="border-radius:8px;background:${color};">
    <a href="${url}" style="display:inline-block;padding:12px 28px;color:#0A0A0F;font-weight:bold;text-decoration:none;font-size:14px;letter-spacing:1px;text-transform:uppercase;">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates publics
// ─────────────────────────────────────────────────────────────────────────────

/** Confirmation Click & Collect → client */
export function reservationClient(order) {
  const isLiv = order.modeLivraison === "livraison";
  const subject = isLiv
    ? `Commande confirmée — ${order.orderId}`
    : `Réservation confirmée — ${order.orderId}`;
  const livraisonBlock = isLiv
    ? infoBox("Livraison", `📦 Expédition Colissimo à :<br/>${escapeHtml(order.adresseLivraison.adresse)}<br/>${escapeHtml(order.adresseLivraison.codePostal)} ${escapeHtml(order.adresseLivraison.ville)}<br/><span style="color:#666;font-size:13px;">Délai estimé : 2 à 4 jours ouvrés</span>`, C.violet)
    : infoBox("Retrait prévu", `📅 ${order.creneauRetrait.date} à partir de <strong>${order.creneauRetrait.heure}</strong><br/>📍 48 Rue de Genève, 01170 Gex`, C.violet);
  const fraisLine = isLiv && order.fraisPort > 0
    ? `<p style="color:#666;font-size:13px;margin-top:4px;">+ Frais de port : ${formatEur(order.fraisPort)}</p>` : "";
  const paymentNote = isLiv
    ? `Vous réglerez <strong>${formatEur(order.totalTTC)}</strong> lors de la livraison ou en ligne.`
    : `Vous réglerez <strong>${formatEur(order.totalTTC)}</strong> en boutique le jour du retrait (CB, espèces, sans contact).`;
  const html = shell({
    preheader: `Votre commande ${order.orderId} est enregistrée.`,
    title: isLiv ? "Commande confirmée 🎉" : "Réservation confirmée 🎉",
    intro: `<p>Bonjour <strong>${escapeHtml(order.client.nom)}</strong>,</p><p>${isLiv ? "Votre commande est enregistrée. Nous préparons votre colis." : "Votre commande est bien enregistrée. Nous la préparons et vous attendrons à la boutique."}</p>`,
    body: `
      ${infoBox("Numéro de commande", `<span style="font-family:monospace;">${order.orderId}</span>`)}
      ${livraisonBlock}
      <h3 style="font-size:14px;color:#0A0A0F;margin:24px 0 8px;text-transform:uppercase;letter-spacing:1px;">Récapitulatif</h3>
      ${itemsTableHtml(order)}
      ${fraisLine}
      <p style="margin-top:20px;color:#666;font-size:13px;">${paymentNote}</p>
    `,
    footer: "Question ? Répondez à cet email — l'équipe VapeLab.",
  });
  const livText = isLiv
    ? `Livraison Colissimo à : ${order.adresseLivraison.adresse}, ${order.adresseLivraison.codePostal} ${order.adresseLivraison.ville}`
    : `Retrait : ${order.creneauRetrait.date} à partir de ${order.creneauRetrait.heure}
Adresse : VapeLab, 48 Rue de Genève, 01170 Gex`;
  const text = `Bonjour ${order.client.nom},

Votre commande ${order.orderId} est enregistrée.

${livText}

Récapitulatif :
${order.items.map((it) => `- ${it.qty} × ${it.nom} — ${formatEur(it.prix * it.qty)}`).join("\n")}

Total : ${formatEur(order.totalTTC)}

À bientôt !`;
  return { subject, html, text };
}

/** Notification nouvelle commande → commerçant */
export function reservationMerchant(order, siteUrl = "https://vapelab.fr") {
  const isLiv = order.modeLivraison === "livraison";
  const subject = isLiv
    ? `🚚 Nouvelle commande Livraison — ${order.orderId}`
    : `🆕 Nouvelle réservation Click & Collect — ${order.orderId}`;
  const livraisonBlock = isLiv
    ? infoBox("Livraison à expédier", `📦 ${escapeHtml(order.adresseLivraison.adresse)}<br/>${escapeHtml(order.adresseLivraison.codePostal)} ${escapeHtml(order.adresseLivraison.ville)}`, C.blue)
    : infoBox("Retrait demandé", `📅 ${order.creneauRetrait.date} — ${order.creneauRetrait.heure}`, C.blue);
  const paymentNote = isLiv
    ? `📦 À expédier par Colissimo — frais de port : ${order.fraisPort > 0 ? formatEur(order.fraisPort) : "Gratuit"}`
    : `⚠️ Paiement en boutique — encaissez ${formatEur(order.totalTTC)} au moment du retrait.`;
  const html = shell({
    preheader: `${order.client.nom} — ${formatEur(order.totalTTC)} — ${isLiv ? "Livraison" : "Click & Collect"}`,
    title: isLiv ? "Nouvelle commande Livraison 🚚" : "Nouvelle réservation Click & Collect 🆕",
    intro: `<p>${isLiv ? "Une commande avec livraison à domicile vient d'être enregistrée." : "Une nouvelle commande Click &amp; Collect vient d'être enregistrée."}</p>`,
    body: `
      ${infoBox("Commande", `<strong>${order.orderId}</strong> — ${formatEur(order.totalTTC)}`)}
      ${infoBox("Client", `${escapeHtml(order.client.nom)}<br/>📞 ${escapeHtml(order.client.telephone)}<br/>✉️ ${escapeHtml(order.client.email)}${order.client.notes ? "<br/>📝 " + escapeHtml(order.client.notes) : ""}`, C.violet)}
      ${livraisonBlock}
      <h3 style="font-size:14px;color:#0A0A0F;margin:24px 0 8px;text-transform:uppercase;letter-spacing:1px;">Articles</h3>
      ${itemsTableHtml(order)}
      <p style="color:${C.warning};font-size:13px;margin-top:20px;">${paymentNote}</p>
    `,
    cta: ctaButton("Ouvrir le back-office", `${siteUrl}/admin/commande/?id=${encodeURIComponent(order.orderId)}`, C.green),
  });
  const modeTxt = isLiv
    ? `Livraison : ${order.adresseLivraison.adresse}, ${order.adresseLivraison.codePostal} ${order.adresseLivraison.ville}`
    : `Retrait : ${order.creneauRetrait.date} à ${order.creneauRetrait.heure}`;
  const text = `${subject}
Client : ${order.client.nom} (${order.client.email}, ${order.client.telephone})
Notes : ${order.client.notes || "—"}
${modeTxt}

Articles :
${order.items.map((it) => `- ${it.qty} × ${it.nom} (${formatEur(it.prix * it.qty)})`).join("\n")}

Total : ${formatEur(order.totalTTC)}

Back-office : ${siteUrl}/admin/commande/?id=${encodeURIComponent(order.orderId)}`;
  return { subject, html, text };
}

/** Confirmation paiement Viva → client */
export function paiementClient(order) {
  const subject = `Paiement confirmé — ${order.orderId}`;
  const html = shell({
    preheader: `Votre paiement de ${formatEur(order.totalTTC)} est validé. Préparation en cours.`,
    title: "Paiement confirmé ✅",
    intro: `<p>Bonjour <strong>${escapeHtml(order.client.nom)}</strong>,</p><p>Votre paiement est validé. Nous préparons votre commande, vous recevrez un nouvel email dès qu'elle sera prête à être récupérée (sous 24 h ouvrées).</p>`,
    body: `
      ${infoBox("Commande", `<span style="font-family:monospace;">${order.orderId}</span>`)}
      ${infoBox("Montant payé", `<strong style="color:${C.green};">${formatEur(order.totalTTC)}</strong>`, C.green)}
      ${infoBox("Retrait prévu", `📅 ${order.creneauRetrait.date} à partir de <strong>${order.creneauRetrait.heure}</strong><br/>📍 48 Rue de Genève, 01170 Gex`, C.violet)}
      <h3 style="font-size:14px;color:#0A0A0F;margin:24px 0 8px;text-transform:uppercase;letter-spacing:1px;">Récapitulatif</h3>
      ${itemsTableHtml(order)}
    `,
    footer: "Cette commande sera disponible dès notification.",
  });
  const text = `Bonjour ${order.client.nom},

Votre paiement de ${formatEur(order.totalTTC)} pour la commande ${order.orderId} est validé.

Retrait prévu : ${order.creneauRetrait.date} à partir de ${order.creneauRetrait.heure}
Adresse : VapeLab, 48 Rue de Genève, 01170 Gex

Vous recevrez un email dès que la commande sera prête à être récupérée.

À bientôt !`;
  return { subject, html, text };
}

/** Notification paiement reçu → commerçant */
export function paiementMerchant(order, siteUrl = "https://vapelab.fr") {
  const subject = `💰 Paiement reçu — ${order.orderId} (${formatEur(order.totalTTC)})`;
  const html = shell({
    preheader: `${order.client.nom} a payé ${formatEur(order.totalTTC)} en ligne — commande à préparer`,
    title: "Paiement reçu 💰",
    intro: `<p>Une commande vient d'être payée en ligne via Viva Wallet.</p>`,
    body: `
      ${infoBox("Commande", `<strong>${order.orderId}</strong> — <span style="color:${C.green};font-weight:bold;">${formatEur(order.totalTTC)}</span> payés`)}
      ${infoBox("Client", `${escapeHtml(order.client.nom)}<br/>📞 ${escapeHtml(order.client.telephone)}<br/>✉️ ${escapeHtml(order.client.email)}`, C.violet)}
      ${infoBox("Retrait demandé", `📅 ${order.creneauRetrait.date} — ${order.creneauRetrait.heure}`, C.blue)}
      <h3 style="font-size:14px;color:#0A0A0F;margin:24px 0 8px;text-transform:uppercase;letter-spacing:1px;">À préparer</h3>
      ${itemsTableHtml(order)}
    `,
    cta: ctaButton("Ouvrir le back-office", `${siteUrl}/admin/commande/?id=${encodeURIComponent(order.orderId)}`, C.green),
  });
  return { subject, html, text: `Paiement reçu : ${order.orderId} — ${formatEur(order.totalTTC)}\nClient : ${order.client.nom} (${order.client.email})\nRetrait : ${order.creneauRetrait.date} à ${order.creneauRetrait.heure}` };
}

/** "Votre commande est prête" → client (envoyé quand statut → ready) */
export function readyClient(order) {
  const isPaid = order.paiement?.methode === "viva-wallet";
  const isLiv = order.modeLivraison === "livraison";
  const subject = `Votre commande est prête — ${order.orderId}`;
  const livraisonBlock = isLiv
    ? infoBox("Livraison", `📦 Votre colis est en cours d'expédition Colissimo.<br/>${escapeHtml(order.adresseLivraison?.adresse || "")}<br/>${escapeHtml(order.adresseLivraison?.codePostal || "")} ${escapeHtml(order.adresseLivraison?.ville || "")}`, C.violet)
    : infoBox("Retrait en boutique", `📍 VapeLab, 48 Rue de Genève, 01170 Gex<br/>📅 Créneau prévu : ${order.creneauRetrait?.date || "—"} à partir de <strong>${order.creneauRetrait?.heure || "—"}</strong>`, C.violet);
  const html = shell({
    preheader: isLiv ? `Votre colis est expédié — commande ${order.orderId}` : `Vous pouvez venir récupérer votre commande en boutique.`,
    title: isLiv ? "Votre commande est expédiée ! 📦" : "Votre commande est prête ! 🎁",
    intro: `<p>Bonjour <strong>${escapeHtml(order.client.nom)}</strong>,</p><p>${isLiv ? "Votre commande a été expédiée par Colissimo." : "Votre commande est prête à être récupérée à la boutique."}</p>`,
    body: `
      ${infoBox("Numéro de commande", `<span style="font-family:monospace;">${order.orderId}</span>`)}
      ${livraisonBlock}
      ${infoBox("Total", `${formatEur(order.totalTTC)}<br/><span style="color:#666;font-size:13px;">${isPaid ? "✓ Déjà réglé en ligne" : "À régler en boutique (CB, espèces, sans contact)"}</span>`, C.green)}
      <p style="color:#666;font-size:13px;margin-top:16px;">${isLiv ? "Délai estimé : 2 à 4 jours ouvrés." : "Présentez votre numéro de commande à votre arrivée. À tout de suite !"}</p>
    `,
  });
  const livraisonText = isLiv
    ? `Expédié par Colissimo à : ${order.adresseLivraison?.adresse || ""}, ${order.adresseLivraison?.codePostal || ""} ${order.adresseLivraison?.ville || ""}`
    : `Retrait : VapeLab, 48 Rue de Genève, 01170 Gex\nCréneau : ${order.creneauRetrait?.date || "—"} à partir de ${order.creneauRetrait?.heure || "—"}`;
  const text = `Bonjour ${order.client.nom},

Votre commande ${order.orderId} est ${isLiv ? "expédiée" : "prête à être récupérée"}.

${livraisonText}
Total ${isPaid ? "déjà payé" : "à régler en boutique"} : ${formatEur(order.totalTTC)}

À très vite !`;
  return { subject, html, text };
}

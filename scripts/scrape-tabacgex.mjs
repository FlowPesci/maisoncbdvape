/**
 * scrape-tabacgex.mjs
 * Extrait les produits de tabacgex.fr et les injecte dans src/data-source/produits.json
 *
 * Usage :
 *   node scripts/scrape-tabacgex.mjs                    (scrape complet, remplace tout)
 *   node scripts/scrape-tabacgex.mjs --merge             (conserve les produits existants)
 *   node scripts/scrape-tabacgex.mjs --r2                (scrape + upload images vers R2)
 *   node scripts/scrape-tabacgex.mjs --migrate-images    (upload R2 uniquement, sans toucher aux données)
 *
 * Variables d'environnement pour R2 (--r2 / --migrate-images) :
 *   R2_ACCOUNT_ID      = 0f42b1d524da8383c48cb32376f8ee21
 *   R2_ACCESS_KEY_ID   = <clé depuis R2 → Manage API Tokens>
 *   R2_SECRET_ACCESS_KEY = <secret depuis R2 → Manage API Tokens>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../src/data-source/produits.json");
const BASE = "https://www.tabacgex.fr";
const MERGE = process.argv.includes("--merge");
const UPLOAD_R2 = process.argv.includes("--r2");
const MIGRATE_IMAGES = process.argv.includes("--migrate-images");
const TODAY = new Date().toISOString().slice(0, 10);
const R2_BUCKET = "tabacgex-media";
const CONCURRENCY = 8; // uploads R2 en parallèle

// ─── Catégories à scraper ─────────────────────────────────────────────────────
const CATEGORIES = [
  { url: "/catalogue/362222-C-B-D",                        slug: "cbd"         },
  { url: "/catalogue/278775-W-Puffs",                      slug: "puffs"       },
  { url: "/catalogue/239626-cigarettes-electroniques",      slug: "vape"        },
  { url: "/catalogue/253058-e-liquides",                   slug: "vape"        },
  { url: "/catalogue/239620-accessoires-chicha",           slug: "chicha"      },
  { url: "/catalogue/252713-articles-fumeurs",             slug: "accessoires" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toSlug(str) {
  return str
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseUnitePrix(str) {
  if (!str) return null;
  if (/\/g\b/i.test(str)) return "g";
  if (/\/ml/i.test(str)) return "ml";
  return null;
}

async function get(path) {
  const res = await fetch(BASE + path, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; scraper/1.0)" },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.text();
}

// ─── Upload R2 via S3-compatible API (pas de subprocess wrangler) ─────────────
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "0f42b1d524da8383c48cb32376f8ee21";
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

function sha256hex(data) {
  return createHash("sha256").update(data).digest("hex");
}
function hmac(key, data, enc) {
  return createHmac("sha256", key).update(data).digest(enc || undefined);
}

async function r2Put(key, body, contentType) {
  if (!R2_ACCESS_KEY || !R2_SECRET_KEY) {
    throw new Error("R2_ACCESS_KEY_ID et R2_SECRET_ACCESS_KEY requis (voir README)");
  }
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]/g, "").replace(/\.\d+/, "");
  const dateShort = amzDate.slice(0, 8);
  const bodyHash = sha256hex(body);
  const path = `/${R2_BUCKET}/${key}`;

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", path, "", canonicalHeaders, signedHeaders, bodyHash].join("\n");

  const credScope = `${dateShort}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credScope, sha256hex(canonicalRequest)].join("\n");

  const sigKey = hmac(hmac(hmac(hmac(`AWS4${R2_SECRET_KEY}`, dateShort), "auto"), "s3"), "aws4_request");
  const signature = hmac(sigKey, stringToSign, "hex");

  const res = await fetch(`${R2_ENDPOINT}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Host": host,
      "X-Amz-Content-Sha256": bodyHash,
      "X-Amz-Date": amzDate,
      "Authorization": `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`R2 ${res.status}: ${txt.slice(0, 200)}`);
  }
}

async function uploadImageToR2(imageUrl, nomProduit) {
  let res;
  try {
    res = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; scraper/1.0)" },
    });
    if (!res.ok) return null;
  } catch { return null; }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const ext = contentType.split("/")[1]?.split(";")[0]?.trim() || "jpg";
  const slug = toSlug(nomProduit).slice(0, 50);
  const key = `produits/${Date.now()}-${slug}.${ext}`;

  try {
    const body = Buffer.from(await res.arrayBuffer());
    await r2Put(key, body, contentType);
    return `/media/${key}`;
  } catch (e) {
    console.warn(`    ⚠️ R2 upload échoué : ${e.message.slice(0, 120)}`);
    return null;
  }
}

// Exécute fn sur les items avec au max `limit` en parallèle
async function pMap(items, fn, limit) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ─── Upload images d'un produit ───────────────────────────────────────────────
async function uploadProduitImages(produit) {
  if (produit.image && produit.image.includes("eproshopping")) {
    const r2Url = await uploadImageToR2(produit.image, produit.nom);
    if (r2Url) produit.image = r2Url;
  }
  if (Array.isArray(produit.galerie)) {
    for (let i = 0; i < Math.min(produit.galerie.length, 3); i++) {
      if (produit.galerie[i]?.includes("eproshopping")) {
        const r2Url = await uploadImageToR2(produit.galerie[i], produit.nom + "-g");
        if (r2Url) produit.galerie[i] = r2Url;
      }
    }
  }
  return produit;
}

// ─── Extraction liste produits ────────────────────────────────────────────────
function extractListings(html) {
  const items = [];
  const re = /href="(\/\d+-[^"?#]+)"/g;
  const seen = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (seen.has(href) || href.startsWith("/catalogue")) continue;
    seen.add(href);
    items.push(href);
  }
  return items;
}

// ─── Extraction fiche produit ─────────────────────────────────────────────────
function extractProduct(html, href, categorie) {
  const nomM = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
    || html.match(/<h2[^>]*class="[^"]*(?:product|titre)[^"]*"[^>]*>([^<]+)<\/h2>/i);
  const nom = nomM ? nomM[1].trim() : href.split("-").slice(1).join(" ");

  const prixM = html.match(/itemprop="price"[^>]*content="([\d.]+)"/i)
    || html.match(/content="([\d.]+)"[^>]*itemprop="price"/i);
  let prix = prixM ? parseFloat(prixM[1]) : null;
  let unitePrix = null;

  if (prix === null) {
    const textM = html.match(/<span[^>]*class="[^"]*Price-text[^"]*"[^>]*>\s*([\d.,]+)\s*€\s*(?:\/\s*(g|ml))?\s*<\/span>/i);
    if (textM) {
      prix = parseFloat(textM[1].replace(",", "."));
      unitePrix = textM[2]?.toLowerCase() || null;
    }
  }
  if (!unitePrix) {
    const prixBloc = html.match(/itemprop="price"[\s\S]{0,200}/i)?.[0] || "";
    unitePrix = parseUnitePrix(prixBloc);
  }

  const imgM = html.match(/https:\/\/eproshopping\.cloud\/media\/[^\s"'<>]+(?:lg|md)\.[a-z]+/i)
    || html.match(/https:\/\/eproshopping\.cloud\/media\/[^\s"'<>]+\.[a-z]+/i);
  const imageSource = imgM ? imgM[0] : null;

  const imgRe = /https:\/\/eproshopping\.cloud\/media\/[^\s"'<>]+\.[a-z]+/gi;
  const galerieSource = [...new Set(html.match(imgRe) || [])].filter(u => u !== imageSource);

  const metaM = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)
    || html.match(/<meta[^>]+content="([^"]+)"[^>]+name="description"/i);
  const pM = html.match(/<p[^>]*>([^<]{30,300})<\/p>/i);
  const descriptionCourte = (metaM?.[1] || pM?.[1] || "").trim().slice(0, 160);

  const marqueM = html.match(/(?:marque|brand)[^>]*>([^<]{2,40})</i)
    || html.match(/<span[^>]*class="[^"]*(?:marque|brand)[^"]*"[^>]*>([^<]+)<\/span>/i);
  const marque = marqueM ? marqueM[1].trim() : "";

  const id = toSlug(nom) || href.replace(/^\/\d+-/, "").slice(0, 60);

  return {
    id, nom, marque, categorie, prix, prixBarre: null, devise: "EUR", unitePrix,
    stock: 10, statutStock: "en-stock", image: imageSource, galerie: galerieSource,
    descriptionCourte, description: "", pointsForts: [], ficheTechnique: {},
    contenuKit: [], couleurs: [], saveurs: [], tags: [], note: null, nombreAvis: null,
    dateAjout: TODAY, actif: true, seo: { title: "", description: descriptionCourte },
  };
}

// ─── Migration images uniquement (--migrate-images) ──────────────────────────
async function migrateImages() {
  const data = JSON.parse(readFileSync(OUT, "utf8"));
  const produits = data.produits || [];
  const aTraiter = produits.filter(p =>
    (p.image && p.image.includes("eproshopping")) ||
    (p.galerie || []).some(u => u?.includes("eproshopping"))
  );

  console.log(`🪣 ${aTraiter.length} produits avec images à migrer (sur ${produits.length} total)\n`);
  let done = 0;

  await pMap(aTraiter, async (produit) => {
    await uploadProduitImages(produit);
    done++;
    process.stdout.write(`\r  🪣 ${done}/${aTraiter.length} — ${produit.nom.slice(0, 40)}`);
  }, CONCURRENCY);

  console.log("\n");
  writeFileSync(OUT, JSON.stringify({ produits }, null, 2), "utf8");
  console.log(`✅ Migration terminée. Données Decap intactes.`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (MIGRATE_IMAGES) return migrateImages();
  if (UPLOAD_R2) console.log("🪣 Mode R2 activé — uploads en parallèle (x" + CONCURRENCY + ")\n");

  const produits = [];
  const seen = new Set();

  for (const { url, slug } of CATEGORIES) {
    console.log(`\n📂 Catégorie : ${slug} → ${url}`);
    let html;
    try { html = await get(url); } catch (e) { console.warn("  ⚠️ Erreur:", e.message); continue; }

    const hrefs = extractListings(html);
    console.log(`  ${hrefs.length} liens produits trouvés`);

    // Scrape les fiches en parallèle (8 à la fois)
    await pMap(hrefs.filter(h => !seen.has(h)), async (href) => {
      seen.add(href);
      try {
        const detail = await get(href);
        const produit = extractProduct(detail, href, slug);
        if (UPLOAD_R2) await uploadProduitImages(produit);
        produits.push(produit);
        process.stdout.write(`  ✓ ${produit.nom.slice(0, 50)} (${produit.prix ?? "?"}€)\n`);
      } catch (e) {
        console.warn(`  ⚠️ ${href} : ${e.message}`);
      }
    }, CONCURRENCY);
  }

  let final = produits;
  if (MERGE) {
    const existing = JSON.parse(readFileSync(OUT, "utf8")).produits || [];
    const existingIds = new Set(existing.map(p => p.id));
    const newOnes = produits.filter(p => !existingIds.has(p.id));
    final = [...existing, ...newOnes];
    console.log(`\n🔀 Merge : ${existing.length} existants + ${newOnes.length} nouveaux`);
  }

  writeFileSync(OUT, JSON.stringify({ produits: final }, null, 2), "utf8");
  console.log(`\n✅ ${final.length} produits écrits dans src/data-source/produits.json`);
}

main().catch(console.error);

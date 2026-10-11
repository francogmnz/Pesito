import type { RawCandidate } from "../adapters";
import { parseDateRange, parseMoneyIn, parsePercent, stripTags, truncate } from "../html";

export const MERCADOPAGO_URL = "https://promociones.mercadopago.com.ar/";

/**
 * Sitio de promociones de Mercado Pago (WordPress). Cada promo tiene un modal
 * `kiyo__data--details` con nombre, beneficios ("Hasta 45% OFF", "Hasta 12 cuotas sin interés"),
 * descripción, enlace y legales ("Válido del 11 al 17 de mayo. Tope de reintegro $30.000").
 * Solo se toman las que tienen un porcentaje de descuento: las de cuotas sin interés o 2x1
 * todavía no tienen lugar en el modelo de Pesito.
 */
export function parseMercadoPago(html: string, today: string): RawCandidate[] {
  const blocks = html.split(/<div class="kiyo__data--details">/).slice(1);
  if (!blocks.length) throw new Error("Mercado Pago: no se encontraron promociones en la página");
  const out: RawCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of blocks) {
    const block = raw.split(/<div class="kiyo__cards--item"|<div class="kiyo__cards--col/)[0];
    const name = stripTags(block.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .trim();
    if (!name) continue;
    const badges = [...block.matchAll(/kiyo__cards--badge[^"]*">\s*<span>([\s\S]*?)<\/span>/g)].map((m) => stripTags(m[1]));
    const rows = [...block.matchAll(/<h4>([\s\S]*?)<\/h4>\s*<p>([\s\S]*?)<\/p>/g)].map((m) => ({ title: stripTags(m[1]).toLowerCase(), text: stripTags(m[2]) }));
    const description = rows.find((r) => r.title.startsWith("promo"))?.text ?? "";
    const legal = stripTags(block.match(/<h6>\s*Legales\s*<\/h6>\s*<small>([\s\S]*?)<\/small>/i)?.[1] ?? "");
    const link = block.match(/href="(https:\/\/promociones\.mercadopago\.com\.ar\/seller\/[^"]+)"/)?.[1] ?? null;

    const offBadge = badges.find((b) => /%/.test(b));
    const pct = parsePercent(offBadge);
    if (!pct) continue; // cuotas sin interés / 2x1: fuera del modelo por ahora

    const slugify = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    let lastSegment = link ? link.replace(/\/+$/, "").split("/").pop()! : name;
    try {
      lastSegment = decodeURIComponent(lastSegment);
    } catch {
      /* se usa tal cual */
    }
    const slug = slugify(lastSegment) || slugify(name);
    const merchant = name.replace(/\b([A-ZÁÉÍÓÚÑ]{2,})\b/g, (w) => w[0] + w.slice(1).toLowerCase());
    const { from, until } = parseDateRange(legal, today);
    const externalId = `mp:${slug}:${until ?? "sin-fecha"}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    const upTo = /hasta/i.test(offBadge ?? "");
    const cap = /tope/i.test(legal) ? parseMoneyIn(legal.slice(legal.toLowerCase().indexOf("tope"))) : null;
    const extras = badges.filter((b) => b !== offBadge);
    out.push({
      externalId,
      kind: /reintegro/i.test(`${description} ${legal}`) ? "reintegro" : "descuento",
      merchantName: merchant,
      title: truncate(`${upTo ? "Hasta " : ""}${pct}% de descuento en ${merchant}${extras.length ? ` + ${extras.join(" + ").toLowerCase()}` : ""}`, 140) ?? undefined,
      summary: truncate(description, 280),
      wallet: "Mercado Pago",
      paymentMethodSlugs: ["mercado-pago"],
      discountKind: "porcentaje",
      discountValue: pct,
      capAmount: cap,
      capPeriod: cap ? "vigencia" : "sin_tope",
      validFrom: from,
      validUntil: until,
      channel: /online|tienda online|sitio/i.test(`${description} ${legal}`) ? "online" : "ambos",
      conditions: truncate([upTo ? "El porcentaje es el máximo: aplica en productos seleccionados." : null, legal].filter(Boolean).join(" "), 2000),
      sourceUrl: link ?? MERCADOPAGO_URL,
    });
  }
  return out;
}

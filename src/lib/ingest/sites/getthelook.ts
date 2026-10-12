import type { RawCandidate } from "../adapters";
import { capPeriodFrom, parseMoneyIn, parsePercent, parseValidity, stripTags, truncate } from "../html";
import { paymentsNamedIn } from "../payment-names";

export const GETTHELOOK_PROMOS_URL = "https://www.getthelook.com.ar/getthelook/medios-de-pago";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const DAY: Record<string, number> = { dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 };
const DAY_WORD = "lunes|martes|miercoles|jueves|viernes|sabados?|domingos?|lun|mar|mie|jue|vie|sab|dom";

/** "Jueves", "Sab y Dom", "Jue a Dom" → días de la semana (0 = domingo). Sin días nombrados, null. */
export function parseDayText(text: string): number[] | null {
  const t = norm(text);
  const out = new Set<number>();
  for (const m of t.matchAll(new RegExp(`\\b(${DAY_WORD})\\s+a\\s+(${DAY_WORD})\\b`, "g"))) {
    for (let d = DAY[m[1].slice(0, 3)]; ; d = (d + 1) % 7) {
      out.add(d);
      if (d === DAY[m[2].slice(0, 3)]) break;
    }
  }
  for (const m of t.matchAll(new RegExp(`\\b(${DAY_WORD})\\b`, "g"))) out.add(DAY[m[1].slice(0, 3)]);
  return out.size === 0 || out.size === 7 ? null : [...out].sort();
}

/** La tabla de medios de pago viene como texto JSON dentro de los datos de la página (`rawDataJson`). */
function paymentRows(html: string): Any[] {
  for (const m of html.matchAll(/<template data-type="json" data-varname="__RUNTIME__"[^>]*>\s*<script>([\s\S]*?)<\/script>/g)) {
    if (!m[1].includes("rawDataJson")) continue;
    let found: Any[] | null = null;
    const walk = (v: unknown) => {
      if (found || !v || typeof v !== "object") return;
      for (const [k, x] of Object.entries(v as Any)) {
        if (k === "rawDataJson" && typeof x === "string") {
          try {
            const rows = JSON.parse(x);
            if (Array.isArray(rows)) found = rows;
          } catch {
            /* otra extensión con el mismo nombre de campo */
          }
        } else walk(x);
        if (found) return;
      }
    };
    try {
      walk(JSON.parse(m[1]));
    } catch {
      continue;
    }
    if (found) return found;
  }
  throw new Error("Get The Look: no se encontró la tabla de medios de pago en la página");
}

const SEGMENT = /\b(eminent|eminet|black|platinum|signature|selecta|premium|jubilad[oa]s?|[uú]nico)\b/i;

/**
 * Promos bancarias de Get The Look (tienda VTEX del grupo Farmacity). La página trae una tabla con una fila por
 * tarjeta y cantidad de cuotas; el beneficio está escrito en "Promoción" ("Jueves 25% de Ahorro… Tope de reintegro
 * $ 15.000 por cuenta, por mes") y los términos en "Legales". Se deja una promo por banco y texto; las de solo cuotas se saltean.
 */
export function parseGetTheLook(html: string, today: string): RawCandidate[] {
  const rows = paymentRows(html);
  const out: RawCandidate[] = [];
  const seenText = new Set<string>();
  const seenId = new Map<string, number>();

  for (const r of rows) {
    const promo = String(r["Promoción"] ?? "").replace(/\s+/g, " ").trim();
    const pct = parsePercent(promo.replace(/\b0[.,]00\s?%/g, ""));
    // "SOL" a secas es Banco del Sol.
    const bankText = `${String(r.Banco ?? "").trim().toUpperCase() === "SOL" ? "Banco del Sol" : (r.Banco ?? "")} ${r.Nombre ?? ""}`;
    if (!promo || pct == null) continue;
    const dedupe = norm(`${r.Banco}|${promo}`);
    if (seenText.has(dedupe)) continue;
    seenText.add(dedupe);

    const flags: string[] = [];
    const notes: string[] = [];
    const named = paymentsNamedIn(bankText);
    const pay = named.filter((p) => !p.network).length ? named.filter((p) => !p.network) : named;
    if (!pay.length || pay.some((p) => !p.slug)) flags.push(`No se reconoció el medio de pago (“${String(r.Banco ?? "").trim() || "sin dato"}”).`);
    const segment = promo.match(SEGMENT);
    if (segment) flags.push(`Puede ser solo para un segmento de clientes (“${segment[0]}”).`);
    if (/\bhasta\s+\d{1,3}\s*%/i.test(promo)) flags.push("El porcentaje es «hasta»: puede ser menor según el producto.");

    const capText = promo.match(/tope[^$]{0,30}\$\s?[\d.,]+[^.]{0,40}/i)?.[0] ?? null;
    // En esta tabla los miles vienen con punto o con coma ("$15,000").
    const cap = parseMoneyIn(capText?.replace(/(\d),(\d{3})\b/g, "$1.$2"));
    const capHasPeriod = /seman|mensual|por mes|al mes|diari|por d[ií]a|por (viaje|compra|pedido|transacci)|por evento/i.test(capText ?? "");
    if (cap && !capHasPeriod) notes.push("El tope no aclara el período: se cargó como tope de toda la promo.");
    if (!cap && !/sin tope/i.test(promo)) notes.push("La página no menciona tope.");
    const min = parseMoneyIn(promo.match(/(?:ticket|compra) m[ií]nim[oa][^$]{0,10}\$\s?[\d.,]+/i)?.[0]?.replace(/(\d),(\d{3})\b/g, "$1.$2"));

    const legal = stripTags(String(r.Legales ?? "")).replace(/\s+/g, " ").trim();
    const slashed = promo.replace(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g, "$1/$2/$3");
    const inPromo = parseValidity(slashed, today);
    const { from, until } = inPromo.until ? inPromo : parseValidity(legal, today);
    if (!until) flags.push("No se encontró hasta cuándo vale.");

    // Los días van antes del porcentaje: "Jueves 25%…", "DDM - Jue a Dom 25%…".
    const days = parseDayText(promo.slice(0, promo.search(/\d{1,3}\s?%/)));
    const online = /on ?line/i.test(promo) || String(r.Tienda) === "ONLINE";
    const local = /sucursal/i.test(promo) || String(r.Tienda) === "SUCURSAL";
    const who = pay.map((p) => p.name).join(" o ");
    const key = `${pay.map((p) => p.slug ?? p.name).join("+") || "x"}:${pct}:${(days ?? []).join("") || "todos"}`;
    const n = (seenId.get(key) ?? 0) + 1;
    seenId.set(key, n);

    out.push({
      externalId: `getthelook:${key}${n > 1 ? `:${n}` : ""}`.toLowerCase().replace(/\s+/g, "-").slice(0, 120),
      ...(flags.length ? { flags } : {}),
      ...(notes.length ? { notes } : {}),
      kind: /reintegro|ahorro/i.test(promo) ? "reintegro" : "descuento",
      audience: "todos",
      merchantName: "Get The Look",
      categorySlug: "belleza",
      title: truncate(`${pct}% de ${/reintegro|ahorro/i.test(promo) ? "reintegro" : "descuento"} en Get The Look${who ? ` con ${who}` : ""}`, 140) ?? undefined,
      summary: truncate(promo, 280),
      paymentMethodSlugs: pay.flatMap((p) => (p.slug ? [p.slug] : [])),
      discountKind: "porcentaje",
      discountValue: pct,
      capAmount: cap,
      capPeriod: !cap ? "sin_tope" : /por evento/i.test(capText ?? "") ? "vigencia" : capHasPeriod ? capPeriodFrom(capText) : "vigencia",
      minPurchase: min,
      validFrom: from,
      validUntil: until,
      daysOfWeek: days,
      channel: online && !local ? "online" : local && !online ? "local" : "ambos",
      conditions: truncate([promo, legal].filter(Boolean).join("\n\n"), 3800),
      requirements: [],
      sourceUrl: GETTHELOOK_PROMOS_URL,
    });
  }
  if (!out.length) throw new Error("Get The Look: la tabla no trae promos con porcentaje");
  return out;
}

import { addDaysISO, daysBetween, MONTHS, parseISODate } from "@/lib/domain/dates";
import { parseARS } from "@/lib/domain/money";
import type { CapPeriod } from "@/lib/domain/types";

/** JSON que Next.js deja embebido en la página (`<script id="__NEXT_DATA__">`). */
export function extractNextData(html: string): unknown {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("La página no tiene __NEXT_DATA__: cambió su estructura");
  return JSON.parse(m[1]);
}

/**
 * Datos que el App Router de Next.js deja embebidos (`self.__next_f.push([1,"…"])`).
 * Devuelve cada fila por su id. Las filas de texto (`id:T<largo en hex>,…`) se cortan
 * por bytes, porque pueden traer saltos de línea adentro.
 */
export function extractFlightRows(html: string): Map<string, string> {
  let flight = "";
  for (const m of html.matchAll(/self\.__next_f\.push\((\[1,"(?:[^"\\]|\\.)*"\])\)/g)) {
    try {
      flight += (JSON.parse(m[1]) as [number, string])[1];
    } catch {
      // Un bloque ilegible no invalida el resto.
    }
  }
  const bytes = new TextEncoder().encode(flight);
  const dec = new TextDecoder();
  const rows = new Map<string, string>();
  let i = 0;
  while (i < bytes.length) {
    const colon = bytes.indexOf(58, i);
    if (colon < 0) break;
    const id = dec.decode(bytes.subarray(i, colon));
    const comma = bytes[colon + 1] === 84 ? bytes.indexOf(44, colon) : -1;
    const len = comma > 0 ? parseInt(dec.decode(bytes.subarray(colon + 2, comma)), 16) : NaN;
    if (Number.isFinite(len)) {
      rows.set(id, dec.decode(bytes.subarray(comma + 1, comma + 1 + len)));
      i = comma + 1 + len;
    } else {
      const nl = bytes.indexOf(10, colon);
      const end = nl < 0 ? bytes.length : nl;
      rows.set(id, dec.decode(bytes.subarray(colon + 1, end)));
      i = end + 1;
    }
  }
  return rows;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#038": "&", "#8211": "–", "#8217": "’", "#8220": "“", "#8221": "”" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9#]+);/gi, (m, k) => ENTITIES[k.toLowerCase()] ?? m);
}

export function stripTags(s: string): string {
  return decodeEntities(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** "10%", "Hasta 45% OFF", "20% Off" → 10, 45, 20. */
export function parsePercent(s: string | null | undefined): number | null {
  const m = (s ?? "").match(/(\d{1,3}(?:[.,]\d+)?)\s*%/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return n > 0 && n <= 100 ? n : null;
}

/** Primer monto en pesos del texto: "$6.000 semanal" → 6000. "Sin tope" / "-" → null. */
export function parseMoneyIn(s: string | null | undefined): number | null {
  const m = (s ?? "").match(/\$\s?(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)/);
  return m ? parseARS(m[1]) : null;
}

export function capPeriodFrom(s: string | null | undefined): CapPeriod {
  const t = (s ?? "").toLowerCase();
  if (/seman|por (lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)/.test(t)) return "semana";
  if (/mensual|por mes|al mes/.test(t)) return "mes";
  if (/diari|por d[ií]a/.test(t)) return "dia";
  if (/por (viaje|compra|pedido|transacci)/.test(t)) return "compra";
  if (/promo|vigencia|total/.test(t)) return "vigencia";
  return "mes";
}

const DAY_INDEX: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** ["Lunes","Martes"] → [1,2]. "Todos los días" o los 7 → null (todos). */
export function parseDays(list: string[] | null | undefined): number[] | null {
  if (!list?.length) return null;
  const out = new Set<number>();
  for (const raw of list) {
    const d = norm(raw);
    if (d.includes("todos")) return null;
    if (d.includes("lunes a viernes")) [1, 2, 3, 4, 5].forEach((x) => out.add(x));
    for (const [name, i] of Object.entries(DAY_INDEX)) if (d.includes(name)) out.add(i);
  }
  return out.size === 0 || out.size === 7 ? null : [...out].sort();
}

const MONTH_INDEX = Object.fromEntries(MONTHS.map((m, i) => [norm(m), i + 1]));
MONTH_INDEX["setiembre"] = 9;

/** Arma una fecha; si no trae año, elige el que la deja más cerca de hoy (una promo de "17 de mayo" vista en octubre es del pasado). */
function isoFrom(day: number, month: number, year: number | null, today: string): string | null {
  if (!month || day < 1 || day > 31) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (year) return `${year}-${pad(month)}-${pad(day)}`;
  const y = parseISODate(today).y;
  const candidates = [y - 1, y, y + 1].map((yy) => `${yy}-${pad(month)}-${pad(day)}`);
  return candidates.sort((a, b) => Math.abs(daysBetween(today, a)) - Math.abs(daysBetween(today, b)))[0];
}

/** "31 de octubre de 2026", "Hasta el 31 de julio 2027", "30 de julio del 2027", "31/10/2026". */
export function parseSpanishDate(s: string | null | undefined, today: string): string | null {
  const t = norm(s ?? "");
  const m = t.match(/(\d{1,2})\s+de\s+([a-z]+)(?:\s+(?:de|del)?\s*(\d{4}))?/);
  if (m && MONTH_INDEX[m[2]]) return isoFrom(Number(m[1]), MONTH_INDEX[m[2]], m[3] ? Number(m[3]) : null, today);
  const n = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (n) {
    const y = n[3] ? (n[3].length === 2 ? 2000 + Number(n[3]) : Number(n[3])) : null;
    return isoFrom(Number(n[1]), Number(n[2]), y, today);
  }
  return null;
}

/** "Válido del 11 al 17 de mayo" / "del 28 de septiembre al 5 de octubre" → rango. */
export function parseDateRange(s: string | null | undefined, today: string): { from: string | null; until: string | null } {
  const t = norm(s ?? "");
  const m = t.match(/del?\s+(\d{1,2})(?:\s+de\s+([a-z]+))?\s+al\s+(\d{1,2})\s+de\s+([a-z]+)(?:\s+(?:de|del)?\s*(\d{4}))?/);
  if (m && MONTH_INDEX[m[4]]) {
    const until = isoFrom(Number(m[3]), MONTH_INDEX[m[4]], m[5] ? Number(m[5]) : null, today);
    if (!until) return { from: null, until: null };
    const fromMonth = m[2] && MONTH_INDEX[m[2]] ? MONTH_INDEX[m[2]] : MONTH_INDEX[m[4]];
    let from = isoFrom(Number(m[1]), fromMonth, parseISODate(until).y, today);
    if (from && from > until) from = addDaysISO(from, -365);
    return { from, until };
  }
  const single = t.match(/hasta el\s+(.+)/);
  return { from: null, until: single ? parseSpanishDate(single[1], today) : parseSpanishDate(t, today) };
}

const VALIDITY = /v[aá]lid[ao]s?\b|promoci[oó]n vigente|vigencia\b/gi;
const MONTH_RE = Object.keys(MONTH_INDEX).join("|");
const lastDay = (y: number, month: number) => new Date(Date.UTC(y, month, 0)).getUTCDate();

/**
 * Vigencia dentro de un texto legal. Busca la frase que la anuncia ("Válida desde el 28/09/2026 hasta el 31/10/2026",
 * "válida del 1° al 31 de octubre de 2026", "los martes 6, 13 y 27 de octubre del 2026", "los domingos de octubre 2026").
 * Una sola fecha después de "desde" es el inicio, no el fin.
 */
export function parseValidity(text: string | null | undefined, today: string): { from: string | null; until: string | null } {
  const legal = text ?? "";
  for (const hit of legal.matchAll(VALIDITY)) {
    const seg = legal.slice(hit.index, hit.index + 220).replace(/[°º]/g, "");
    const dates = [...norm(seg).matchAll(new RegExp(`\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}|\\d{1,2}\\s+de\\s+(?:${MONTH_RE})\\s+(?:de|del)\\s+\\d{4}`, "g"))];
    const iso = dates.map((m) => parseSpanishDate(m[0], today));
    if (iso.length >= 2 && iso[0] && iso[1] && iso[0] <= iso[1]) return { from: iso[0], until: iso[1] };
    if (iso.length === 1 && iso[0]) {
      const before = norm(seg).slice(0, dates[0].index);
      return /desde\s+(el\s+)?$/.test(before) && !/hasta/.test(norm(seg)) ? { from: iso[0], until: null } : { from: null, until: iso[0] };
    }
    const range = parseDateRange(seg, today);
    if (range.until) return range;
    // Mes entero: "los viernes, sábados y domingos de octubre 2026".
    const m = norm(seg).match(new RegExp(`(?:de|del mes de)\\s+(${MONTH_RE})\\s+(?:de\\s+|del\\s+)?(\\d{4})`));
    if (m) {
      const month = MONTH_INDEX[m[1]];
      const y = Number(m[2]);
      const pad = (n: number) => String(n).padStart(2, "0");
      return { from: `${y}-${pad(month)}-01`, until: `${y}-${pad(month)}-${pad(lastDay(y, month))}` };
    }
  }
  return { from: null, until: null };
}

/** Código de cupón mencionado en el texto: «ingresando el código 5MASTER», «cupón “RappiProUala”». */
export function findCouponCode(s: string | null | undefined): string | null {
  const re = /(?:c[oó]digo|cup[oó]n)\s*(?:de descuento\s*)?[“"'«]?\s*([A-Za-z0-9][A-Za-z0-9_-]{2,39})/gi;
  for (const m of (s ?? "").matchAll(re)) {
    const code = m[1];
    // Evita palabras comunes ("cupón del 100%"): un código tiene mayúsculas o números.
    if (/[A-Z0-9]/.test(code) && !/^(del|de|para|con)$/i.test(code)) return code;
  }
  return null;
}

export function truncate(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

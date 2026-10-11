import { isValidISODate, parseISODate } from "@/lib/domain/dates";
import { formatARS } from "@/lib/domain/money";
import type { CapPeriod, SalesChannel, SourceRecordState } from "@/lib/domain/types";
import type { Crawler, RawCandidate } from "../adapters";
import { fetchPage } from "../fetch-page";
import { extractFlightRows, parsePercent, parseSpanishDate, stripTags, truncate } from "../html";

export const MODO_URL = "https://www.modo.com.ar/promos";
export const MODO_SITEMAP_URL = "https://www.modo.com.ar/sitemap.xml";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

const MONTH_TAGS: Record<string, number> = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4, mayo: 5, may: 5, junio: 6, jun: 6, julio: 7, jul: 7,
  agosto: 8, agos: 8, ago: 8, septiembre: 9, setiembre: 9, sept: 9, sep: 9, set: 9, octubre: 10, oct: 10, noviembre: 11, nov: 11, diciembre: 12, dic: 12,
};
const TAGS_BY_LENGTH = Object.keys(MONTH_TAGS).sort((a, b) => b.length - a.length);

/** Cada promo de MODO tiene su página pública `/promos/{slug}`; el sitemap las lista todas (también las viejas). */
export function parseModoSitemap(xml: string): string[] {
  const out = new Set<string>();
  for (const m of xml.matchAll(/<loc>\s*https:\/\/www\.modo\.com\.ar\/promos\/([^<\s/?#]+)\s*<\/loc>/g)) {
    if (/^[A-Za-z0-9._~%-]{1,200}$/.test(m[1])) out.add(m[1]);
  }
  return [...out];
}

/** Mes que el slug suele llevar al final ("…-oct26") o al principio ("2609-…"). */
function slugMonth(slug: string, year: number): { y: number; m: number } | null {
  const s = slug.toLowerCase();
  const ok = (y: number) => y >= year - 4 && y <= year + 1;
  const end = s.match(/([a-z]+)(\d{2})$/);
  if (end) {
    const tag = TAGS_BY_LENGTH.find((t) => end[1].endsWith(t));
    if (tag && ok(2000 + Number(end[2]))) return { y: 2000 + Number(end[2]), m: MONTH_TAGS[tag] };
  }
  const start = s.match(/^(?:20)?(\d{2})(0[1-9]|1[0-2])-/);
  if (start && ok(2000 + Number(start[1]))) return { y: 2000 + Number(start[1]), m: Number(start[2]) };
  return null;
}

/**
 * Orden de lectura: de las casi 28.000 páginas, solo unas 1.700 están vigentes.
 * Primero las de los últimos meses, después las que no dicen fecha y al final las viejas.
 */
export function modoPriority(slug: string, today: string): number {
  const t = parseISODate(today);
  const tag = slugMonth(slug, t.y);
  if (!tag) return 965;
  const monthsAgo = Math.max(0, (t.y - tag.y) * 12 + (t.m - tag.m));
  return Math.max(0, 1000 - monthsAgo * 10);
}

interface Bank {
  slug: string;
  name: string;
  /** Alias inconfundibles: valen en cualquier parte del slug. Con * al final, alcanza con que empiece así. */
  strong: string[];
  /** Alias que también pueden ser un comercio o un lugar: solo valen donde MODO pone el banco. */
  weak?: string[];
}

const BANKS: Bank[] = [
  { slug: "banco-nacion", name: "Banco Nación", strong: ["bna*", "banconacion"], weak: ["nacion"] },
  { slug: "santander", name: "Santander", strong: ["santander*"] },
  { slug: "bbva", name: "BBVA", strong: ["bbva*"] },
  { slug: "galicia", name: "Galicia", strong: ["galicia*"] },
  { slug: "macro", name: "Macro", strong: ["macro*"] },
  { slug: "provincia", name: "Banco Provincia", strong: ["bapro", "bancoprovincia"], weak: ["provincia"] },
  { slug: "patagonia", name: "Banco Patagonia", strong: ["bancopatagonia"], weak: ["patagonia*"] },
  { slug: "credicoop", name: "Credicoop", strong: ["credicoop*"] },
  { slug: "icbc", name: "ICBC", strong: ["icbc*"] },
  { slug: "supervielle", name: "Supervielle", strong: ["supervielle*"] },
  { slug: "ciudad", name: "Banco Ciudad", strong: ["bancociudad"], weak: ["ciudad"] },
  { slug: "hipotecario", name: "Banco Hipotecario", strong: ["hipotecario*", "bhn"] },
  { slug: "comafi", name: "Comafi", strong: ["comafi*"] },
  { slug: "brubank", name: "Brubank", strong: ["brubank"] },
  { slug: "openbank", name: "Openbank", strong: ["openbank"] },
  { slug: "reba", name: "Reba", strong: [], weak: ["reba"] },
  { slug: "banco-santa-fe", name: "Banco Santa Fe", strong: ["bsf", "bancosantafe"], weak: ["santafe"] },
  { slug: "banco-entre-rios", name: "Banco Entre Ríos", strong: ["bersa", "bancoentrerios"], weak: ["entrerios"] },
  { slug: "banco-san-juan", name: "Banco San Juan", strong: ["bsj", "bancosanjuan"], weak: ["sanjuan"] },
  { slug: "banco-santa-cruz", name: "Banco Santa Cruz", strong: ["bsc", "bancosantacruz"], weak: ["santacruz"] },
  { slug: "banco-corrientes", name: "Banco de Corrientes", strong: ["bancocorrientes", "bancodecorrientes"], weak: ["corrientes"] },
  { slug: "bancor", name: "Bancor", strong: ["bancor"] },
  { slug: "bpn", name: "Banco Provincia del Neuquén", strong: ["bpn"], weak: ["neuquen"] },
  { slug: "banco-chubut", name: "Banco del Chubut", strong: ["bancochubut", "bancodelchubut"], weak: ["chubut"] },
  { slug: "banco-la-pampa", name: "Banco de La Pampa", strong: ["blp", "bancolapampa", "bancodelapampa"], weak: ["lapampa", "pampa"] },
  { slug: "nbch", name: "Nuevo Banco del Chaco", strong: ["nbch"], weak: ["chaco"] },
  { slug: "banco-tierra-del-fuego", name: "Banco de Tierra del Fuego", strong: ["btf"], weak: ["tierradelfuego"] },
  { slug: "banco-columbia", name: "Banco Columbia", strong: ["bancocolumbia"], weak: ["columbia"] },
  { slug: "banco-del-sol", name: "Banco del Sol", strong: ["bancodelsol", "bds"], weak: ["delsol"] },
];

const compact = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
const hits = (alias: string, token: string) => (alias.endsWith("*") ? token.startsWith(alias.slice(0, -1)) : token === alias);

/**
 * La página no trae el banco como dato: MODO lo pone en el nombre interno
 * ("2510-credicoop-lacoopeencasa-online-30off") y en el slug. Si no aparece ninguno,
 * es una promo del comercio para todos los bancos adheridos.
 */
export function modoBanks(p: { slug?: unknown; short_description?: unknown; tags?: unknown[] }): Bank[] {
  const parts = String(p.short_description ?? "").split("-").map(compact).filter(Boolean);
  const where = /^\d{4,6}$/.test(parts[0] ?? "") ? parts[1] : undefined;
  if (where) {
    const here = BANKS.filter((b) => [...b.strong, ...(b.weak ?? [])].some((a) => hits(a, where)));
    if (here.length) return here;
  }
  const tokens = [...String(p.slug ?? "").split("-"), ...(p.tags ?? []).map(String)].map(compact).filter(Boolean);
  return BANKS.filter((b) => b.strong.some((a) => tokens.some((t) => hits(a, t))));
}

const CATEGORY: Record<string, string> = {
  supermercado: "supermercados", supermercados: "supermercados", farmacia: "farmacias", farmacias: "farmacias",
  gastronomia: "gastronomia", restaurante: "gastronomia", restaurantes: "gastronomia", delivery: "delivery",
  combustible: "combustible", indumentaria: "indumentaria", tecnologia: "tecnologia", electro: "tecnologia",
  perfumeria: "belleza", perfumerias: "belleza", belleza: "belleza", entretenimiento: "entretenimiento", cine: "entretenimiento",
  transporte: "transporte", educacion: "educacion",
};

const CAP_PERIOD: Record<string, CapPeriod> = { day: "dia", week: "semana", month: "mes", promo: "vigencia" };
const DAY_LETTER: Record<string, number> = { D: 0, L: 1, M: 2, X: 3, J: 4, V: 5, S: 6 };
const NETWORK: Record<string, string> = {
  visa: "Visa", master: "Mastercard", american_express: "American Express", cabal: "Cabal", maestro: "Maestro",
  dinners_club: "Diners", naranja: "Naranja", confiable: "Confiable",
};
const SEGMENT = /(preferencial|platinum|selecta|black|eminent|signature|premium|sueldo|jubilad[oa]s?|pyme|exclusive)(\s+nivel\s+\d+)?/i;
const SEGMENT_AT_END = new RegExp("\\s+(?:" + SEGMENT.source + ")\\s*$", "i");

/** "TENNIS BISTRÓ Selecta" → "Tennis Bistró": sin el segmento pegado al nombre y sin gritar. */
function niceMerchant(raw: string): string {
  const name = raw.replace(SEGMENT_AT_END, "").trim() || raw;
  if (name.length <= 4 || /\p{Ll}/u.test(name)) return name;
  return name.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export interface ModoPage {
  state: Exclude<SourceRecordState, "nueva" | "error">;
  externalId: string | null;
  validUntil: string | null;
  candidate: RawCandidate | null;
  /** Por qué no se cargó, cuando state es "omitida". */
  reason?: string;
}

/** Objeto de la promo dentro de los datos embebidos de la página, con los textos largos ya resueltos. */
export function findModoPromo(html: string): Any | null {
  const rows = extractFlightRows(html);
  let found: Any | null = null;
  const walk = (v: unknown) => {
    if (found || !v || typeof v !== "object") return;
    if (!Array.isArray(v) && (v as Any).promotion?.id && (v as Any).trigger_params) {
      found = v as Any;
      return;
    }
    for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x);
  };
  for (const raw of rows.values()) {
    if (found) break;
    if (!raw.includes('"promotion"')) continue;
    try {
      walk(JSON.parse(raw));
    } catch {
      // Fila que no es JSON: se ignora.
    }
  }
  if (!found) return null;
  const resolve = (v: unknown): unknown => {
    if (typeof v === "string") return /^\$[0-9a-f]+$/.test(v) && rows.has(v.slice(1)) ? rows.get(v.slice(1)) : v;
    if (Array.isArray(v)) return v.map(resolve);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)]));
    return v;
  };
  return resolve(found) as Any;
}

const text = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const positive = (v: unknown) => (typeof v === "number" && v > 0 ? v : null);
const sectionText = (o: Any, key: string) =>
  ((o.sections?.[key]?.contents ?? []) as Any[])
    .map((c) => stripTags(String(c?.description ?? "")))
    .filter(Boolean)
    .join("\n\n");

/**
 * Página de una promo de MODO. Importante: "active" y "running" no significan
 * que aplique hoy; lo que manda es la vigencia, los días y las tarjetas habilitadas.
 */
export function parseModoPromo(html: string, today: string): ModoPage {
  const o = findModoPromo(html);
  if (!o) return { state: "sin_datos", externalId: null, validUntil: null, candidate: null };
  const p = o.promotion as Any;
  const t = (o.trigger_params ?? {}) as Any;
  const externalId = `modo:${p.id}`;
  const validFrom = isValidISODate(p.start_date) ? p.start_date : null;
  const validUntil = isValidISODate(p.stop_date) ? p.stop_date : null;
  if (validUntil && validUntil < today) return { state: "vencida", externalId, validUntil, candidate: null };
  const finished = String(p.calculated_status ?? "").toLowerCase() === "finished";
  if (finished && !validUntil) return { state: "vencida", externalId, validUntil, candidate: null };

  const rows = ((o.card?.content?.row ?? []) as Any[]).map((r) => text(r?.text));
  const pct = parsePercent(rows[1]) ?? parsePercent(p.name) ?? parsePercent(p.title);
  const installments = ((t.installments ?? []) as Any[]).filter((i) => /sin_interes/.test(String(i?.type)) && Number(i?.number) > 1).map((i) => Number(i.number));
  if (pct == null) {
    const reason = o.card?.type === "financing" || installments.length ? "Solo cuotas" : "Sin porcentaje (voucher u otro beneficio)";
    return { state: "omitida", externalId, validUntil, candidate: null, reason };
  }

  const flags: string[] = [];
  const where = text(p.where);
  const merchantName = niceMerchant(rows[0] || (where && !/adherid|consult/i.test(where) ? where : ""));
  if (!merchantName) flags.push("No se pudo leer el comercio");
  if (String(p.status ?? "") !== "active") flags.push(`MODO la informa con estado “${p.status}”`);
  if (finished) flags.push("MODO la marca como finalizada aunque la vigencia sigue");

  const banks = modoBanks({ slug: p.slug, short_description: p.short_description, tags: o.meta?.search_tags });
  if (banks.length === 0) flags.push("No se reconoció un banco puntual: se cargó como promo de MODO con bancos adheridos");
  if (banks.length > 1) flags.push(`Aparecen varios bancos (${banks.map((b) => b.name).join(", ")}): verificar`);
  const segment = `${p.name ?? ""} ${p.short_description ?? ""} ${p.title ?? ""} ${p.description ?? ""}`.match(SEGMENT);
  const segmentName = segment ? segment[0].replace(/\s+/g, " ").replace(/^./, (ch) => ch.toUpperCase()) : null;
  if (segment) flags.push(`Puede ser solo para un segmento de clientes (“${segment[0]}”)`);

  const capPeriodAmount = positive(t.cap_amount_period);
  const capTx = positive(t.cap_transaction);
  const capAmount = capPeriodAmount ?? capTx;
  let capPeriod: CapPeriod = "sin_tope";
  if (capPeriodAmount) {
    capPeriod = CAP_PERIOD[String(t.cap_period)] ?? "mes";
    if (!CAP_PERIOD[String(t.cap_period)]) flags.push(t.cap_period ? `Período del tope desconocido (“${t.cap_period}”): se cargó como mensual` : "MODO no indica cada cuánto se renueva el tope: se cargó como mensual");
  } else if (capTx) capPeriod = "compra";
  if (capPeriodAmount && capTx && capTx > capPeriodAmount) flags.push("El tope por compra es mayor que el tope del período");

  const letters = [...new Set(String(p.days_of_week ?? "").toUpperCase().split(""))].filter((l) => l in DAY_LETTER);
  const days = letters.map((l) => DAY_LETTER[l]).sort();
  if (String(p.days_of_week ?? "") && letters.length === 0) flags.push("No se pudieron leer los días");

  const flows = String(p.payment_flow ?? "").toLowerCase().split(",").map((f) => f.trim());
  const online = flows.some((f) => f === "online" || f === "all");
  const local = flows.some((f) => f.startsWith("instore") || f === "all");
  const channel: SalesChannel = online && !local ? "online" : local && !online ? "local" : "ambos";

  const tyc = sectionText(o, "tyc");
  const until = tyc.match(/hasta el\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  const tycUntil = until ? parseSpanishDate(until[1], today) : null;
  if (tycUntil && validUntil && tycUntil !== validUntil) flags.push(`Los legales dicen hasta el ${until![1]} y el dato de vigencia, ${validUntil}`);

  const names = (list: unknown) => (Array.isArray(list) ? list.map((n) => NETWORK[String(n)] ?? String(n)).join(", ") : "");
  const cards = [
    t.apply_to_credit && names(t.credit_list) ? `crédito ${names(t.credit_list)}` : null,
    t.apply_to_debit && names(t.debit_list) ? `débito ${names(t.debit_list)}` : null,
    t.apply_to_pct ? "dinero en cuenta" : null,
  ].filter(Boolean);
  const fullDay = String(p.daily_start_time ?? "00:00:00").startsWith("00:00") && String(p.daily_stop_time ?? "23:59:00").startsWith("23:59");
  if (!fullDay) flags.push("Tiene horario: no aplica todo el día");
  const lines = [
    banks.length ? "Pagando con MODO desde la app del banco o la app MODO." : "Pagando con MODO con tarjetas de los bancos adheridos.",
    segmentName ? `Solo para clientes ${segmentName}.` : null,
    cards.length ? `Tarjetas: ${cards.join("; ")}.` : null,
    capPeriodAmount && t.cap_type === "bank" ? "El tope es por persona en cada banco." : null,
    capPeriodAmount && capTx && capTx < capPeriodAmount ? `Tope por compra: ${formatARS(capTx)}.` : null,
    installments.length ? `Hasta ${Math.max(...installments)} cuotas sin interés.` : null,
    fullDay ? null : `Horario: de ${String(p.daily_start_time).slice(0, 5)} a ${String(p.daily_stop_time).slice(0, 5)}.`,
  ].filter(Boolean);

  const bank = banks.length === 1 ? banks[0] : null;
  const tokens = [...((o.meta?.search_tags ?? []) as unknown[]), ...String(p.short_description ?? "").split("-")].map(compact);
  const reintegro = /reintegro/i.test(`${rows[1]} ${p.description ?? ""} ${p.title ?? ""}`) || !/descuento/i.test(`${rows[1]}`);
  // El nombre que usa MODO es interno ("TENNIS BISTRÓ Selecta"): el título se arma con los datos.
  const title = [`${pct}% de ${reintegro ? "reintegro" : "descuento"}`, merchantName ? `en ${merchantName}` : text(p.name), bank ? `con ${bank.name}` : null, segmentName ? `· ${segmentName}` : null].filter(Boolean).join(" ");

  const candidate: RawCandidate = {
    externalId,
    flags,
    kind: reintegro ? "reintegro" : "descuento",
    audience: "todos",
    merchantName: merchantName || undefined,
    categorySlug: tokens.map((k) => CATEGORY[k]).find(Boolean) ?? null,
    title: truncate(title, 140) ?? undefined,
    summary: truncate(text(p.description), 280),
    bank: bank?.name ?? null,
    wallet: banks.length ? null : "MODO",
    paymentMethodSlugs: banks.length ? banks.map((b) => b.slug) : ["modo"],
    discountKind: "porcentaje",
    discountValue: pct,
    capAmount,
    capPeriod,
    minPurchase: typeof t.min_amount === "number" && t.min_amount > 1 ? t.min_amount : null,
    validFrom,
    validUntil,
    daysOfWeek: days.length && days.length < 7 ? days : null,
    channel,
    conditions: truncate([lines.join(" "), tyc].filter(Boolean).join("\n\n"), 3800),
    requirements: [],
    sourceUrl: `${MODO_URL}/${p.slug}`,
  };
  return { state: "vigente", externalId, validUntil, candidate };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const int = (v: unknown, fallback: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);

/**
 * Lector de MODO. No usa su API (su robots.txt la prohíbe): lee el sitemap y las
 * páginas públicas de cada promo, de a una tanda por corrida y con pausa entre
 * consultas. Lo vencido no se vuelve a leer; lo vigente se revisa cada tantos días.
 * Se ajusta con sources.config: batchSize, delayMs, recheckDays, maxSeconds.
 */
export const modoCrawler: Crawler = {
  name: "modo",
  async crawl({ repo, source, fetcher = fetch, today, now = new Date() }) {
    const cfg = source.config;
    const batchSize = int(cfg.batchSize, 250, 1, 1000);
    const delayMs = int(cfg.delayMs, 300, 0, 10_000);
    const recheckDays = int(cfg.recheckDays, 7, 1, 60);
    const deadline = Date.now() + int(cfg.maxSeconds, 200, 5, 3600) * 1000;
    const robotsCache = new Map<string, string | null>();
    const at = (days: number) => new Date(now.getTime() + days * DAY_MS).toISOString();

    const synced = typeof cfg.sitemapSyncedAt === "string" ? Date.parse(cfg.sitemapSyncedAt) : NaN;
    if (!(now.getTime() - synced < DAY_MS)) {
      const xml = await fetchPage(MODO_SITEMAP_URL, fetcher, { maxBytes: 40 * 1024 * 1024, accept: "application/xml,text/xml", robotsCache });
      const slugs = parseModoSitemap(xml);
      if (!slugs.length) throw new Error("MODO: el sitemap no trae páginas de promos (cambió su estructura)");
      await repo.addSourceRecords(source.id, slugs.map((key) => ({ key, priority: modoPriority(key, today) })));
      await repo.updateSourceConfig(source.id, { sitemapSyncedAt: now.toISOString() });
    }

    const due = await repo.dueSourceRecords(source.id, now.toISOString(), batchSize);
    const out = { candidates: [] as RawCandidate[], removedExternalIds: [] as string[], checked: 0, skipped: 0, errors: 0 };
    let failedInARow = 0;
    for (const rec of due) {
      if (Date.now() > deadline) break;
      if (out.checked + out.errors > 0 && delayMs) await new Promise((r) => setTimeout(r, delayMs));
      let page: ModoPage;
      try {
        page = parseModoPromo(await fetchPage(`${MODO_URL}/${rec.key}`, fetcher, { robotsCache }), today);
        failedInARow = 0;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.startsWith("El robots.txt")) throw e;
        if (/respondió (404|410)$/.test(msg)) {
          page = { state: "sin_datos", externalId: null, validUntil: null, candidate: null };
        } else {
          out.errors++;
          await repo.saveSourceRecord(source.id, rec.key, { state: "error", nextCheckAt: at(1), error: msg.slice(0, 300) });
          // Si el sitio empieza a fallar seguido, se corta la tanda en vez de insistir.
          if (++failedInARow >= 5) {
            if (out.checked === 0) throw new Error(`MODO no responde: ${msg}`);
            break;
          }
          continue;
        }
      }
      out.checked++;
      if (page.candidate) out.candidates.push(page.candidate);
      else out.skipped++;
      // Estaba vigente y la página ya no trae la promo: se propone la baja.
      if (page.state === "sin_datos" && rec.state === "vigente" && rec.externalId) out.removedExternalIds.push(rec.externalId);
      await repo.saveSourceRecord(source.id, rec.key, {
        state: page.state,
        externalId: page.externalId ?? rec.externalId,
        validUntil: page.validUntil,
        nextCheckAt: page.state === "vencida" ? null : at(page.state === "vigente" ? recheckDays : 30),
        error: page.reason ?? null,
      });
    }
    return out;
  },
};

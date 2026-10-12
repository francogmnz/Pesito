import { daysBetween, todayAR } from "@/lib/domain/dates";
import { matchesQuery, normalizeText, slugify } from "@/lib/domain/fingerprint";
import type {
  IngestionRun,
  Merchant,
  ModerationEvent,
  PromoPayload,
  PromoStatus,
  PromoUserState,
  Promotion,
  PromotionReport,
  SourceRecordState,
  Submission,
  UserProfile,
} from "@/lib/domain/types";
import { outboundUrl, type Listing, type ListingInput, type Product, type ProductSummary } from "@/lib/domain/products";
import * as seed from "./demo-seed";
import type { AdminStats, NewSubmission, PromotionFilter, Repo, SourceRecordPatch } from "./repo";
import { LimitError } from "./errors";

interface ReportRow {
  id: string;
  promotionId: string;
  userId: string;
  reason: PromotionReport["reason"];
  comment: string | null;
  status: PromotionReport["status"];
  createdAt: string;
}

interface Store {
  merchants: Merchant[];
  promotions: Promotion[];
  profiles: Map<string, UserProfile>;
  states: Map<string, PromoUserState>;
  reports: ReportRow[];
  submissions: (Submission & { ipHash: string | null })[];
  events: ModerationEvent[];
  runs: IngestionRun[];
  sourceConfig: Map<string, Record<string, unknown>>;
  /** Clave: "idDeFuente|página". */
  records: Map<string, SourceRecordPatch & { key: string; priority: number }>;
  images: Map<string, { bytes: Uint8Array; type: string }>;
  /** Productos por código de barras y publicaciones por "comercio|página". */
  products: Map<string, Product & { search: string }>;
  listings: Map<string, Listing & { ean: string }>;
  priceHistory: { key: string; price: number; at: string }[];
  /** Clics por "comercio|tipo". */
  clicks: Map<string, number>;
  seq: number;
}

function createStore(): Store {
  const promotions = seed.buildDemoPromotions();
  const now = Date.now();
  const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();
  const today = todayAR();
  const store: Store = {
    merchants: [...seed.merchants],
    promotions,
    profiles: new Map(seed.buildDemoProfiles().map((p) => [p.id, p])),
    states: new Map([[`${seed.DEMO_USER_ID}|p-esquina-nacion`, { savedAt: iso(600), usedAt: null }]]),
    reports: [
      { id: "r-1", promotionId: "c-urbana", userId: seed.DEMO_USER_ID, reason: "codigo_invalido", comment: "Me dice que el código no existe.", status: "abierto", createdAt: iso(90) },
    ],
    submissions: [],
    events: [],
    runs: [],
    sourceConfig: new Map(),
    records: new Map(),
    images: new Map(),
    products: new Map(),
    listings: new Map(),
    priceHistory: [],
    clicks: new Map(),
    seq: 1,
  };
  const base = {
    changeType: "nueva" as const,
    sourceId: null,
    diff: null,
    matchedPromotionId: null,
    publishedPromotionId: null,
    duplicateOf: null,
    imagePath: null,
    aiExtraction: null,
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    ipHash: null,
  };
  const payload = (p: Partial<PromoPayload>): PromoPayload => ({
    kind: "reintegro",
    audience: "todos",
    merchantName: "",
    categorySlug: null,
    title: "",
    summary: null,
    bank: null,
    wallet: null,
    paymentMethodSlugs: [],
    discountKind: "porcentaje",
    discountValue: null,
    capAmount: null,
    capPeriod: "mes",
    minPurchase: null,
    validFrom: null,
    validUntil: null,
    daysOfWeek: null,
    channel: "ambos",
    conditions: null,
    requirements: [],
    sourceUrl: null,
    externalId: null,
    coupon: null,
    birthday: null,
    ...p,
  });
  store.submissions.push(
    {
      ...base,
      id: "s-1",
      origin: "usuario",
      status: "pendiente",
      sourceName: null,
      payload: payload({ merchantName: "Mercado del Barrio", title: "30% de reintegro en Mercado del Barrio con Ualá", wallet: "Ualá", discountValue: 30, capAmount: 4000, validUntil: addDays(today, 12), daysOfWeek: [2], sourceUrl: "https://example.com/promo-uala" }),
      flagReasons: [],
      fingerprint: "fp_demo1",
      submittedBy: seed.DEMO_USER_ID,
      submitterName: "Lucas",
      comments: "La vi en la app de Ualá, los martes.",
      createdAt: iso(45),
    },
    {
      ...base,
      id: "s-2",
      origin: "automatizacion",
      status: "pendiente",
      sourceName: "Fuente de ejemplo",
      payload: payload({ merchantName: "Súper La Esquina", title: "20% de reintegro en Súper La Esquina", wallet: "Mercado Pago", paymentMethodSlugs: ["mercado-pago"], discountValue: 20, capAmount: 5000, validUntil: addDays(today, 40), sourceUrl: "https://example.com/" }),
      flagReasons: ["Posible duplicado de una promo publicada"],
      fingerprint: "fp_demo2",
      submittedBy: null,
      submitterName: null,
      comments: null,
      createdAt: iso(180),
    },
    {
      ...base,
      id: "s-3",
      origin: "automatizacion",
      status: "pendiente",
      sourceName: "Fuente de ejemplo",
      payload: payload({ kind: "cupon", audience: "nuevos_clientes", merchantName: "TecnoPunto", title: "12% en la primera compra", discountValue: 12, validUntil: addDays(today, 15), coupon: { redemption: "codigo", code: "EJEMPLO12", newCustomersOnly: true, requiresExternalSignup: false, externalPlatform: null } }),
      flagReasons: ["Falta el enlace a la fuente oficial"],
      fingerprint: "fp_demo3",
      submittedBy: null,
      submitterName: null,
      comments: null,
      createdAt: iso(300),
    },
    {
      ...base,
      id: "s-4",
      origin: "usuario",
      status: "rechazada",
      sourceName: null,
      payload: payload({ merchantName: "Comercio desconocido", title: "90% en todo", discountValue: 90 }),
      flagReasons: [],
      fingerprint: "fp_demo4",
      submittedBy: seed.DEMO_USER_ID,
      submitterName: "Lucas",
      comments: null,
      reviewNote: "No encontramos la promo en ninguna fuente oficial.",
      reviewedBy: seed.DEMO_ADMIN_ID,
      reviewedAt: iso(1440),
      createdAt: iso(2000),
    },
  );
  return store;
}

function addDays(s: string, n: number) {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const g = globalThis as unknown as { __pesitoDemoStore?: Store };
function store(): Store {
  g.__pesitoDemoStore ??= createStore();
  return g.__pesitoDemoStore;
}
export function getDemoImage(path: string) {
  return store().images.get(path) ?? null;
}

/** Solo para tests. */
export function resetDemoStore() {
  g.__pesitoDemoStore = createStore();
}

const clone = <T>(x: T): T => structuredClone(x);

export function createMemoryRepo(): Repo {
  const s = () => store();
  const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(s().seq++).toString(36)}`;
  const nameOf = (userId: string | null) => (userId ? (s().profiles.get(userId)?.name ?? null) : null);

  function logEvent(e: Omit<ModerationEvent, "id" | "createdAt" | "actorName"> & { actorId: string | null }) {
    s().events.unshift({ ...e, id: id("ev"), actorName: nameOf(e.actorId), createdAt: new Date().toISOString() });
  }

  function upsertMerchant(name: string, categorySlug: string | null): Merchant {
    const st = s();
    const found = st.merchants.find((m) => normalizeText(m.name) === normalizeText(name));
    if (found) return found;
    const m: Merchant = { id: id("m"), slug: slugify(name), name, categorySlug, logoUrl: null, logoAuthorized: false };
    st.merchants.push(m);
    return m;
  }

  function promotionFromPayload(p: PromoPayload, fp: string, prev?: Promotion): Promotion {
    const pms = seed.paymentMethods.filter(
      (pm) =>
        p.paymentMethodSlugs.includes(pm.slug) ||
        (p.bank && normalizeText(pm.name) === normalizeText(p.bank)) ||
        (p.wallet && normalizeText(pm.name) === normalizeText(p.wallet)),
    );
    return {
      id: prev?.id ?? id("p"),
      kind: p.kind,
      audience: p.audience,
      merchant: upsertMerchant(p.merchantName, p.categorySlug),
      title: p.title,
      summary: p.summary,
      discountKind: p.discountKind,
      discountValue: p.discountValue,
      capAmount: p.capAmount,
      capPeriod: p.capAmount ? p.capPeriod : "sin_tope",
      minPurchase: p.minPurchase,
      validFrom: p.validFrom,
      validUntil: p.validUntil,
      daysOfWeek: p.daysOfWeek,
      channel: p.channel,
      conditions: p.conditions,
      requirements: p.requirements,
      sourceUrl: p.sourceUrl,
      sourceName: prev?.sourceName ?? null,
      sourceKind: prev?.sourceKind ?? null,
      externalId: p.externalId,
      status: prev?.status ?? "publicada",
      fingerprint: fp,
      paymentMethods: pms,
      coupon: p.coupon,
      birthday: p.birthday,
      lastVerifiedAt: new Date().toISOString(),
      manualEditAt: prev?.manualEditAt ?? null,
      updatedAt: new Date().toISOString(),
      isSample: false,
    };
  }

  const repo: Repo = {
    mode: "demo",

    async listCategories() {
      return clone(seed.categories);
    },
    async listPaymentMethods() {
      return clone(seed.paymentMethods);
    },
    async listMerchants() {
      return clone(s().merchants);
    },
    async updateMerchant(mid, patch) {
      const st = s();
      const i = st.merchants.findIndex((m) => m.id === mid);
      if (i < 0) throw new Error("Comercio inexistente");
      const next: Merchant = { ...st.merchants[i] };
      if (patch.categorySlug !== undefined) next.categorySlug = patch.categorySlug;
      if (patch.logoUrl !== undefined) next.logoUrl = patch.logoUrl;
      if (patch.logoAuthorized !== undefined) next.logoAuthorized = patch.logoAuthorized;
      st.merchants[i] = next;
      for (const p of st.promotions) if (p.merchant.id === mid) p.merchant = next;
      return clone(next);
    },
    async uploadMerchantLogo(_mid, bytes, contentType) {
      // En demo no hay almacenamiento: el logo queda embebido como data URL.
      return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
    },

    async listPromotions(f: PromotionFilter = {}) {
      const statuses = f.statuses ?? ["publicada"];
      const q = f.q?.trim() ?? "";
      let list = s().promotions.filter((p) => statuses.includes(p.status));
      if (f.kinds) list = list.filter((p) => f.kinds!.includes(p.kind));
      if (f.ids) list = list.filter((p) => f.ids!.includes(p.id));
      if (f.categorySlug) list = list.filter((p) => p.merchant.categorySlug === f.categorySlug);
      if (f.merchantSlug) list = list.filter((p) => p.merchant.slug === f.merchantSlug);
      if (f.paymentMethodIds?.length) list = list.filter((p) => p.paymentMethods.some((pm) => f.paymentMethodIds!.includes(pm.id)));
      if (q)
        list = list.filter((p) => matchesQuery([p.title, p.merchant.name, p.summary, p.merchant.categorySlug, ...p.paymentMethods.map((x) => x.name)].join(" "), q));
      return clone(list.slice(0, f.limit ?? 500));
    },
    async getPromotion(pid, opts) {
      const p = s().promotions.find((x) => x.id === pid);
      if (!p || (!opts?.includeUnpublished && p.status !== "publicada")) return null;
      return clone(p);
    },

    async getProfile(userId) {
      const p = s().profiles.get(userId);
      return p ? clone(p) : null;
    },
    async updateBirthday(userId, day, month) {
      const p = s().profiles.get(userId);
      if (p) Object.assign(p, { birthdayDay: day, birthdayMonth: month });
    },
    async updateDisplayName(userId, name) {
      const p = s().profiles.get(userId);
      if (p) p.name = name;
    },
    async setUserPaymentMethods(userId, ids) {
      const p = s().profiles.get(userId);
      if (p) p.paymentMethodIds = [...new Set(ids)];
    },

    async getUserStates(userId) {
      const out = new Map<string, PromoUserState>();
      for (const [k, v] of s().states) {
        const [u, p] = k.split("|");
        if (u === userId) out.set(p, { ...v });
      }
      return out;
    },
    async setSaved(userId, pid, saved) {
      const k = `${userId}|${pid}`;
      const cur = s().states.get(k) ?? { savedAt: null, usedAt: null };
      cur.savedAt = saved ? new Date().toISOString() : null;
      if (!cur.savedAt && !cur.usedAt) s().states.delete(k);
      else s().states.set(k, cur);
    },
    async setUsed(userId, pid, used) {
      const k = `${userId}|${pid}`;
      const cur = s().states.get(k) ?? { savedAt: null, usedAt: null };
      cur.usedAt = used ? new Date().toISOString() : null;
      if (!cur.savedAt && !cur.usedAt) s().states.delete(k);
      else s().states.set(k, cur);
    },

    async createReport(userId, pid, reason, comment) {
      const st = s();
      if (st.reports.some((r) => r.promotionId === pid && r.userId === userId && r.status === "abierto")) {
        throw new LimitError("Ya reportaste este cupón. Lo estamos revisando.");
      }
      const dayAgo = Date.now() - 86_400_000;
      if (st.reports.filter((r) => r.userId === userId && Date.parse(r.createdAt) > dayAgo).length >= 10) {
        throw new LimitError("Llegaste al límite de reportes por hoy.");
      }
      st.reports.unshift({ id: id("r"), promotionId: pid, userId, reason, comment, status: "abierto", createdAt: new Date().toISOString() });
      const open = new Set(st.reports.filter((r) => r.promotionId === pid && r.status === "abierto").map((r) => r.userId));
      const promo = st.promotions.find((p) => p.id === pid);
      if (promo && open.size >= 3 && promo.status === "publicada") {
        promo.status = "en_revision";
        logEvent({ entityType: "promotion", entityId: pid, action: "reportes", fromStatus: "publicada", toStatus: "en_revision", actorId: null, note: "3 reportes de personas distintas" });
      }
    },
    async listReports(status) {
      const st = s();
      return st.reports
        .filter((r) => !status || r.status === status)
        .map((r) => {
          const p = st.promotions.find((x) => x.id === r.promotionId);
          return { ...r, promotionTitle: p?.title ?? "Promo eliminada", merchantName: p?.merchant.name ?? "" };
        });
    },
    async resolveReport(rid, status, actorId, note) {
      const r = s().reports.find((x) => x.id === rid);
      if (!r) throw new Error("Reporte inexistente");
      const from = r.status;
      r.status = status;
      logEvent({ entityType: "report", entityId: rid, action: status, fromStatus: from, toStatus: status, actorId, note: note ?? null });
    },

    async createSubmission(n: NewSubmission) {
      const st = s();
      if (n.origin === "usuario") {
        if (!n.submittedBy) throw new Error("Falta el autor");
        const dayAgo = Date.now() - 86_400_000;
        const recent = st.submissions.filter((x) => Date.parse(x.createdAt) > dayAgo);
        if (recent.filter((x) => x.submittedBy === n.submittedBy).length >= 5) throw new LimitError("Llegaste al límite de sugerencias por hoy.");
        if (n.ipHash && recent.filter((x) => x.ipHash === n.ipHash).length >= 20) throw new LimitError("Demasiadas sugerencias desde esta conexión.");
        if (st.submissions.some((x) => x.submittedBy === n.submittedBy && x.fingerprint === n.fingerprint && (x.status === "pendiente" || x.status === "en_revision"))) {
          throw new LimitError("Ya nos mandaste esta promo. Está en revisión.");
        }
      }
      const sub: Submission & { ipHash: string | null } = {
        id: id("s"),
        origin: n.origin,
        status: "pendiente",
        changeType: n.changeType ?? "nueva",
        sourceId: n.sourceId ?? null,
        sourceName: n.sourceId ? (seed.sources.find((x) => x.id === n.sourceId)?.name ?? null) : null,
        payload: clone(n.payload),
        diff: n.diff ?? null,
        flagReasons: n.flagReasons ?? [],
        fingerprint: n.fingerprint,
        matchedPromotionId: n.matchedPromotionId ?? null,
        publishedPromotionId: null,
        duplicateOf: null,
        submittedBy: n.submittedBy ?? null,
        submitterName: nameOf(n.submittedBy ?? null),
        imagePath: n.imagePath ?? null,
        aiExtraction: n.aiExtraction ?? null,
        comments: n.comments ?? null,
        reviewNote: null,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: new Date().toISOString(),
        ipHash: n.ipHash ?? null,
      };
      st.submissions.unshift(sub);
      logEvent({ entityType: "submission", entityId: sub.id, action: "creada", fromStatus: null, toStatus: "pendiente", actorId: n.submittedBy ?? null, note: null });
      return clone(strip(sub));
    },
    async listSubmissions(f = {}) {
      return clone(
        s()
          .submissions.filter((x) => (!f.status || x.status === f.status) && (!f.origin || x.origin === f.origin) && (!f.submittedBy || x.submittedBy === f.submittedBy))
          .map(strip),
      );
    },
    async getSubmission(sid) {
      const x = s().submissions.find((y) => y.id === sid);
      return x ? clone(strip(x)) : null;
    },
    async updateSubmission(sid, patch, actorId, action) {
      const x = s().submissions.find((y) => y.id === sid);
      if (!x) throw new Error("Sugerencia inexistente");
      const from = x.status;
      Object.assign(x, clone(patch));
      if (patch.status && patch.status !== from) {
        x.reviewedBy = actorId;
        x.reviewedAt = new Date().toISOString();
      }
      logEvent({ entityType: "submission", entityId: sid, action, fromStatus: from, toStatus: x.status, actorId, note: patch.reviewNote ?? null });
      return clone(strip(x));
    },
    async getSubmissionImage(path) {
      return s().images.has(path) ? { url: `/api/sugerencias/imagen?path=${encodeURIComponent(path)}` } : null;
    },
    async saveSubmissionImage(userId, bytes, contentType) {
      const ext = contentType.split("/")[1];
      const path = `${userId}/${id("img")}.${ext}`;
      s().images.set(path, { bytes, type: contentType });
      return path;
    },
    async listModerationEvents(type, eid) {
      return clone(s().events.filter((e) => e.entityType === type && e.entityId === eid));
    },

    async publishPayload(payload, opts) {
      const st = s();
      const active: PromoStatus[] = ["borrador", "en_revision", "publicada"];
      if (st.promotions.some((p) => p.fingerprint === opts.fingerprint && active.includes(p.status))) {
        throw new LimitError("Ya existe una promo activa idéntica (misma huella).");
      }
      const p = promotionFromPayload(payload, opts.fingerprint);
      const src = opts.sourceId ? seed.sources.find((x) => x.id === opts.sourceId) : null;
      if (src) Object.assign(p, { sourceName: src.name, sourceKind: src.kind });
      st.promotions.unshift(p);
      logEvent({ entityType: "promotion", entityId: p.id, action: "publicada", fromStatus: null, toStatus: "publicada", actorId: opts.actorId, note: null });
      return clone(p);
    },
    async updatePromotionFromPayload(pid, payload, fp) {
      const st = s();
      const i = st.promotions.findIndex((p) => p.id === pid);
      if (i < 0) throw new Error("Promo inexistente");
      st.promotions[i] = promotionFromPayload(payload, fp, st.promotions[i]);
    },
    async setPromotionStatus(pid, status, actorId, note) {
      const p = s().promotions.find((x) => x.id === pid);
      if (!p) throw new Error("Promo inexistente");
      const from = p.status;
      p.status = status;
      logEvent({ entityType: "promotion", entityId: pid, action: status, fromStatus: from, toStatus: status, actorId, note: note ?? null });
    },
    async markManualEdit(pid) {
      const p = s().promotions.find((x) => x.id === pid);
      if (p) p.manualEditAt = new Date().toISOString();
    },
    async markVerified(pid) {
      const p = s().promotions.find((x) => x.id === pid);
      if (p) p.lastVerifiedAt = new Date().toISOString();
    },
    async expirePromotions(today) {
      let n = 0;
      for (const p of s().promotions) {
        if (p.status === "publicada" && p.validUntil && p.validUntil < today) {
          p.status = "vencida";
          n++;
        }
      }
      return n;
    },

    async listSources() {
      return clone(seed.sources.map((x) => ({ ...x, config: { ...x.config, ...s().sourceConfig.get(x.id) } })));
    },
    async listIngestionRuns(limit = 20) {
      return clone(s().runs.slice(0, limit));
    },
    async recordIngestionRun(run) {
      s().runs.unshift({ ...run, id: id("run"), sourceName: seed.sources.find((x) => x.id === run.sourceId)?.name ?? null });
    },
    async findPromotionByExternalId(sourceId, externalId) {
      const p = s().promotions.find((x) => x.externalId === externalId && x.sourceName === seed.sources.find((y) => y.id === sourceId)?.name);
      return p ? clone(p) : null;
    },

    async closeQueued(sourceId, fp, promotionId) {
      const open = s().submissions.filter((x) => x.sourceId === sourceId && x.fingerprint === fp && x.origin === "automatizacion" && (x.status === "pendiente" || x.status === "en_revision") && !x.publishedPromotionId);
      for (const x of open) Object.assign(x, { status: "aprobada", publishedPromotionId: promotionId, reviewedAt: new Date().toISOString(), reviewNote: "Publicada automáticamente: la fuente oficial ya no deja dudas." });
      return open.length;
    },
    async listQueuedFingerprints() {
      return s()
        .submissions.filter((x) => x.origin === "automatizacion" && x.fingerprint && (x.status !== "aprobada" || !x.publishedPromotionId))
        .map((x) => x.fingerprint!);
    },
    async updateSourceConfig(sourceId, patch) {
      s().sourceConfig.set(sourceId, { ...s().sourceConfig.get(sourceId), ...patch });
    },
    async addSourceRecords(sourceId, items) {
      for (const it of items) {
        const k = `${sourceId}|${it.key}`;
        if (!s().records.has(k)) s().records.set(k, { key: it.key, priority: it.priority, state: "nueva", externalId: null, nextCheckAt: new Date(0).toISOString() });
      }
    },
    async dueSourceRecords(sourceId, nowISO, limit) {
      return [...s().records.entries()]
        .filter(([k, x]) => k.startsWith(`${sourceId}|`) && x.nextCheckAt != null && x.nextCheckAt <= nowISO)
        .map(([, x]) => x)
        .sort((a, b) => b.priority - a.priority || a.nextCheckAt!.localeCompare(b.nextCheckAt!))
        .slice(0, limit)
        .map((x) => ({ key: x.key, state: x.state, externalId: x.externalId ?? null }));
    },
    async saveSourceRecord(sourceId, key, patch) {
      const k = `${sourceId}|${key}`;
      const prev = s().records.get(k);
      s().records.set(k, { key, ...prev, ...patch, priority: patch.state === "vigente" ? 1100 : (prev?.priority ?? 0) });
    },
    async upsertListing(input: ListingInput) {
      const st = s();
      const now = new Date().toISOString();
      if (!st.products.has(input.ean)) {
        st.products.set(input.ean, { id: `prod-${input.ean}`, ean: input.ean, brand: input.brand, name: input.title, category: input.category, imageUrl: input.imageUrl, search: normalizeText(`${input.brand ?? ""} ${input.title}`) });
      }
      const key = `${input.merchantSlug}|${input.externalKey}`;
      const prev = st.listings.get(key);
      const listPrice = input.listPrice != null && input.listPrice > input.price ? input.listPrice : null;
      const next = { merchantSlug: input.merchantSlug, merchantName: input.merchantName, url: input.url, title: input.title, price: input.price, listPrice, inStock: input.inStock, lastOkAt: now, ean: input.ean };
      if (!prev) {
        st.listings.set(key, { ...next, priceChangedAt: now });
        st.priceHistory.push({ key, price: input.price, at: now });
        return "nuevo";
      }
      const changed = prev.price !== next.price || prev.listPrice !== next.listPrice || prev.inStock !== next.inStock;
      st.listings.set(key, { ...next, priceChangedAt: prev.price !== next.price ? now : prev.priceChangedAt });
      if (changed) st.priceHistory.push({ key, price: input.price, at: now });
      return changed ? "cambio" : "igual";
    },
    async searchProducts(q, o = {}) {
      const limit = o.limit ?? 30;
      const st = s();
      const terms = normalizeText(q).split(" ").filter(Boolean);
      const out: ProductSummary[] = [];
      for (const p of st.products.values()) {
        if (!terms.every((t) => p.search.includes(t))) continue;
        const all = [...st.listings.values()].filter((l) => l.ean === p.ean && l.inStock);
        if (o.merchantSlug && !all.some((l) => l.merchantSlug === o.merchantSlug)) continue;
        const prices = all.map((l) => l.price);
        if (prices.length < (o.comparable ? 2 : 1)) continue;
        const min = Math.min(...prices);
        if ((o.minPrice != null && min < o.minPrice) || (o.maxPrice != null && min > o.maxPrice)) continue;
        out.push({ id: p.id, ean: p.ean, brand: p.brand, name: p.name, category: p.category, imageUrl: p.imageUrl, stores: prices.length, minPrice: Math.min(...prices), maxPrice: Math.max(...prices) });
      }
      const by = o.sort === "menor" ? (a: ProductSummary, b: ProductSummary) => a.minPrice - b.minPrice : o.sort === "mayor" ? (a: ProductSummary, b: ProductSummary) => b.minPrice - a.minPrice : (a: ProductSummary, b: ProductSummary) => b.stores - a.stores;
      return out.sort((a, b) => by(a, b) || a.name.localeCompare(b.name)).slice(o.offset ?? 0, (o.offset ?? 0) + limit);
    },
    async getProduct(id) {
      const st = s();
      const p = [...st.products.values()].find((x) => x.id === id);
      if (!p) return null;
      const listings = [...st.listings.entries()]
        .filter(([, l]) => l.ean === p.ean)
        .map(([key, l]) => clone({ merchantSlug: l.merchantSlug, merchantName: l.merchantName, url: l.url, title: l.title, price: l.price, listPrice: l.listPrice, inStock: l.inStock, lastOkAt: l.lastOkAt, priceChangedAt: l.priceChangedAt, history: st.priceHistory.filter((x) => x.key === key).map((x) => ({ price: x.price, at: x.at })) }));
      return { product: { id: p.id, ean: p.ean, brand: p.brand, name: p.name, category: p.category, imageUrl: p.imageUrl }, listings };
    },
    async resolveOutbound(target, kind) {
      const st = s();
      const slug = kind === "producto" ? [...st.listings.values()].find((l) => l.url === target)?.merchantSlug : st.promotions.find((p) => p.sourceUrl === target && p.status === "publicada")?.merchant.slug;
      if (!slug) return null;
      st.clicks.set(`${slug}|${kind}`, (st.clicks.get(`${slug}|${kind}`) ?? 0) + 1);
      return outboundUrl(target, null);
    },
    async clickSummary() {
      const st = s();
      const out = new Map<string, { slug: string; name: string; productClicks: number; promoClicks: number; last7Days: number }>();
      for (const [key, n] of st.clicks) {
        const [slug, kind] = key.split("|");
        const row = out.get(slug) ?? { slug, name: slug, productClicks: 0, promoClicks: 0, last7Days: 0 };
        if (kind === "producto") row.productClicks += n;
        else row.promoClicks += n;
        row.last7Days += n;
        out.set(slug, row);
      }
      return [...out.values()];
    },
    async priceHealth() {
      const st = s();
      const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
      const all = [...st.listings.values()];
      return { stale: all.filter((l) => l.lastOkAt < ago(120)).length, outOfStock: all.filter((l) => !l.inStock).length, changed24h: all.filter((l) => l.priceChangedAt >= ago(24)).length };
    },
    async cleanup() {
      const st = s();
      const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
      // Detalle de 90 días; de lo anterior queda el primer precio de cada semana.
      const keep = new Set<string>();
      st.priceHistory = st.priceHistory.filter((x) => {
        if (x.at >= cutoff) return true;
        const week = `${x.key}|${Math.floor(new Date(x.at).getTime() / (7 * 86_400_000))}`;
        if (keep.has(week)) return false;
        keep.add(week);
        return true;
      });
    },
    async priceMerchants() {
      const m = new Map<string, { slug: string; name: string; products: number }>();
      for (const l of s().listings.values()) m.set(l.merchantSlug, { slug: l.merchantSlug, name: l.merchantName, products: (m.get(l.merchantSlug)?.products ?? 0) + 1 });
      return [...m.values()].sort((a, b) => b.products - a.products);
    },
    async priceStats() {
      const st = s();
      const perEan = new Map<string, number>();
      for (const l of st.listings.values()) if (l.inStock) perEan.set(l.ean, (perEan.get(l.ean) ?? 0) + 1);
      return { products: st.products.size, listings: st.listings.size, comparable: [...perEan.values()].filter((n) => n > 1).length };
    },
    async sourceRecordStats(sourceId) {
      const out: Partial<Record<SourceRecordState, number>> = {};
      for (const [k, x] of s().records) if (k.startsWith(`${sourceId}|`)) out[x.state] = (out[x.state] ?? 0) + 1;
      return out;
    },

    async countRecentSubmissions(userId, ipHash, sinceISO) {
      const since = Date.parse(sinceISO);
      const recent = s().submissions.filter((x) => Date.parse(x.createdAt) > since);
      return { byUser: recent.filter((x) => x.submittedBy === userId).length, byIp: ipHash ? recent.filter((x) => x.ipHash === ipHash).length : 0 };
    },

    async adminStats(today): Promise<AdminStats> {
      const st = s();
      const count = (status: Submission["status"]) => st.submissions.filter((x) => x.status === status).length;
      return {
        submissions: { pendiente: count("pendiente"), en_revision: count("en_revision"), aprobada: count("aprobada"), rechazada: count("rechazada") },
        openReports: st.reports.filter((r) => r.status === "abierto").length,
        published: st.promotions.filter((p) => p.status === "publicada").length,
        inReview: st.promotions.filter((p) => p.status === "en_revision").length,
        expiringSoon: st.promotions.filter((p) => p.status === "publicada" && p.validUntil && p.validUntil >= today && daysBetween(today, p.validUntil) <= 7).length,
      };
    },
  };
  return repo;
}

function strip(x: Submission & { ipHash?: string | null }): Submission {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ipHash, ...rest } = x;
  return rest;
}

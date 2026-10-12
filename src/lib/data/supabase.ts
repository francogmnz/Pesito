import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { daysBetween } from "@/lib/domain/dates";
import { matchesQuery, normalizeText, slugify } from "@/lib/domain/fingerprint";
import type {
  BirthdayDetails,
  CouponDetails,
  IngestionRun,
  ModerationEvent,
  PaymentMethod,
  PromoPayload,
  PromoUserState,
  Promotion,
  Merchant,
  Requirement,
  Source,
  SourceRecordState,
  Submission,
} from "@/lib/domain/types";
import type { Listing, Product, ProductSummary } from "@/lib/domain/products";
import { friendlyDbError } from "./errors";
import type { AdminStats, NewSubmission, PromotionFilter, Repo } from "./repo";

/** Más alto que cualquier página sin leer (máximo 1000). */
const VIGENTE_PRIORITY = 1100;

const PROMO_SELECT = `
  id, kind, audience, title, summary, discount_kind, discount_value, cap_amount, cap_period, min_purchase,
  valid_from, valid_until, days_of_week, channel, conditions, requirements, source_url, external_id, status,
  fingerprint, last_verified_at, manual_edit_at, updated_at,
  merchant:merchants!inner ( id, slug, name, logo_url, logo_authorized, category:categories ( slug ) ),
  source:sources ( name, kind ),
  promotion_payment_methods ( payment_method:payment_methods ( id, slug, name, kind, color ) ),
  coupon:coupon_details ( redemption, code, new_customers_only, requires_external_signup, external_platform ),
  birthday:birthday_details ( window_kind, days_before, days_after, benefit, loyalty_program )
`;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
const one = <T>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));
const num = (x: unknown) => (x == null ? null : Number(x));

function toPaymentMethod(r: Row): PaymentMethod {
  return { id: r.id, slug: r.slug, name: r.name, kind: r.kind, color: r.color ?? null };
}

/** Para el panel: devuelve el logo aunque no esté autorizado (la UI pública lo oculta). */
function toMerchant(m: Row): Merchant {
  return { id: m.id, slug: m.slug, name: m.name, categorySlug: (one(m.category) as Row | null)?.slug ?? null, logoUrl: m.logo_url, logoAuthorized: m.logo_authorized };
}

function toPromotion(r: Row): Promotion {
  const m = one(r.merchant) as Row;
  const c = one(r.coupon) as Row | null;
  const b = one(r.birthday) as Row | null;
  const src = one(r.source) as Row | null;
  const coupon: CouponDetails | null = c
    ? { redemption: c.redemption, code: c.code, newCustomersOnly: c.new_customers_only, requiresExternalSignup: c.requires_external_signup, externalPlatform: c.external_platform }
    : null;
  const birthday: BirthdayDetails | null = b
    ? { windowKind: b.window_kind, daysBefore: b.days_before, daysAfter: b.days_after, benefit: b.benefit, loyaltyProgram: b.loyalty_program }
    : null;
  return {
    id: r.id,
    kind: r.kind,
    audience: r.audience,
    merchant: {
      id: m.id,
      slug: m.slug,
      name: m.name,
      categorySlug: (one(m.category) as Row | null)?.slug ?? null,
      logoUrl: m.logo_authorized ? m.logo_url : null,
      logoAuthorized: m.logo_authorized,
    },
    title: r.title,
    summary: r.summary,
    discountKind: r.discount_kind,
    discountValue: num(r.discount_value),
    capAmount: num(r.cap_amount),
    capPeriod: r.cap_period,
    minPurchase: num(r.min_purchase),
    validFrom: r.valid_from,
    validUntil: r.valid_until,
    daysOfWeek: r.days_of_week,
    channel: r.channel,
    conditions: r.conditions,
    requirements: (r.requirements ?? []) as Requirement[],
    sourceUrl: r.source_url,
    sourceName: src?.name ?? null,
    sourceKind: src?.kind ?? null,
    externalId: r.external_id,
    status: r.status,
    fingerprint: r.fingerprint,
    paymentMethods: (r.promotion_payment_methods ?? []).map((x: Row) => toPaymentMethod(one(x.payment_method) as Row)),
    coupon,
    birthday,
    lastVerifiedAt: r.last_verified_at,
    manualEditAt: r.manual_edit_at ?? null,
    updatedAt: r.updated_at,
    isSample: false,
  };
}

const SUB_SELECT = `*, source:sources ( name ), author:profiles!promo_submissions_submitted_by_fkey ( display_name )`;

function toSubmission(r: Row): Submission {
  return {
    id: r.id,
    origin: r.origin,
    status: r.status,
    changeType: r.change_type,
    sourceId: r.source_id ?? null,
    sourceName: (one(r.source) as Row | null)?.name ?? null,
    payload: r.payload,
    diff: r.diff,
    flagReasons: r.flag_reasons ?? [],
    fingerprint: r.fingerprint,
    matchedPromotionId: r.matched_promotion_id,
    publishedPromotionId: r.published_promotion_id,
    duplicateOf: r.duplicate_of,
    submittedBy: r.submitted_by,
    submitterName: (one(r.author) as Row | null)?.display_name ?? null,
    imagePath: r.image_path,
    aiExtraction: r.ai_extraction,
    comments: r.comments,
    reviewNote: r.review_note,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
  };
}

/** Desenvuelve la respuesta de Supabase. (Con maybeSingle el dato puede ser null: se chequea en cada uso.) */
async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw friendlyDbError(error);
  return data as NonNullable<T>;
}

const toProduct = (r: Row): Product => ({ id: r.id, ean: r.ean, brand: r.brand, name: r.name, category: r.category, imageUrl: r.image_url });

/**
 * Repo sobre Supabase. Con el cliente de la persona, RLS decide qué puede ver y hacer;
 * con el cliente de service role (tareas automáticas) tiene acceso completo.
 */
export function createSupabaseRepo(db: SupabaseClient): Repo {
  let pmCache: PaymentMethod[] | null = null;
  const paymentMethods = async () => (pmCache ??= (await must(db.from("payment_methods").select("id, slug, name, kind, color").order("name"))).map(toPaymentMethod));

  /** Convierte "banco" y "billetera" escritos a mano en slugs del catálogo. */
  async function resolvePayload(p: PromoPayload): Promise<PromoPayload> {
    const pms = await paymentMethods();
    const slugs = new Set(p.paymentMethodSlugs);
    for (const name of [p.bank, p.wallet]) {
      const hit = name ? pms.find((x) => normalizeText(x.name) === normalizeText(name)) : null;
      if (hit) slugs.add(hit.slug);
    }
    return { ...p, paymentMethodSlugs: [...slugs] };
  }

  async function log(entityType: ModerationEvent["entityType"], entityId: string, action: string, fromStatus: string | null, toStatus: string | null, actorId: string | null, note: string | null) {
    await must(db.from("moderation_events").insert({ entity_type: entityType, entity_id: entityId, action, from_status: fromStatus, to_status: toStatus, actor_id: actorId, note }));
  }

  return {
    mode: "supabase",

    async listCategories() {
      return must(db.from("categories").select("id, slug, name, icon").order("sort"));
    },
    listPaymentMethods: paymentMethods,
    async listMerchants() {
      const rows = await must(db.from("merchants").select("id, slug, name, logo_url, logo_authorized, category:categories ( slug )").order("name"));
      return rows.map(toMerchant);
    },
    async updateMerchant(mid, patch) {
      const upd: Row = {};
      if (patch.categorySlug !== undefined) {
        upd.category_id = patch.categorySlug ? (await must(db.from("categories").select("id").eq("slug", patch.categorySlug).single())).id : null;
      }
      if (patch.logoUrl !== undefined) upd.logo_url = patch.logoUrl;
      if (patch.logoAuthorized !== undefined) upd.logo_authorized = patch.logoAuthorized;
      return toMerchant(await must(db.from("merchants").update(upd).eq("id", mid).select("id, slug, name, logo_url, logo_authorized, category:categories ( slug )").single()));
    },
    async uploadMerchantLogo(mid, bytes, contentType) {
      const path = `${mid}/${crypto.randomUUID()}.${contentType.split("/")[1]}`;
      const { error } = await db.storage.from("logos").upload(path, bytes, { contentType, upsert: false });
      if (error) throw friendlyDbError(error);
      return db.storage.from("logos").getPublicUrl(path).data.publicUrl;
    },

    async listPromotions(f: PromotionFilter = {}) {
      let q = db.from("promotions").select(PROMO_SELECT).in("status", f.statuses ?? ["publicada"]).order("updated_at", { ascending: false }).limit(Math.min(f.limit ?? 500, 1000));
      if (f.kinds?.length) q = q.in("kind", f.kinds);
      if (f.ids?.length) q = q.in("id", f.ids);
      if (f.merchantSlug) q = q.eq("merchants.slug", f.merchantSlug);
      let list = (await must(q)).map(toPromotion);
      // Filtros que cruzan relaciones: se resuelven acá (volumen acotado por el límite).
      if (f.categorySlug) list = list.filter((p) => p.merchant.categorySlug === f.categorySlug);
      if (f.paymentMethodIds?.length) list = list.filter((p) => p.paymentMethods.some((pm) => f.paymentMethodIds!.includes(pm.id)));
      if (f.q) {
        const q = f.q;
        list = list.filter((p) => matchesQuery([p.title, p.merchant.name, p.summary, p.merchant.categorySlug, ...p.paymentMethods.map((x) => x.name)].join(" "), q));
      }
      return list;
    },
    async getPromotion(id, opts) {
      let q = db.from("promotions").select(PROMO_SELECT).eq("id", id);
      if (!opts?.includeUnpublished) q = q.eq("status", "publicada");
      const r = await must(q.maybeSingle());
      return r ? toPromotion(r) : null;
    },

    async getProfile(userId) {
      const p = await must(db.from("profiles").select("id, display_name, role, birthday_day, birthday_month").eq("id", userId).maybeSingle());
      if (!p) return null;
      const pms = await must(db.from("user_payment_methods").select("payment_method_id").eq("user_id", userId));
      return {
        id: p.id,
        name: p.display_name ?? "Hola",
        email: null,
        role: p.role,
        birthdayDay: p.birthday_day,
        birthdayMonth: p.birthday_month,
        paymentMethodIds: pms.map((x: Row) => x.payment_method_id),
      };
    },
    async updateBirthday(userId, day, month) {
      await must(db.from("profiles").update({ birthday_day: day, birthday_month: month }).eq("id", userId));
    },
    async updateDisplayName(userId, name) {
      await must(db.from("profiles").update({ display_name: name }).eq("id", userId));
    },
    async setUserPaymentMethods(userId, ids) {
      await must(db.from("user_payment_methods").delete().eq("user_id", userId));
      if (ids.length) await must(db.from("user_payment_methods").insert([...new Set(ids)].map((id) => ({ user_id: userId, payment_method_id: id }))));
    },

    async getUserStates(userId) {
      const rows = await must(db.from("user_promotion_states").select("promotion_id, saved_at, used_at").eq("user_id", userId));
      return new Map<string, PromoUserState>(rows.map((r: Row) => [r.promotion_id, { savedAt: r.saved_at, usedAt: r.used_at }]));
    },
    async setSaved(userId, promotionId, saved) {
      await setState(userId, promotionId, { saved_at: saved ? new Date().toISOString() : null });
    },
    async setUsed(userId, promotionId, used) {
      await setState(userId, promotionId, { used_at: used ? new Date().toISOString() : null });
    },

    async createReport(userId, promotionId, reason, comment) {
      await must(db.from("promotion_reports").insert({ user_id: userId, promotion_id: promotionId, reason, comment }));
    },
    async listReports(status) {
      let q = db.from("promotion_reports").select("*, promotion:promotions ( title, merchant:merchants ( name ) )").order("created_at", { ascending: false }).limit(200);
      if (status) q = q.eq("status", status);
      return (await must(q)).map((r: Row) => {
        const p = one(r.promotion) as Row | null;
        return {
          id: r.id,
          promotionId: r.promotion_id,
          promotionTitle: p?.title ?? "Promo eliminada",
          merchantName: (one(p?.merchant) as Row | null)?.name ?? "",
          userId: r.user_id,
          reason: r.reason,
          comment: r.comment,
          status: r.status,
          createdAt: r.created_at,
        };
      });
    },
    async resolveReport(id, status, actorId, note) {
      await must(db.from("promotion_reports").update({ status, resolved_by: actorId, resolved_at: new Date().toISOString() }).eq("id", id));
      await log("report", id, status, "abierto", status, actorId, note ?? null);
    },

    async createSubmission(n: NewSubmission) {
      const row = await must(
        db
          .from("promo_submissions")
          .insert({
            origin: n.origin,
            change_type: n.changeType ?? "nueva",
            source_id: n.sourceId ?? null,
            payload: n.payload,
            fingerprint: n.fingerprint,
            flag_reasons: n.flagReasons ?? [],
            diff: n.diff ?? null,
            matched_promotion_id: n.matchedPromotionId ?? null,
            submitted_by: n.submittedBy ?? null,
            image_path: n.imagePath ?? null,
            ai_extraction: n.aiExtraction ?? null,
            comments: n.comments ?? null,
            ip_hash: n.ipHash ?? null,
          })
          .select("id")
          .single(),
      );
      // La persona puede leer su sugerencia; la automatización usa service role.
      const full = await must(db.from("promo_submissions").select(SUB_SELECT).eq("id", row.id).single());
      return toSubmission(full);
    },
    async listSubmissions(f = {}) {
      let q = db.from("promo_submissions").select(SUB_SELECT).order("created_at", { ascending: false }).limit(200);
      if (f.status) q = q.eq("status", f.status);
      if (f.origin) q = q.eq("origin", f.origin);
      if (f.submittedBy) q = q.eq("submitted_by", f.submittedBy);
      return (await must(q)).map(toSubmission);
    },
    async getSubmission(id) {
      const r = await must(db.from("promo_submissions").select(SUB_SELECT).eq("id", id).maybeSingle());
      return r ? toSubmission(r) : null;
    },
    async updateSubmission(id, patch, actorId, action) {
      const before = await must(db.from("promo_submissions").select("status").eq("id", id).single());
      const upd: Row = {};
      if (patch.status) Object.assign(upd, { status: patch.status, reviewed_by: actorId, reviewed_at: new Date().toISOString() });
      if (patch.payload) upd.payload = patch.payload;
      if (patch.fingerprint !== undefined) upd.fingerprint = patch.fingerprint;
      if (patch.reviewNote !== undefined) upd.review_note = patch.reviewNote;
      if (patch.duplicateOf !== undefined) upd.duplicate_of = patch.duplicateOf;
      if (patch.publishedPromotionId !== undefined) upd.published_promotion_id = patch.publishedPromotionId;
      const r = await must(db.from("promo_submissions").update(upd).eq("id", id).select(SUB_SELECT).single());
      await log("submission", id, action, before.status, r.status, actorId, patch.reviewNote ?? null);
      return toSubmission(r);
    },
    async getSubmissionImage(path) {
      const { data, error } = await db.storage.from("sugerencias").createSignedUrl(path, 600);
      return error || !data ? null : { url: data.signedUrl };
    },
    async saveSubmissionImage(userId, bytes, contentType) {
      const ext = contentType.split("/")[1];
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await db.storage.from("sugerencias").upload(path, bytes, { contentType, upsert: false });
      if (error) throw friendlyDbError(error);
      return path;
    },
    async listModerationEvents(entityType, entityId) {
      const rows = await must(
        db.from("moderation_events").select("*, actor:profiles ( display_name )").eq("entity_type", entityType).eq("entity_id", entityId).order("created_at", { ascending: false }),
      );
      return rows.map((r: Row) => ({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        action: r.action,
        fromStatus: r.from_status,
        toStatus: r.to_status,
        actorName: (one(r.actor) as Row | null)?.display_name ?? null,
        note: r.note,
        createdAt: r.created_at,
      }));
    },

    async publishPayload(payload, opts) {
      const p = await resolvePayload(payload);
      const id = await must(
        db.rpc("publish_promotion", {
          p_payload: p,
          p_fingerprint: opts.fingerprint,
          p_merchant_slug: slugify(p.merchantName),
          p_source_id: opts.sourceId ?? null,
          p_actor: opts.actorId,
        }),
      );
      const promo = await this.getPromotion(id as string, { includeUnpublished: true });
      if (!promo) throw new Error("No se pudo leer la promo publicada");
      await log("promotion", promo.id, "publicada", null, "publicada", opts.actorId, null);
      return promo;
    },
    async updatePromotionFromPayload(id, payload, fp) {
      await must(db.rpc("update_promotion_from_payload", { p_id: id, p_payload: await resolvePayload(payload), p_fingerprint: fp }));
    },
    async setPromotionStatus(id, status, actorId, note) {
      const before = await must(db.from("promotions").select("status").eq("id", id).single());
      await must(db.from("promotions").update({ status }).eq("id", id));
      await log("promotion", id, status, before.status, status, actorId, note ?? null);
    },
    async markVerified(id) {
      await must(db.from("promotions").update({ last_verified_at: new Date().toISOString() }).eq("id", id));
    },
    async markManualEdit(id) {
      await must(db.from("promotions").update({ manual_edit_at: new Date().toISOString() }).eq("id", id));
    },
    async expirePromotions() {
      return (await must(db.rpc("expire_promotions"))) as number;
    },

    async listSources() {
      const rows = await must(db.from("sources").select("*").order("name"));
      return rows.map(
        (r: Row): Source => ({ id: r.id, name: r.name, url: r.url, kind: r.kind, active: r.active, adapter: r.adapter, config: r.config ?? {}, autoPublish: r.auto_publish, lastRunAt: r.last_run_at }),
      );
    },
    async listIngestionRuns(limit = 20) {
      const rows = await must(db.from("ingestion_runs").select("*, source:sources ( name )").order("started_at", { ascending: false }).limit(limit));
      return rows.map(
        (r: Row): IngestionRun => ({
          id: r.id,
          sourceId: r.source_id,
          sourceName: (one(r.source) as Row | null)?.name ?? null,
          startedAt: r.started_at,
          finishedAt: r.finished_at,
          found: r.found,
          created: r.created,
          updated: r.updated,
          verified: r.verified,
          flagged: r.flagged,
          error: r.error,
        }),
      );
    },
    async recordIngestionRun(run) {
      await must(
        db.from("ingestion_runs").insert({
          source_id: run.sourceId,
          started_at: run.startedAt,
          finished_at: run.finishedAt,
          found: run.found,
          created: run.created,
          updated: run.updated,
          verified: run.verified,
          flagged: run.flagged,
          error: run.error,
        }),
      );
      if (run.sourceId) await must(db.from("sources").update({ last_run_at: run.finishedAt ?? run.startedAt }).eq("id", run.sourceId));
    },
    async findPromotionByExternalId(sourceId, externalId) {
      const r = await must(db.from("promotions").select(PROMO_SELECT).eq("source_id", sourceId).eq("external_id", externalId).maybeSingle());
      return r ? toPromotion(r) : null;
    },

    async closeQueued(sourceId, fp, promotionId) {
      const rows = await must(
        db
          .from("promo_submissions")
          .update({ status: "aprobada", published_promotion_id: promotionId, reviewed_at: new Date().toISOString(), review_note: "Publicada automáticamente: la fuente oficial ya no deja dudas." })
          .eq("source_id", sourceId)
          .eq("fingerprint", fp)
          .eq("origin", "automatizacion")
          .in("status", ["pendiente", "en_revision"])
          .is("published_promotion_id", null)
          .select("id"),
      );
      return (rows as Row[]).length;
    },
    async listQueuedFingerprints() {
      const out: string[] = [];
      // Supabase devuelve de a 1.000 filas: se recorre por páginas.
      for (let from = 0; from < 50_000; from += 1000) {
        const rows = await must(
          db.from("promo_submissions").select("fingerprint, status, published_promotion_id").eq("origin", "automatizacion").not("fingerprint", "is", null).order("id").range(from, from + 999),
        );
        for (const r of rows as Row[]) if (r.status !== "aprobada" || !r.published_promotion_id) out.push(r.fingerprint);
        if (rows.length < 1000) break;
      }
      return out;
    },
    async updateSourceConfig(sourceId, patch) {
      const cur = await must(db.from("sources").select("config").eq("id", sourceId).single());
      await must(db.from("sources").update({ config: { ...(cur.config ?? {}), ...patch } }).eq("id", sourceId));
    },
    async addSourceRecords(sourceId, items) {
      for (let i = 0; i < items.length; i += 1000) {
        // next_check_at en el pasado: quedan para leer en esta misma corrida (el default now() las dejaría para la siguiente).
        const rows = items.slice(i, i + 1000).map((it) => ({ source_id: sourceId, key: it.key, priority: it.priority, next_check_at: new Date(0).toISOString() }));
        const { error } = await db.from("source_records").upsert(rows, { onConflict: "source_id,key", ignoreDuplicates: true });
        if (error) throw friendlyDbError(error);
      }
    },
    async dueSourceRecords(sourceId, nowISO, limit) {
      const rows = await must(
        db.from("source_records").select("key, state, external_id").eq("source_id", sourceId).lte("next_check_at", nowISO).order("priority", { ascending: false }).order("next_check_at").limit(limit),
      );
      return rows.map((r: Row) => ({ key: r.key, state: r.state, externalId: r.external_id }));
    },
    async saveSourceRecord(sourceId, key, patch) {
      const upd: Row = { state: patch.state, next_check_at: patch.nextCheckAt, last_checked_at: new Date().toISOString(), error: patch.error ?? null };
      if (patch.externalId !== undefined) upd.external_id = patch.externalId;
      if (patch.validUntil !== undefined) upd.valid_until = patch.validUntil;
      // Mantener al día lo ya publicado va antes que descubrir páginas nuevas.
      if (patch.state === "vigente") upd.priority = VIGENTE_PRIORITY;
      const { error } = await db.from("source_records").update(upd).eq("source_id", sourceId).eq("key", key);
      if (error) throw friendlyDbError(error);
    },
    async sourceRecordStats(sourceId) {
      const states: SourceRecordState[] = ["nueva", "vigente", "vencida", "omitida", "sin_datos", "error"];
      const counts = await Promise.all(states.map((st) => db.from("source_records").select("key", { count: "exact", head: true }).eq("source_id", sourceId).eq("state", st)));
      return Object.fromEntries(states.map((st, i) => [st, counts[i].count ?? 0]));
    },

    async upsertListing(input) {
      return (await must(db.rpc("upsert_listing", { p: { ...input, search: normalizeText(`${input.brand ?? ""} ${input.title}`) } }))) as "nuevo" | "cambio" | "igual";
    },
    async searchProducts(q, o = {}) {
      const limit = o.limit ?? 30;
      let query = db.from("product_summaries").select("id, ean, brand, name, category, image_url, stores, min_price, max_price").gt("stores", o.comparable ? 1 : 0);
      if (o.minPrice != null) query = query.gte("min_price", o.minPrice);
      if (o.maxPrice != null) query = query.lte("min_price", o.maxPrice);
      for (const term of normalizeText(q).split(" ").filter(Boolean).slice(0, 6)) query = query.ilike("search", `%${term.replace(/[%_]/g, "")}%`);
      const sorted = o.sort === "menor" ? query.order("min_price", { ascending: true }) : o.sort === "mayor" ? query.order("min_price", { ascending: false }) : query.order("stores", { ascending: false });
      const rows = await must(sorted.order("name").order("id").range(o.offset ?? 0, (o.offset ?? 0) + limit - 1));
      return (rows as Row[]).map((r): ProductSummary => ({ ...toProduct(r), stores: r.stores, minPrice: Number(r.min_price), maxPrice: Number(r.max_price) }));
    },
    async getProduct(id) {
      const { data: p, error } = await db.from("products").select("id, ean, brand, name, category, image_url").eq("id", id).maybeSingle();
      if (error) throw friendlyDbError(error);
      if (!p) return null;
      const rows = await must(db.from("merchant_products").select("url, title, price, list_price, in_stock, last_ok_at, price_changed_at, merchant:merchants!inner ( slug, name )").eq("product_id", id));
      const listings = (rows as Row[]).map((r): Listing => {
        const m = one(r.merchant) as Row;
        return { merchantSlug: m.slug, merchantName: m.name, url: r.url, title: r.title, price: Number(r.price), listPrice: r.list_price == null ? null : Number(r.list_price), inStock: r.in_stock, lastOkAt: r.last_ok_at, priceChangedAt: r.price_changed_at };
      });
      return { product: toProduct(p as Row), listings };
    },
    async priceStats() {
      const [products, listings, comparable] = await Promise.all([
        db.from("products").select("id", { count: "exact", head: true }),
        db.from("merchant_products").select("id", { count: "exact", head: true }),
        db.from("product_summaries").select("id", { count: "exact", head: true }).gt("stores", 1),
      ]);
      return { products: products.count ?? 0, listings: listings.count ?? 0, comparable: comparable.count ?? 0 };
    },

    async countRecentSubmissions(userId, ipHash, sinceISO) {
      const byUser = await db.from("promo_submissions").select("id", { count: "exact", head: true }).eq("submitted_by", userId).gt("created_at", sinceISO);
      // El límite por IP lo aplica el trigger de la base (las personas no pueden leer sugerencias ajenas).
      void ipHash;
      return { byUser: byUser.count ?? 0, byIp: 0 };
    },

    async adminStats(today): Promise<AdminStats> {
      const count = async (table: string, apply: (q: any) => any) => (await apply(db.from(table).select("id", { count: "exact", head: true }))).count ?? 0;
      const [pendiente, en_revision, aprobada, rechazada, openReports, published, inReview] = await Promise.all([
        count("promo_submissions", (q) => q.eq("status", "pendiente")),
        count("promo_submissions", (q) => q.eq("status", "en_revision")),
        count("promo_submissions", (q) => q.eq("status", "aprobada")),
        count("promo_submissions", (q) => q.eq("status", "rechazada")),
        count("promotion_reports", (q) => q.eq("status", "abierto")),
        count("promotions", (q) => q.eq("status", "publicada")),
        count("promotions", (q) => q.eq("status", "en_revision")),
      ]);
      const soon = await must(db.from("promotions").select("valid_until").eq("status", "publicada").gte("valid_until", today).limit(1000));
      const expiringSoon = soon.filter((r: Row) => daysBetween(today, r.valid_until) <= 7).length;
      return { submissions: { pendiente, en_revision, aprobada, rechazada }, openReports, published, inReview, expiringSoon };
    },
  };

  async function setState(userId: string, promotionId: string, patch: Row) {
    const cur = await must(db.from("user_promotion_states").select("saved_at, used_at").eq("user_id", userId).eq("promotion_id", promotionId).maybeSingle());
    const next = { saved_at: cur?.saved_at ?? null, used_at: cur?.used_at ?? null, ...patch };
    if (!next.saved_at && !next.used_at) {
      await must(db.from("user_promotion_states").delete().eq("user_id", userId).eq("promotion_id", promotionId));
    } else {
      await must(db.from("user_promotion_states").upsert({ user_id: userId, promotion_id: promotionId, ...next }));
    }
  }
}

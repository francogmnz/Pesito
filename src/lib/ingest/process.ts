import type { Repo } from "@/lib/data/repo";
import { findDuplicates } from "@/lib/domain/duplicates";
import { fingerprint } from "@/lib/domain/fingerprint";
import type { PromoPayload, Promotion, Source, Submission } from "@/lib/domain/types";
import { payloadSchema, publishProblems } from "@/lib/domain/validation";
import type { RawCandidate } from "./adapters";

export interface IngestResult {
  found: number;
  created: number;
  updated: number;
  verified: number;
  flagged: number;
  skippedExpired: number;
}

/** Completa un candidato con valores por defecto razonables para que sea comparable y revisable. */
export function toPayload(c: RawCandidate, source: Source): PromoPayload {
  const kind = c.kind ?? "reintegro";
  const discountKind = c.discountKind ?? (c.discountValue == null && kind === "cumple" ? "regalo" : "porcentaje");
  return {
    kind,
    audience: c.audience ?? (kind === "cupon" ? "nuevos_clientes" : kind === "cumple" ? "cumpleanieros" : "todos"),
    merchantName: c.merchantName ?? "",
    categorySlug: c.categorySlug ?? null,
    title: c.title ?? (c.merchantName ? `Promo en ${c.merchantName}` : ""),
    summary: c.summary ?? null,
    bank: c.bank ?? null,
    wallet: c.wallet ?? null,
    paymentMethodSlugs: c.paymentMethodSlugs ?? [],
    discountKind,
    discountValue: discountKind === "regalo" ? null : (c.discountValue ?? null),
    capAmount: c.capAmount ?? null,
    capPeriod: c.capAmount ? (c.capPeriod ?? "mes") : "sin_tope",
    minPurchase: c.minPurchase ?? null,
    validFrom: c.validFrom ?? null,
    validUntil: c.validUntil ?? null,
    daysOfWeek: c.daysOfWeek ?? null,
    channel: c.channel ?? "ambos",
    conditions: c.conditions ?? null,
    requirements: c.requirements ?? [],
    // Si la promo no trae su propio enlace, la fuente es la referencia oficial.
    sourceUrl: c.sourceUrl ?? source.url,
    externalId: c.externalId,
    coupon: kind === "cupon" ? (c.coupon ?? null) : null,
    birthday: kind === "cumple" ? (c.birthday ?? null) : null,
  };
}

const COMPARED: (keyof PromoPayload)[] = ["title", "discountKind", "discountValue", "capAmount", "minPurchase", "validFrom", "validUntil", "daysOfWeek", "channel", "conditions"];

export function diffAgainst(p: Promotion, next: PromoPayload): Submission["diff"] {
  const current: Partial<PromoPayload> = {
    title: p.title,
    discountKind: p.discountKind,
    discountValue: p.discountValue,
    capAmount: p.capAmount,
    minPurchase: p.minPurchase,
    validFrom: p.validFrom,
    validUntil: p.validUntil,
    daysOfWeek: p.daysOfWeek,
    channel: p.channel,
    conditions: p.conditions,
  };
  const out: NonNullable<Submission["diff"]> = {};
  for (const k of COMPARED) {
    if (JSON.stringify(current[k] ?? null) !== JSON.stringify(next[k] ?? null)) out[k] = { antes: current[k] ?? null, despues: next[k] ?? null };
  }
  if ((p.coupon?.code ?? null) !== (next.coupon?.code ?? null)) out["coupon.code"] = { antes: p.coupon?.code ?? null, despues: next.coupon?.code ?? null };
  return Object.keys(out).length ? out : null;
}

/** Un cambio es menor si solo se extiende la vigencia: se puede aplicar solo en fuentes oficiales con publicación automática. */
function isMinorChange(diff: NonNullable<Submission["diff"]>): boolean {
  const keys = Object.keys(diff);
  return keys.length === 1 && keys[0] === "validUntil" && typeof diff.validUntil.despues === "string" && (diff.validUntil.antes == null || diff.validUntil.despues > String(diff.validUntil.antes));
}

/**
 * Procesa los candidatos de una fuente:
 * nuevos → se publican solo si la fuente es oficial, tiene publicación automática y no hay dudas; si no, van a revisión.
 * existentes sin cambios → se marcan como verificados.
 * existentes con cambios → cambio menor se aplica (fuente oficial con auto); el resto va a revisión con el detalle del cambio.
 * desaparecidos del feed → se manda a revisión una posible baja.
 * vencidos → se ignoran.
 */
export async function processCandidates(repo: Repo, source: Source, candidates: RawCandidate[], opts: { today: string }): Promise<IngestResult> {
  const r: IngestResult = { found: candidates.length, created: 0, updated: 0, verified: 0, flagged: 0, skippedExpired: 0 };
  const active = await repo.listPromotions({ statuses: ["publicada", "en_revision", "borrador"], limit: 1000 });
  const pending = await repo.listSubmissions({ status: "pendiente" });
  const pendingFps = new Set(pending.map((s) => s.fingerprint));
  const seenExternal = new Set<string>();
  const trusted = source.kind === "oficial" && source.autoPublish;

  const queue = async (payload: PromoPayload, fp: string, extra: { flagReasons: string[]; changeType?: "nueva" | "cambio" | "baja"; matchedPromotionId?: string | null; diff?: Submission["diff"] }) => {
    if (pendingFps.has(fp)) return; // ya está esperando revisión
    pendingFps.add(fp);
    await repo.createSubmission({ origin: "automatizacion", sourceId: source.id, payload, fingerprint: fp, ...extra });
    r.flagged++;
  };

  for (const c of candidates) {
    seenExternal.add(c.externalId);
    const payload = toPayload(c, source);
    if (payload.validUntil && payload.validUntil < opts.today) {
      r.skippedExpired++;
      continue;
    }
    const fp = fingerprint(payload);
    const existing = (await repo.findPromotionByExternalId(source.id, c.externalId)) ?? active.find((p) => p.fingerprint === fp) ?? null;

    if (existing) {
      const diff = diffAgainst(existing, payload);
      if (!diff) {
        await repo.markVerified(existing.id);
        r.verified++;
      } else if (trusted && isMinorChange(diff) && payloadSchema.safeParse(payload).success) {
        await repo.updatePromotionFromPayload(existing.id, payload, fp);
        r.updated++;
      } else {
        await queue(payload, fp, { flagReasons: ["Cambió en la fuente"], changeType: "cambio", matchedPromotionId: existing.id, diff });
      }
      continue;
    }

    const flags = publishProblems(payload);
    if (source.kind !== "oficial") flags.push("La fuente no es oficial: verificar");
    const dups = findDuplicates({ ...payload, fingerprint: fp }, active);
    if (dups.length) flags.push(`Posible duplicado de “${dups[0].promotion.title}”`);

    if (trusted && flags.length === 0) {
      try {
        const created = await repo.publishPayload(payload, { fingerprint: fp, sourceId: source.id, actorId: null });
        active.push(created);
        r.created++;
      } catch (e) {
        await queue(payload, fp, { flagReasons: [`No se pudo publicar: ${e instanceof Error ? e.message : "error"}`] });
      }
    } else {
      await queue(payload, fp, { flagReasons: flags });
    }
  }

  // Bajas: solo si el feed trajo datos (un feed vacío suele ser un error de la fuente).
  if (candidates.length > 0) {
    for (const p of active) {
      if (p.status !== "publicada" || !p.externalId || p.sourceName !== source.name || seenExternal.has(p.externalId)) continue;
      const payload = toPayload({ ...promotionToRaw(p) }, source);
      await queue(payload, `${p.fingerprint}_baja`, { flagReasons: ["Ya no aparece en la fuente"], changeType: "baja", matchedPromotionId: p.id });
    }
  }
  return r;
}

function promotionToRaw(p: Promotion): RawCandidate {
  return {
    externalId: p.externalId ?? p.id,
    kind: p.kind,
    audience: p.audience,
    merchantName: p.merchant.name,
    categorySlug: p.merchant.categorySlug,
    title: p.title,
    summary: p.summary,
    paymentMethodSlugs: p.paymentMethods.map((m) => m.slug),
    discountKind: p.discountKind,
    discountValue: p.discountValue,
    capAmount: p.capAmount,
    capPeriod: p.capPeriod,
    minPurchase: p.minPurchase,
    validFrom: p.validFrom,
    validUntil: p.validUntil,
    daysOfWeek: p.daysOfWeek,
    channel: p.channel,
    conditions: p.conditions,
    requirements: p.requirements,
    sourceUrl: p.sourceUrl,
    coupon: p.coupon,
    birthday: p.birthday,
  };
}

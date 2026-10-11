import type { Repo } from "@/lib/data/repo";
import { findDuplicates } from "@/lib/domain/duplicates";
import { fingerprint, normalizeText } from "@/lib/domain/fingerprint";
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

const COMPARED: (keyof PromoPayload)[] = ["title", "summary", "discountKind", "discountValue", "capAmount", "minPurchase", "validFrom", "validUntil", "daysOfWeek", "channel", "conditions"];

export function diffAgainst(p: Promotion, next: PromoPayload): Submission["diff"] {
  const current: Partial<PromoPayload> = {
    title: p.title,
    summary: p.summary,
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

const sameSet = (a: number[] | null, b: number[] | null) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());

/**
 * La misma promo ofrecida por otra billetera o banco (por ejemplo, un código de Mastercard que sirve con Ualá y con Prex):
 * mismo comercio, beneficio, tope, mínimo, días, vencimiento y código. Solo cambia el medio de pago.
 */
export function sameBenefit(next: PromoPayload, p: Promotion): boolean {
  return (
    normalizeText(next.merchantName) === normalizeText(p.merchant.name) &&
    next.discountKind === p.discountKind &&
    (next.discountValue ?? null) === (p.discountValue ?? null) &&
    (next.capAmount ?? null) === (p.capAmount ?? null) &&
    next.capPeriod === p.capPeriod &&
    (next.minPurchase ?? null) === (p.minPurchase ?? null) &&
    (next.validUntil ?? null) === (p.validUntil ?? null) &&
    sameSet(next.daysOfWeek, p.daysOfWeek) &&
    (next.coupon?.code ?? "").toUpperCase() === (p.coupon?.code ?? "").toUpperCase()
  );
}

/** Aclaraciones que acompañan a la promo pero no frenan su publicación. En la cola se ven con este prefijo. */
export const NOTE_PREFIX = "Nota: ";
export const isBlocking = (reason: string) => !reason.startsWith(NOTE_PREFIX);

/**
 * Dudas que ningún lector puede resolver solo y que conviene que mire una persona
 * antes de que la promo se publique sin revisión.
 */
function sanityFlags(p: PromoPayload): string[] {
  const out: string[] = [];
  if (p.discountKind === "porcentaje" && (p.discountValue ?? 0) >= 70) out.push(`El porcentaje es muy alto (${p.discountValue}%): confirmar que no sea solo para usuarios nuevos o un caso especial`);
  if (/^(comercios?|locales|tiendas|marcas|productos)\b.*\b(adherid|seleccionad|participantes|que acept)/i.test(p.merchantName) || /^(comercios|varios|otros)$/i.test(p.merchantName)) {
    out.push(`“${p.merchantName}” no es un comercio puntual: revisar dónde aplica`);
  }
  if (/<[a-z/]|&[a-z]+;|\uFFFD/i.test(`${p.title} ${p.summary ?? ""} ${p.merchantName}`)) out.push("El texto tiene caracteres extraños: revisar título y resumen");
  if (p.capAmount != null && p.minPurchase != null && p.discountKind === "porcentaje" && p.discountValue && (p.minPurchase * p.discountValue) / 100 > p.capAmount) {
    out.push("Con la compra mínima ya se supera el tope: revisar tope y mínimo");
  }
  return out;
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
export interface ProcessOptions {
  today: string;
  /** La corrida trae solo una parte de la fuente: que algo no venga no significa que se dio de baja. */
  partial?: boolean;
  /** Bajas confirmadas por el lector (la página de la promo dejó de existir). */
  removedExternalIds?: string[];
}

export async function processCandidates(repo: Repo, source: Source, candidates: RawCandidate[], opts: ProcessOptions): Promise<IngestResult> {
  const r: IngestResult = { found: candidates.length, created: 0, updated: 0, verified: 0, flagged: 0, skippedExpired: 0 };
  const active = await repo.listPromotions({ statuses: ["publicada", "en_revision", "borrador"], limit: 1000 });
  // No volver a encolar lo que ya está en la cola ni lo que el equipo ya rechazó.
  const pendingFps = new Set<string | null>(await repo.listQueuedFingerprints());
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

    // La misma promo ya publicada con otro medio de pago: no se duplica, se propone sumarle el medio de pago.
    const twin = active.find((p) => p.id !== existing?.id && p.status === "publicada" && p.paymentMethods.length > 0 && payload.paymentMethodSlugs.length > 0 && sameBenefit(payload, p));

    // Una copia archivada de esta fuente no cuenta si la promo sigue publicada con otro medio de pago.
    if (existing && !(existing.status === "archivada" && twin)) {
      // Si la promo ya suma medios de pago de otras fuentes, un cambio de esta fuente no los pisa.
      const own = new Set(payload.paymentMethodSlugs);
      const others = existing.paymentMethods.map((m) => m.slug).filter((s) => !own.has(s));
      if (own.size && others.length) payload.paymentMethodSlugs = [...payload.paymentMethodSlugs, ...others];
      const diff = diffAgainst(existing, payload);
      if (!diff) {
        await repo.markVerified(existing.id);
        r.verified++;
      } else if (existing.status === "archivada") {
        // La dio de baja una persona: la fuente no la revive.
        continue;
      } else if (trusted && payloadSchema.safeParse(payload).success && (isMinorChange(diff) || (!existing.manualEditAt && !("discountValue" in diff) && !("discountKind" in diff) && !(c.flags ?? []).length && !publishProblems(payload).length && !sanityFlags(payload).length))) {
        // Fuente oficial sin dudas: el cambio se aplica solo (salvo que cambie el beneficio en sí: eso lo mira una persona). Si la promo estaba vencida y la fuente la renovó, vuelve a publicarse.
        await repo.updatePromotionFromPayload(existing.id, payload, fp);
        if (existing.status === "vencida" && (!payload.validUntil || payload.validUntil >= opts.today)) await repo.setPromotionStatus(existing.id, "publicada", null, "Renovada en la fuente");
        if (pendingFps.has(fp)) await repo.closeQueued(source.id, fp, existing.id);
        r.updated++;
      } else {
        const why = existing.manualEditAt ? ["Cambió en la fuente y la promo había sido corregida a mano"] : ["Cambió en la fuente", ...(c.flags ?? []), ...sanityFlags(payload)];
        await queue(payload, fp, { flagReasons: why, changeType: "cambio", matchedPromotionId: existing.id, diff });
      }
      continue;
    }

    if (twin) {
      const have = twin.paymentMethods.map((m) => m.slug);
      const missing = payload.paymentMethodSlugs.filter((s) => !have.includes(s));
      if (!missing.length) {
        await repo.markVerified(twin.id);
        r.verified++;
        continue;
      }
      const merged = { ...toPayload({ ...promotionToRaw(twin), paymentMethodSlugs: [...have, ...missing] }, source), sourceUrl: twin.sourceUrl };
      await queue(merged, fingerprint(merged), {
        flagReasons: [`Es la misma promo que “${twin.title}”: en vez de duplicarla, se le suma ${payload.wallet ?? payload.bank ?? missing.join(", ")} como medio de pago`],
        changeType: "cambio",
        matchedPromotionId: twin.id,
        diff: { paymentMethodSlugs: { antes: have, despues: [...have, ...missing] } },
      });
      continue;
    }

    const flags = [...publishProblems(payload), ...(c.flags ?? []), ...sanityFlags(payload)];
    if (source.kind !== "oficial") flags.push("La fuente no es oficial: verificar");
    // Duplicado casi seguro (mismo comercio, tipo, beneficio, fechas y medio de pago, o mismo código) frena; uno apenas parecido es solo una nota.
    const dups = findDuplicates({ ...payload, fingerprint: fp }, active);
    const notes = (c.notes ?? []).map((n) => NOTE_PREFIX + n);
    if (dups.length && dups[0].score >= 0.9) flags.push(`Posible duplicado de “${dups[0].promotion.title}”`);
    else if (dups.length) notes.push(`${NOTE_PREFIX}Hay otra promo parecida en el mismo comercio: “${dups[0].promotion.title}”`);

    if (trusted && flags.length === 0) {
      try {
        const created = await repo.publishPayload(payload, { fingerprint: fp, sourceId: source.id, actorId: null });
        active.push(created);
        r.created++;
        // Si estaba esperando revisión de una corrida anterior, ya no hace falta.
        if (pendingFps.has(fp)) await repo.closeQueued(source.id, fp, created.id);
      } catch (e) {
        await queue(payload, fp, { flagReasons: [`No se pudo publicar: ${e instanceof Error ? e.message : "error"}`] });
      }
    } else {
      await queue(payload, fp, { flagReasons: [...flags, ...notes] });
    }
  }

  const queueRemoval = (p: Promotion) =>
    queue(toPayload({ ...promotionToRaw(p) }, source), `${p.fingerprint}_baja`, { flagReasons: ["Ya no aparece en la fuente"], changeType: "baja", matchedPromotionId: p.id });

  // Bajas: solo si el feed trajo datos (un feed vacío suele ser un error de la fuente).
  if (candidates.length > 0 && !opts.partial) {
    for (const p of active) {
      if (p.status !== "publicada" || !p.externalId || p.sourceName !== source.name || seenExternal.has(p.externalId)) continue;
      await queueRemoval(p);
    }
  }
  for (const externalId of opts.removedExternalIds ?? []) {
    const p = await repo.findPromotionByExternalId(source.id, externalId);
    if (p?.status === "publicada") await queueRemoval(p);
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

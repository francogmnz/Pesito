"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, getRepo, getServiceRepo } from "@/lib/data";
import { LimitError } from "@/lib/data/errors";
import { todayAR } from "@/lib/domain/dates";
import { fingerprint } from "@/lib/domain/fingerprint";
import { canPublish, ModerationError, nextStatus, type ModerationAction } from "@/lib/domain/moderation";
import { payloadFromForm } from "@/lib/domain/payload-form";
import type { PromoStatus, Submission } from "@/lib/domain/types";
import type { MerchantPatch, Repo } from "@/lib/data/repo";
import { payloadSchema, publishProblems, sniffImageType } from "@/lib/domain/validation";
import { runAllSources } from "@/lib/ingest/run";

export type AdminState = { ok: boolean; message: string; problems?: string[] } | null;

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/ingresar?volver=/admin");
  if (user.role !== "admin") redirect("/");
  return user;
}

function fail(e: unknown): AdminState {
  if (e instanceof ModerationError || e instanceof LimitError) return { ok: false, message: e.message };
  console.error(e);
  return { ok: false, message: "No se pudo completar la acción. Revisá los datos y probá de nuevo." };
}

function refresh(id?: string) {
  revalidatePath("/admin", "layout");
  if (id) revalidatePath(`/admin/revision/${id}`);
}

/** Guarda las correcciones del admin sobre el candidato. */
export async function saveSubmissionEdits(id: string, _: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const repo = await getRepo();
  const sub = await repo.getSubmission(id);
  if (!sub) return { ok: false, message: "La sugerencia ya no existe." };
  if (sub.publishedPromotionId) return { ok: false, message: "Ya está publicada: editá la promoción desde la base." };
  const payload = payloadFromForm(form);
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: "Hay datos inválidos.", problems: parsed.error.issues.map((i) => `${i.path.join(".") || "datos"}: ${i.message}`) };
  }
  try {
    await repo.updateSubmission(id, { payload, fingerprint: fingerprint(payload) }, admin.id, "editada");
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  return { ok: true, message: "Cambios guardados." };
}

export async function moderate(id: string, action: ModerationAction, _: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const repo = await getRepo();
  const sub = await repo.getSubmission(id);
  if (!sub) return { ok: false, message: "La sugerencia ya no existe." };
  const note = String(form.get("note") ?? "").trim().slice(0, 1000) || null;
  if (action === "rechazar" && !note) return { ok: false, message: "Escribí el motivo del rechazo: la persona lo va a ver." };
  try {
    const status = nextStatus(sub.status, action, { published: !!sub.publishedPromotionId });
    if (action === "aprobar") {
      const problems = publishProblems(sub.payload);
      if (problems.length) return { ok: false, message: "Corregí esto antes de aprobar:", problems };
    }
    await repo.updateSubmission(id, { status, ...(note ? { reviewNote: note } : {}) }, admin.id, action);
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  return { ok: true, message: "Listo." };
}

export async function markDuplicate(id: string, promotionId: string): Promise<void> {
  const admin = await requireAdmin();
  const repo = await getRepo();
  const sub = await repo.getSubmission(id);
  const promo = await repo.getPromotion(promotionId, { includeUnpublished: true });
  if (!sub || !promo || sub.publishedPromotionId) return;
  const status = sub.status === "rechazada" ? "rechazada" : nextStatus(sub.status, "rechazar");
  await repo.updateSubmission(id, { status, duplicateOf: promotionId, reviewNote: `Ya está publicada: ${promo.title}.` }, admin.id, "duplicado");
  refresh(id);
}

/** Aplica una sugerencia aprobada: crea la promo, o actualiza/da de baja la existente si es un cambio detectado. */
async function applySubmission(repo: Repo, sub: Submission, adminId: string): Promise<string> {
  const fp = fingerprint(sub.payload);
  let promotionId: string;
  if (sub.changeType === "baja" && sub.matchedPromotionId) {
    await repo.setPromotionStatus(sub.matchedPromotionId, "archivada", adminId, "Baja detectada en la fuente");
    promotionId = sub.matchedPromotionId;
  } else if (sub.changeType === "cambio" && sub.matchedPromotionId) {
    await repo.updatePromotionFromPayload(sub.matchedPromotionId, sub.payload, fp);
    await repo.setPromotionStatus(sub.matchedPromotionId, "publicada", adminId, "Cambio aprobado");
    promotionId = sub.matchedPromotionId;
  } else {
    promotionId = (await repo.publishPayload(sub.payload, { fingerprint: fp, actorId: adminId, sourceId: sub.sourceId })).id;
  }
  await repo.updateSubmission(sub.id, { publishedPromotionId: promotionId }, adminId, "publicada");
  return promotionId;
}

/** Publica una sugerencia aprobada. */
export async function publishSubmission(id: string, _: AdminState): Promise<AdminState> {
  const admin = await requireAdmin();
  const repo = await getRepo();
  const sub = await repo.getSubmission(id);
  if (!sub) return { ok: false, message: "La sugerencia ya no existe." };
  if (!canPublish(sub.status, !!sub.publishedPromotionId)) return { ok: false, message: "Primero aprobala." };
  const problems = publishProblems(sub.payload);
  if (problems.length && sub.changeType !== "baja") return { ok: false, message: "No se puede publicar todavía:", problems };
  try {
    await applySubmission(repo, sub, admin.id);
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  revalidatePath("/", "layout");
  return { ok: true, message: "Publicada. Ya la ve todo el mundo." };
}

/**
 * Acciones en lote desde la cola: "publicar" aprueba y publica cada una (si está completa);
 * "rechazar" las rechaza con el mismo motivo. Devuelve qué se hizo y qué no, con el porqué.
 */
export async function bulkModerate(_: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const op = String(form.get("op") ?? "");
  const ids = [...new Set(form.getAll("ids").map(String))].slice(0, 100);
  if (!ids.length) return { ok: false, message: "Marcá al menos una." };
  if (op !== "publicar" && op !== "rechazar") return { ok: false, message: "Acción desconocida." };
  const note = String(form.get("note") ?? "").trim().slice(0, 1000) || null;
  if (op === "rechazar" && !note) return { ok: false, message: "Escribí el motivo del rechazo: lo ven quienes las enviaron." };

  const repo = await getRepo();
  let done = 0;
  const problems: string[] = [];
  for (const id of ids) {
    const sub = await repo.getSubmission(id);
    if (!sub) continue;
    const name = sub.payload.title || sub.payload.merchantName;
    try {
      if (sub.publishedPromotionId) {
        problems.push(`${name}: ya estaba publicada.`);
        continue;
      }
      if (op === "rechazar") {
        await repo.updateSubmission(id, { status: nextStatus(sub.status, "rechazar"), reviewNote: note }, admin.id, "rechazar");
        done++;
        continue;
      }
      const missing = sub.changeType === "baja" ? [] : publishProblems(sub.payload);
      if (missing.length) {
        problems.push(`${name}: ${missing[0]}`);
        continue;
      }
      if (sub.status !== "aprobada") await repo.updateSubmission(id, { status: nextStatus(sub.status, "aprobar") }, admin.id, "aprobar");
      await applySubmission(repo, { ...sub, status: "aprobada" }, admin.id);
      done++;
    } catch (e) {
      problems.push(`${name}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  refresh();
  revalidatePath("/", "layout");
  const verb = op === "publicar" ? (done === 1 ? "publicada" : "publicadas") : done === 1 ? "rechazada" : "rechazadas";
  return { ok: done > 0, message: `${done} ${verb}${problems.length ? `, ${problems.length} sin cambios:` : "."}`, problems: problems.length ? problems : undefined };
}

export async function resolveReport(id: string, status: "resuelto" | "descartado", form: FormData) {
  const admin = await requireAdmin();
  await (await getRepo()).resolveReport(id, status, admin.id, String(form.get("note") ?? "").slice(0, 1000) || null);
  refresh();
}

export async function setPromotionStatus(id: string, status: PromoStatus) {
  const admin = await requireAdmin();
  if (!["publicada", "archivada", "en_revision", "vencida"].includes(status)) return;
  await (await getRepo()).setPromotionStatus(id, status, admin.id, null);
  refresh();
  revalidatePath("/", "layout");
}

const MAX_LOGO_BYTES = 1024 * 1024;

/** Rubro y logo de un comercio. El logo solo se muestra con el permiso marcado. */
export async function saveMerchant(id: string, _: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  try {
    const repo = await getRepo();
    const cats = await repo.listCategories();
    const cat = String(form.get("categorySlug") ?? "");
    if (cat && !cats.some((c) => c.slug === cat)) return { ok: false, message: "Rubro inválido." };
    const patch: MerchantPatch = { categorySlug: cat || null, logoAuthorized: form.get("logoAuthorized") === "on" };
    if (form.get("removeLogo") === "on") patch.logoUrl = null;
    const file = form.get("logo");
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_LOGO_BYTES) return { ok: false, message: "El logo pesa más de 1 MB." };
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = sniffImageType(bytes);
      if (!type) return { ok: false, message: "Subí el logo en PNG, JPG o WEBP." };
      patch.logoUrl = await repo.uploadMerchantLogo(id, bytes, type);
    }
    await repo.updateMerchant(id, patch);
    revalidatePath("/", "layout");
    return { ok: true, message: "Guardado." };
  } catch (e) {
    return fail(e);
  }
}

export async function runAutomationNow(): Promise<AdminState> {
  await requireAdmin();
  try {
    const repo = await getServiceRepo();
    const result = await runAllSources(repo, { today: todayAR() });
    refresh();
    if (result.sources === 0) {
      return { ok: false, message: "No hay fuentes activas. Corré la parte 3 del SQL en Supabase (crea Ualá, PedidosYa y Mercado Pago)." };
    }
    return {
      ok: result.errors.length < result.sources,
      message: `Listo: ${result.sources} fuentes, ${result.created} nuevas, ${result.updated} actualizadas, ${result.flagged} a revisión, ${result.expired} vencidas.`,
      problems: result.errors.length ? result.errors : undefined,
    };
  } catch (e) {
    // Solo lo ve el equipo admin: mostramos el motivo real para poder arreglarlo.
    console.error("runAutomationNow", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (/^Falta SUPABASE_SERVICE_ROLE_KEY/.test(msg)) {
      return { ok: false, message: "Falta la clave secreta de Supabase: agregá SUPABASE_SERVICE_ROLE_KEY y reiniciá (en Vercel: Redeploy)." };
    }
    if (/^SUPABASE_SERVICE_ROLE_KEY/.test(msg)) return { ok: false, message: msg };
    if (/invalid api key|jwt|unauthorized|401/i.test(msg)) {
      return { ok: false, message: "Supabase rechazó la clave secreta. Revisá que SUPABASE_SERVICE_ROLE_KEY sea la Secret key (sb_secret_...) completa y hacé Redeploy." };
    }
    return { ok: false, message: `No se pudo actualizar: ${msg.slice(0, 300)}` };
  }
}

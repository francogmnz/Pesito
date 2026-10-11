"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, getRepo, getServiceRepo } from "@/lib/data";
import { LimitError } from "@/lib/data/errors";
import { todayAR } from "@/lib/domain/dates";
import { fingerprint } from "@/lib/domain/fingerprint";
import { canPublish, ModerationError, nextStatus, type ModerationAction } from "@/lib/domain/moderation";
import { payloadFromForm } from "@/lib/domain/payload-form";
import type { PromoStatus } from "@/lib/domain/types";
import { payloadSchema, publishProblems } from "@/lib/domain/validation";
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

/** Publica una sugerencia aprobada. Si es un cambio o una baja detectados, actualiza la promo existente. */
export async function publishSubmission(id: string, _: AdminState): Promise<AdminState> {
  const admin = await requireAdmin();
  const repo = await getRepo();
  const sub = await repo.getSubmission(id);
  if (!sub) return { ok: false, message: "La sugerencia ya no existe." };
  if (!canPublish(sub.status, !!sub.publishedPromotionId)) return { ok: false, message: "Primero aprobala." };
  const problems = publishProblems(sub.payload);
  if (problems.length && sub.changeType !== "baja") return { ok: false, message: "No se puede publicar todavía:", problems };
  const fp = fingerprint(sub.payload);
  try {
    let promotionId: string;
    if (sub.changeType === "baja" && sub.matchedPromotionId) {
      await repo.setPromotionStatus(sub.matchedPromotionId, "archivada", admin.id, "Baja detectada en la fuente");
      promotionId = sub.matchedPromotionId;
    } else if (sub.changeType === "cambio" && sub.matchedPromotionId) {
      await repo.updatePromotionFromPayload(sub.matchedPromotionId, sub.payload, fp);
      await repo.setPromotionStatus(sub.matchedPromotionId, "publicada", admin.id, "Cambio aprobado");
      promotionId = sub.matchedPromotionId;
    } else {
      promotionId = (await repo.publishPayload(sub.payload, { fingerprint: fp, actorId: admin.id, sourceId: sub.sourceId })).id;
    }
    await repo.updateSubmission(id, { publishedPromotionId: promotionId }, admin.id, "publicada");
  } catch (e) {
    return fail(e);
  }
  refresh(id);
  revalidatePath("/", "layout");
  return { ok: true, message: "Publicada. Ya la ve todo el mundo." };
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

export async function runAutomationNow(): Promise<AdminState> {
  await requireAdmin();
  try {
    const repo = await getServiceRepo();
    const result = await runAllSources(repo, { today: todayAR() });
    refresh();
    return {
      ok: true,
      message: `Listo: ${result.sources} fuentes, ${result.created} nuevas, ${result.updated} actualizadas, ${result.flagged} a revisión, ${result.expired} vencidas.`,
    };
  } catch (e) {
    return fail(e);
  }
}

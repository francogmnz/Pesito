"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, getCurrentUser, getRepo, type DemoIdentity } from "@/lib/data";
import { LimitError } from "@/lib/data/errors";
import { isValidBirthday } from "@/lib/domain/birthday";
import { fingerprint } from "@/lib/domain/fingerprint";
import type { ReportReason } from "@/lib/domain/types";
import { formToPayload, isSpam, MAX_IMAGE_BYTES, sniffImageType, suggestionFormSchema } from "@/lib/domain/validation";
import { ipHash, safeNext } from "@/lib/request";

export type FormState = { ok: boolean; message?: string; errors?: Record<string, string> } | null;

async function requireUser(next: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/ingresar?volver=${encodeURIComponent(safeNext(next))}`);
  return user;
}

function messageOf(e: unknown, fallback: string) {
  return e instanceof LimitError ? e.message : (console.error(e), fallback);
}

// ---------- Guardados y utilizados ----------

export async function toggleSaved(promotionId: string, save: boolean, path: string) {
  const user = await requireUser(path);
  const repo = await getRepo();
  if (!(await repo.getPromotion(promotionId))) return;
  await repo.setSaved(user.id, promotionId, save);
  revalidatePath(safeNext(path));
  revalidatePath("/guardados");
}

export async function toggleUsed(promotionId: string, used: boolean, path: string) {
  const user = await requireUser(path);
  const repo = await getRepo();
  if (!(await repo.getPromotion(promotionId))) return;
  await repo.setUsed(user.id, promotionId, used);
  revalidatePath(safeNext(path));
  revalidatePath("/guardados");
}

// ---------- Reportes ----------

const REASONS: ReportReason[] = ["vencido", "codigo_invalido", "datos_incorrectos", "otro"];

export async function reportPromotion(_: FormState, form: FormData): Promise<FormState> {
  const promotionId = String(form.get("promotionId") ?? "");
  const user = await requireUser(`/cupones/${promotionId}`);
  const reason = String(form.get("reason") ?? "") as ReportReason;
  const comment = String(form.get("comment") ?? "").trim().slice(0, 500) || null;
  if (!REASONS.includes(reason)) return { ok: false, message: "Elegí qué pasó con el cupón." };
  const repo = await getRepo();
  if (!(await repo.getPromotion(promotionId))) return { ok: false, message: "Este cupón ya no está publicado." };
  try {
    await repo.createReport(user.id, promotionId, reason, comment);
  } catch (e) {
    return { ok: false, message: messageOf(e, "No pudimos enviar el reporte. Probá de nuevo.") };
  }
  revalidatePath(`/cupones/${promotionId}`);
  return { ok: true, message: "Gracias. Vamos a revisar el cupón." };
}

// ---------- Perfil ----------

export async function saveBirthday(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/cumple");
  const clear = form.get("clear") === "1";
  const day = Number(form.get("day"));
  const month = Number(form.get("month"));
  if (!clear && !isValidBirthday(day, month)) return { ok: false, message: "Revisá el día y el mes." };
  const repo = await getRepo();
  await repo.updateBirthday(user.id, clear ? null : day, clear ? null : month);
  revalidatePath("/cumple");
  revalidatePath("/perfil");
  return { ok: true, message: clear ? "Borramos tu cumpleaños." : "Guardamos tu cumpleaños." };
}

export async function savePaymentMethods(form: FormData) {
  const next = safeNext(form.get("volver"), "/");
  const user = await requireUser(next);
  const repo = await getRepo();
  const valid = new Set((await repo.listPaymentMethods()).map((p) => p.id));
  const ids = form.getAll("pm").map(String).filter((id) => valid.has(id)).slice(0, 30);
  await repo.setUserPaymentMethods(user.id, ids);
  revalidatePath("/", "layout");
  redirect(next);
}

export async function saveDisplayName(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/perfil");
  const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) return { ok: false, message: "El nombre debe tener entre 2 y 60 caracteres." };
  await (await getRepo()).updateDisplayName(user.id, name);
  revalidatePath("/", "layout");
  return { ok: true, message: "Listo." };
}

// ---------- Sugerí una promo ----------

export async function submitSuggestion(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/sugerir");
  const parsed = suggestionFormSchema.safeParse({
    merchantName: form.get("merchantName") ?? "",
    bank: form.get("bank") ?? undefined,
    wallet: form.get("wallet") ?? undefined,
    kind: form.get("kind") ?? undefined,
    discountKind: form.get("discountKind") ?? undefined,
    discountValue: form.get("discountValue") ?? undefined,
    capAmount: form.get("capAmount") ?? undefined,
    validUntil: form.get("validUntil") ?? undefined,
    days: form.getAll("days").map(String),
    conditions: form.get("conditions") ?? undefined,
    sourceUrl: form.get("sourceUrl") ?? undefined,
    couponCode: form.get("couponCode") ?? undefined,
    comments: form.get("comments") ?? undefined,
    website: form.get("website") ?? undefined,
    startedAt: form.get("startedAt") ?? undefined,
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, message: "Revisá los campos marcados.", errors };
  }
  const v = parsed.data;
  if (isSpam(v)) {
    // No damos pistas a los bots: respuesta genérica.
    return { ok: false, message: "No pudimos enviar la sugerencia. Esperá unos segundos y probá de nuevo." };
  }

  // Captura (opcional, pero se necesita captura o enlace como evidencia).
  const file = form.get("image");
  let image: { bytes: Uint8Array; type: string } | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, errors: { image: "La imagen pesa más de 5 MB." }, message: "Revisá los campos marcados." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) return { ok: false, errors: { image: "Subí una imagen JPG, PNG o WEBP." }, message: "Revisá los campos marcados." };
    image = { bytes, type };
  }
  if (!image && !v.sourceUrl) {
    return { ok: false, errors: { sourceUrl: "Sumá el enlace oficial o una captura para que podamos verificarla." }, message: "Revisá los campos marcados." };
  }

  const repo = await getRepo();
  const ip = await ipHash();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const recent = await repo.countRecentSubmissions(user.id, ip, since);
  if (recent.byUser >= 5) return { ok: false, message: "Llegaste al límite de 5 sugerencias por día. ¡Gracias por colaborar!" };
  if (recent.byIp >= 20) return { ok: false, message: "Recibimos muchas sugerencias desde esta conexión. Probá más tarde." };

  const payload = formToPayload(v);
  let aiExtraction: Record<string, unknown> | null = null;
  const aiRaw = String(form.get("aiExtraction") ?? "");
  if (aiRaw && aiRaw.length < 8000) {
    try {
      aiExtraction = JSON.parse(aiRaw);
    } catch {
      aiExtraction = null;
    }
  }

  try {
    const imagePath = image ? await repo.saveSubmissionImage(user.id, image.bytes, image.type) : null;
    await repo.createSubmission({
      origin: "usuario",
      payload,
      fingerprint: fingerprint(payload),
      submittedBy: user.id,
      imagePath,
      aiExtraction,
      comments: v.comments,
      ipHash: ip,
    });
  } catch (e) {
    return { ok: false, message: messageOf(e, "No pudimos guardar la sugerencia. Probá de nuevo en un rato.") };
  }
  revalidatePath("/perfil");
  redirect("/sugerir/enviada");
}

// ---------- Sesión ----------

export async function demoSignIn(form: FormData) {
  const who = String(form.get("who")) as DemoIdentity;
  if (!["usuario", "admin", "anonimo"].includes(who)) return;
  (await cookies()).set(DEMO_COOKIE, who, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  revalidatePath("/", "layout");
  redirect(safeNext(form.get("volver"), who === "admin" ? "/admin" : "/"));
}

export async function signOut() {
  const repo = await getRepo();
  if (repo.mode === "demo") {
    (await cookies()).set(DEMO_COOKIE, "anonimo", { httpOnly: true, sameSite: "lax", path: "/" });
  } else {
    const { createUserClient } = await import("@/lib/supabase/server");
    await (await createUserClient()).auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function requestMagicLink(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) return { ok: false, message: "Revisá el email." };
  const next = safeNext(form.get("volver"));
  const { createUserClient } = await import("@/lib/supabase/server");
  const supabase = await createUserClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${site}/auth/callback?volver=${encodeURIComponent(next)}` } });
  if (error) return { ok: false, message: "No pudimos enviar el enlace. Probá de nuevo en unos minutos." };
  return { ok: true, message: `Te mandamos un enlace a ${email}. Abrilo desde este dispositivo para entrar.` };
}

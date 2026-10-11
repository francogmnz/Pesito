import type { SubmissionStatus } from "./types";

export type ModerationAction = "tomar" | "liberar" | "aprobar" | "rechazar" | "reabrir";

/** Transiciones permitidas de la cola de revisión. Publicar es un paso aparte sobre "aprobada". */
const TRANSITIONS: Record<ModerationAction, { from: SubmissionStatus[]; to: SubmissionStatus }> = {
  tomar: { from: ["pendiente"], to: "en_revision" },
  liberar: { from: ["en_revision"], to: "pendiente" },
  aprobar: { from: ["pendiente", "en_revision"], to: "aprobada" },
  rechazar: { from: ["pendiente", "en_revision", "aprobada"], to: "rechazada" },
  reabrir: { from: ["rechazada"], to: "en_revision" },
};

export function nextStatus(current: SubmissionStatus, action: ModerationAction, opts: { published?: boolean } = {}): SubmissionStatus {
  const t = TRANSITIONS[action];
  if (!t.from.includes(current)) {
    throw new ModerationError(`No se puede ${action} una sugerencia ${STATUS_LABEL[current].toLowerCase()}.`);
  }
  if (action === "rechazar" && opts.published) {
    throw new ModerationError("Ya está publicada: archivá la promoción en lugar de rechazar la sugerencia.");
  }
  return t.to;
}

export function allowedActions(current: SubmissionStatus, published: boolean): ModerationAction[] {
  return (Object.keys(TRANSITIONS) as ModerationAction[]).filter(
    (a) => TRANSITIONS[a].from.includes(current) && !(a === "rechazar" && published),
  );
}

export function canPublish(current: SubmissionStatus, published: boolean): boolean {
  return current === "aprobada" && !published;
}

export class ModerationError extends Error {}

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

export const ACTION_LABEL: Record<ModerationAction, string> = {
  tomar: "Empezar revisión",
  liberar: "Devolver a pendientes",
  aprobar: "Aprobar",
  rechazar: "Rechazar",
  reabrir: "Reabrir",
};

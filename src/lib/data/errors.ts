/** Error esperable que se muestra tal cual a la persona (límites, duplicados, reglas). */
export class LimitError extends Error {
  readonly userFacing = true;
}

/** Traduce errores de Postgres/Supabase a mensajes claros. */
export function friendlyDbError(e: unknown): Error {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === "P0001" && err.message) return new LimitError(err.message);
  if (err?.code === "23505") return new LimitError("Ya existe un registro igual.");
  if (err?.code === "42501") return new LimitError("No tenés permiso para hacer eso.");
  return e instanceof Error ? e : new Error(err?.message ?? "Error inesperado");
}

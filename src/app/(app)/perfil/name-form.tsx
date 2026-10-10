"use client";

import { useActionState } from "react";
import { saveDisplayName, type FormState } from "@/app/actions";

export function NameForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveDisplayName, null);
  return (
    <form action={action} className="flex gap-2">
      <label className="flex-1">
        <span className="sr-only">Nombre</span>
        <input name="name" defaultValue={current} maxLength={60} className="campo" autoComplete="given-name" />
      </label>
      <button className="btn-secundario" disabled={pending}>
        {state?.ok ? "Listo" : "Guardar"}
      </button>
      {state && !state.ok && <p className="text-sm text-peligro">{state.message}</p>}
    </form>
  );
}

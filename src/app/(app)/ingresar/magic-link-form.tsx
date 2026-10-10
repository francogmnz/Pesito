"use client";

import { useActionState } from "react";
import { requestMagicLink, type FormState } from "@/app/actions";
import { Notice } from "@/components/ui";

export function MagicLinkForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestMagicLink, null);
  if (state?.ok) return <Notice tone="ok">{state.message}</Notice>;
  return (
    <form action={action} className="tarjeta grid gap-3 p-4">
      <input type="hidden" name="volver" value={next} />
      <label>
        <span className="etiqueta">Tu email</span>
        <input name="email" type="email" required autoComplete="email" inputMode="email" className="campo" placeholder="nombre@email.com" />
      </label>
      {state && !state.ok && <p className="text-sm font-semibold text-peligro">{state.message}</p>}
      <button className="btn-primario" disabled={pending}>
        {pending ? "Enviando…" : "Mandame el enlace para entrar"}
      </button>
      <p className="text-xs text-tenue">Sin contraseñas: te mandamos un enlace de un solo uso.</p>
    </form>
  );
}

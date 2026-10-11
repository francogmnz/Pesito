"use client";

import { useActionState } from "react";
import { runAutomationNow, type AdminState } from "@/app/admin/actions";
import { Icon } from "@/components/icon";

export function RunNowButton() {
  const [state, run, pending] = useActionState<AdminState, FormData>(() => runAutomationNow(), null);
  return (
    <form action={run} className="grid justify-items-end gap-2">
      <button className="btn-primario" disabled={pending}>
        <Icon name="bolt" size={18} /> {pending ? "Actualizando…" : "Actualizar ahora"}
      </button>
      {state && (
        <div role="status" className={`max-w-md text-right text-sm font-semibold ${state.ok ? "text-verde-oscuro" : "text-peligro"}`}>
          <p>{state.message}</p>
          {state.problems?.map((p) => (
            <p key={p} className="mt-1 font-normal text-peligro">
              {p}
            </p>
          ))}
        </div>
      )}
    </form>
  );
}

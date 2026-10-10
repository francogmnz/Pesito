"use client";

import { useActionState } from "react";
import { moderate, publishSubmission, type AdminState } from "@/app/admin/actions";
import { Icon } from "@/components/icon";
import { ACTION_LABEL, type ModerationAction } from "@/lib/domain/moderation";

function Result({ state }: { state: AdminState }) {
  if (!state) return null;
  return (
    <div role="status" className={`rounded-2xl p-3 text-sm ${state.ok ? "bg-lima-suave text-verde-oscuro" : "bg-peligro-suave text-peligro"}`}>
      <b>{state.message}</b>
      {state.problems && (
        <ul className="mt-1 list-disc pl-5">
          {state.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActionButton({ id, action }: { id: string; action: ModerationAction }) {
  const [state, run, pending] = useActionState<AdminState, FormData>(moderate.bind(null, id, action), null);
  const style = action === "aprobar" ? "btn-lima" : action === "rechazar" ? "btn-secundario text-peligro" : "btn-secundario";
  if (action === "rechazar") {
    return (
      <form action={run} className="grid gap-2 rounded-2xl border border-linea p-3">
        <label>
          <span className="etiqueta">Motivo del rechazo (lo ve quien la envió)</span>
          <textarea name="note" rows={2} maxLength={1000} className="campo" placeholder="Ej.: no la encontramos en la fuente oficial" />
        </label>
        <button className={style} disabled={pending}>
          <Icon name="x" size={18} /> {ACTION_LABEL[action]}
        </button>
        <Result state={state} />
      </form>
    );
  }
  return (
    <form action={run} className="grid gap-2">
      <button className={`${style} w-full`} disabled={pending}>
        {action === "aprobar" && <Icon name="check" size={18} />}
        {ACTION_LABEL[action]}
      </button>
      <Result state={state} />
    </form>
  );
}

export function ModerationPanel({ id, actions, canPublish, published, changeType }: { id: string; actions: ModerationAction[]; canPublish: boolean; published: boolean; changeType: "nueva" | "cambio" | "baja" }) {
  const [pubState, publish, publishing] = useActionState<AdminState, FormData>(publishSubmission.bind(null, id), null);
  const label = changeType === "cambio" ? "Aplicar el cambio a la promo" : changeType === "baja" ? "Dar de baja la promo" : "Publicar promoción";
  return (
    <div className="grid gap-2.5">
      {published && (
        <p className="flex items-center gap-2 rounded-2xl bg-lima p-3 text-sm font-semibold">
          <Icon name="checkCircle" size={18} /> Publicada
        </p>
      )}
      {canPublish && (
        <form action={publish} className="grid gap-2">
          <button className="btn-primario w-full" disabled={publishing}>
            <Icon name="bolt" size={18} /> {publishing ? "Publicando…" : label}
          </button>
          <Result state={pubState} />
        </form>
      )}
      {actions
        .filter((a) => a !== "rechazar")
        .map((a) => (
          <ActionButton key={a} id={id} action={a} />
        ))}
      {actions.includes("rechazar") && <ActionButton id={id} action="rechazar" />}
    </div>
  );
}

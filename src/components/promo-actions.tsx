"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { reportPromotion, toggleSaved, toggleUsed, type FormState } from "@/app/actions";
import { Icon } from "./icon";

export function SaveButton({ promotionId, saved, path, compact = false }: { promotionId: string; saved: boolean; path: string; compact?: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const [pending, start] = useTransition();
  const onClick = () =>
    start(async () => {
      setOptimistic(!optimistic);
      await toggleSaved(promotionId, !optimistic, path);
    });
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={optimistic}
        aria-label={optimistic ? "Quitar de guardados" : "Guardar"}
        className="grid size-11 place-items-center rounded-full bg-superficie/90 shadow-[var(--shadow-tarjeta)]"
      >
        <Icon name="heart" className={optimistic ? "fill-verde text-verde" : "text-tinta"} />
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={pending} aria-pressed={optimistic} className={optimistic ? "btn-lima" : "btn-secundario"}>
      <Icon name="heart" size={19} className={optimistic ? "fill-bosque" : ""} />
      {optimistic ? "Guardado" : "Guardar"}
    </button>
  );
}

export function UsedButton({ promotionId, used, path }: { promotionId: string; used: boolean; path: string }) {
  const [optimistic, setOptimistic] = useOptimistic(used);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={optimistic}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          await toggleUsed(promotionId, !optimistic, path);
        })
      }
      className={optimistic ? "btn-lima" : "btn-secundario"}
    >
      <Icon name={optimistic ? "checkCircle" : "check"} size={19} />
      {optimistic ? "Lo usé" : "Marcar como usado"}
    </button>
  );
}

export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Fallback para navegadores sin permiso de portapapeles.
      const el = document.createElement("textarea");
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };
  return (
    <div className="flex items-stretch gap-2 rounded-[18px] border-2 border-dashed border-verde/60 bg-lima-suave p-2">
      <span className="numero flex flex-1 items-center justify-center font-mono text-xl font-bold tracking-[0.12em] select-all">{code}</span>
      <button type="button" onClick={copy} className="btn-primario btn-chico min-h-11 px-4" aria-live="polite">
        <Icon name={copied ? "check" : "copy"} size={18} />
        {copied ? "¡Copiado!" : "Copiar"}
      </button>
    </div>
  );
}

const REASONS = [
  { value: "vencido", label: "Está vencido" },
  { value: "codigo_invalido", label: "El código no funciona" },
  { value: "datos_incorrectos", label: "Los datos están mal" },
  { value: "otro", label: "Otro problema" },
];

export function ReportForm({ promotionId }: { promotionId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(reportPromotion, null);
  if (state?.ok) {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-lima-suave p-3.5 text-sm font-semibold text-verde-oscuro" role="status">
        <Icon name="checkCircle" size={18} /> {state.message}
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-tinta-2 underline-offset-4 hover:underline">
        <Icon name="flag" size={17} /> Reportar un problema con este cupón
      </button>
    );
  }
  return (
    <form action={action} className="tarjeta grid gap-3 p-4">
      <input type="hidden" name="promotionId" value={promotionId} />
      <fieldset>
        <legend className="etiqueta">¿Qué pasó?</legend>
        <div className="grid gap-2">
          {REASONS.map((r) => (
            <label key={r.value} className="flex items-center gap-2.5 rounded-xl border border-linea px-3 py-2.5 text-sm has-[:checked]:border-verde has-[:checked]:bg-lima-suave">
              <input type="radio" name="reason" value={r.value} required className="accent-[#5c8c3b]" />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        <span className="etiqueta">Contanos más (opcional)</span>
        <textarea name="comment" rows={2} maxLength={500} className="campo" placeholder="Ej.: en la app me dice que el código no existe" />
      </label>
      {state && !state.ok && <p className="text-sm font-semibold text-peligro">{state.message}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-secundario flex-1" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button className="btn-primario flex-1" disabled={pending}>
          {pending ? "Enviando…" : "Enviar reporte"}
        </button>
      </div>
    </form>
  );
}

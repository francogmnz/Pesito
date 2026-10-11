"use client";

import { useActionState, useRef, useState } from "react";
import { bulkModerate, type AdminState } from "@/app/admin/actions";
import { Icon } from "@/components/icon";

/**
 * Envuelve la lista de la cola: cada fila trae su casilla (name="ids").
 * Barra fija abajo con "Publicar" y "Rechazar" para las marcadas.
 */
export function BulkForm({ children, total, allowFlagged = false }: { children: React.ReactNode; total: number; allowFlagged?: boolean }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(bulkModerate, null);
  const [count, setCount] = useState(0);
  const [rejecting, setRejecting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const boxes = () => [...(formRef.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]:not(:disabled)') ?? [])];
  const recount = () => setCount(boxes().filter((b) => b.checked).length);
  const toggleAll = (on: boolean) => {
    boxes().forEach((b) => (b.checked = on));
    recount();
  };

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await action(fd);
        setRejecting(false);
        setCount(0);
      }}
      onChange={recount}
      className="grid grid-cols-[minmax(0,1fr)] gap-3"
    >
      {allowFlagged && <input type="hidden" name="conAvisos" value="1" />}
      {total > 0 && (
        <label className="flex items-center gap-2 text-sm font-semibold text-tinta-2">
          <input type="checkbox" className="size-5 accent-[#5c8c3b]" checked={count > 0 && count === total} onChange={(e) => toggleAll(e.target.checked)} />
          Marcar todas ({total})
        </label>
      )}

      {state && (
        <div role="status" className={`rounded-2xl p-3 text-sm ${state.ok ? "bg-lima-suave text-verde-oscuro" : "bg-alerta-suave text-alerta"}`}>
          <b>{state.message}</b>
          {state.problems && (
            <ul className="mt-1 list-disc pl-5">
              {state.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {children}

      {count > 0 && (
        <div className="sticky bottom-3 z-20 grid gap-2 rounded-2xl bg-bosque p-3 text-white shadow-xl">
          {rejecting ? (
            <>
              <label className="grid gap-1 text-sm font-semibold">
                Motivo del rechazo (lo ven quienes las enviaron)
                <input name="note" required maxLength={1000} className="campo text-tinta" placeholder="Ej.: no la encontramos en la fuente oficial" />
              </label>
              <div className="flex gap-2">
                <button type="button" className="btn-secundario btn-chico flex-1" onClick={() => setRejecting(false)}>
                  Cancelar
                </button>
                <button name="op" value="rechazar" className="btn-chico btn flex-1 bg-peligro text-white" disabled={pending}>
                  Rechazar {count}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-sm font-semibold">{count === 1 ? "1 marcada" : `${count} marcadas`}</span>
              <button type="button" className="btn-chico btn border border-white/30 text-white" onClick={() => setRejecting(true)}>
                <Icon name="x" size={16} /> Rechazar
              </button>
              <button name="op" value="publicar" className="btn-lima btn-chico" disabled={pending}>
                <Icon name="bolt" size={16} /> {pending ? "Publicando…" : "Aprobar y publicar"}
              </button>
            </div>
          )}
        </div>
      )}
    </form>
  );
}

"use client";

import { useActionState, useRef } from "react";
import { quickCoupon, type AdminState } from "@/app/admin/actions";
import type { Category } from "@/lib/domain/types";

/** Formulario mínimo para publicar un cupón en segundos. Al publicar se vacía para cargar el siguiente. */
export function QuickCouponForm({ categories, defaultUntil, today }: { categories: Category[]; defaultUntil: string; today: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<AdminState, FormData>(async (prev, form) => {
    const result = await quickCoupon(prev, form);
    if (result?.ok) ref.current?.reset();
    return result;
  }, null);

  return (
    <form ref={ref} action={action} className="grid gap-3">
      <label className="block">
        <span className="etiqueta">Comercio</span>
        <input name="merchantName" required maxLength={80} autoFocus autoComplete="off" placeholder="PedidosYa" className="campo" />
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <label className="block">
          <span className="etiqueta">Descuento</span>
          <input name="value" required inputMode="decimal" autoComplete="off" placeholder="30" className="campo" />
        </label>
        <label className="block">
          <span className="etiqueta">Tipo</span>
          <select name="unit" defaultValue="porcentaje" className="campo">
            <option value="porcentaje">%</option>
            <option value="pesos">$</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="etiqueta">Código (si tiene)</span>
          <input name="code" maxLength={40} autoComplete="off" autoCapitalize="characters" placeholder="PROMO30" className="campo uppercase" />
        </label>
        <label className="block">
          <span className="etiqueta">Vale hasta</span>
          <input name="validUntil" type="date" required min={today} defaultValue={defaultUntil} className="campo" />
        </label>
      </div>
      <label className="block">
        <span className="etiqueta">Detalle (opcional)</span>
        <input name="detail" maxLength={280} autoComplete="off" placeholder="Solo en el primer pedido, mínimo $15.000" className="campo" />
      </label>
      <details className="rounded-2xl bg-crema p-3">
        <summary className="cursor-pointer text-sm font-semibold text-tinta-2">Más datos (opcionales)</summary>
        <div className="mt-3 grid gap-3">
          <label className="block">
            <span className="etiqueta">Rubro</span>
            <select name="categorySlug" defaultValue="" className="campo">
              <option value="">Sin rubro</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="etiqueta">Enlace, si hay</span>
            <input name="sourceUrl" type="url" maxLength={300} autoComplete="off" placeholder="https://…" className="campo" />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="newOnly" className="size-5 accent-[#5c8c3b]" /> Solo para clientes nuevos
          </label>
        </div>
      </details>

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
      <button className="btn-primario" disabled={pending}>
        {pending ? "Publicando…" : "Publicar"}
      </button>
    </form>
  );
}

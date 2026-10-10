"use client";

import { useId, useMemo, useState } from "react";
import { calcSaving, type CalcInput } from "@/lib/domain/calc";
import { formatARS, parseARS } from "@/lib/domain/money";
import { Icon } from "./icon";

const STEP = 5000;

export function AmountInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const n = parseARS(value) ?? 0;
  const set = (x: number) => onChange(x > 0 ? new Intl.NumberFormat("es-AR").format(x) : "");
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-linea bg-superficie px-3 focus-within:border-verde focus-within:ring-4 focus-within:ring-lima/50">
      <span className="text-lg font-semibold text-tinta-2">$</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        placeholder="0"
        size={1}
        className="numero w-full min-w-0 flex-1 bg-transparent py-3 text-[20px] font-bold outline-none"
      />
      <button type="button" onClick={() => set(Math.max(0, n - STEP))} className="grid size-9 place-items-center rounded-full border border-linea" aria-label="Restar 5.000">
        <span aria-hidden className="text-lg leading-none">−</span>
      </button>
      <button type="button" onClick={() => set(n + STEP)} className="grid size-9 place-items-center rounded-full border border-linea" aria-label="Sumar 5.000">
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}

export function CalcResultView({ input, amount }: { input: Omit<CalcInput, "amount">; amount: number }) {
  const r = useMemo(() => calcSaving({ ...input, amount }), [input, amount]);
  const cap = input.capAmount;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3" aria-live="polite">
      <div className="rounded-[22px] bg-lima p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Icon name="wallet" size={17} /> {input.discountKind === "monto_fijo" ? "Descuento estimado" : "Reintegro estimado"}
        </p>
        <p className="numero mt-1 text-[40px] leading-none font-black">{formatARS(r.saving)}</p>
      </div>
      {!r.eligible && r.reason && <p className="rounded-2xl bg-alerta-suave p-3 text-sm font-semibold text-alerta">{r.reason}</p>}
      <div className="flex items-center justify-between rounded-2xl bg-superficie px-4 py-3">
        <span className="text-sm text-tinta-2">Costo final</span>
        <span className="numero text-lg font-bold">{formatARS(r.finalCost)}</span>
      </div>
      {cap ? (
        <div className="rounded-2xl bg-superficie px-4 py-3">
          <p className="mb-2 text-sm text-tinta-2">Progreso al tope</p>
          <div className="h-2.5 overflow-hidden rounded-full bg-crema" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((r.capProgress ?? 0) * 100)}>
            <div className="h-full rounded-full bg-verde transition-[width]" style={{ width: `${Math.round((r.capProgress ?? 0) * 100)}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-xs font-semibold text-tinta-2">
            <span>
              {formatARS(r.saving)} de {formatARS(cap)}
            </span>
            <span>{Math.round((r.capProgress ?? 0) * 100)}%</span>
          </div>
          {r.amountForFullCap && amount < r.amountForFullCap && (
            <p className="mt-2 text-xs text-tinta-2">Llegás al tope con una compra de {formatARS(r.amountForFullCap)}.</p>
          )}
          {r.capReached && <p className="mt-2 text-xs font-semibold text-alerta">Con este monto llegás al tope: lo que gastes de más no tiene reintegro.</p>}
        </div>
      ) : null}
    </div>
  );
}

/** Calculadora embebida en el detalle de una promo. */
export function PromoCalculator({ input, defaultAmount = 25000 }: { input: Omit<CalcInput, "amount">; defaultAmount?: number }) {
  const id = useId();
  const [value, setValue] = useState(new Intl.NumberFormat("es-AR").format(defaultAmount));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <label htmlFor={id} className="etiqueta mb-0">
        Ingresá un monto
      </label>
      <AmountInput id={id} value={value} onChange={setValue} />
      <CalcResultView input={input} amount={parseARS(value) ?? 0} />
    </div>
  );
}

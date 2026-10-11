"use client";

import { useMemo, useState } from "react";
import { MerchantAvatar } from "@/components/brand";
import { AmountInput, CalcResultView } from "@/components/calculator";
import { capLabel, headline, headlineSuffix } from "@/lib/domain/labels";
import { parseARS } from "@/lib/domain/money";
import type { DiscountKind, Promotion } from "@/lib/domain/types";

type Lite = Pick<Promotion, "id" | "title" | "discountKind" | "discountValue" | "capAmount" | "capPeriod" | "minPurchase" | "kind"> & {
  merchant: Pick<Promotion["merchant"], "name" | "logoUrl" | "logoAuthorized">;
  pmNames: string;
};

export function CalculatorPage({ promos, initialId }: { promos: Lite[]; initialId?: string }) {
  const [mode, setMode] = useState<"promo" | "manual">(promos.length ? "promo" : "manual");
  const [promoId, setPromoId] = useState(initialId && promos.some((p) => p.id === initialId) ? initialId : (promos[0]?.id ?? ""));
  const [amount, setAmount] = useState("25.000");
  const [pct, setPct] = useState("20");
  const [cap, setCap] = useState("5.000");
  const [kind, setKind] = useState<DiscountKind>("porcentaje");

  const promo = promos.find((p) => p.id === promoId);
  const input = useMemo(
    () =>
      mode === "promo" && promo
        ? { discountKind: promo.discountKind, discountValue: promo.discountValue, capAmount: promo.capAmount, minPurchase: promo.minPurchase }
        : { discountKind: kind, discountValue: parseARS(pct.replace("%", "")), capAmount: parseARS(cap), minPurchase: null },
    [mode, promo, kind, pct, cap],
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div role="tablist" aria-label="Cómo calcular" className="grid grid-cols-2 rounded-full bg-superficie p-1 shadow-[var(--shadow-tarjeta)]">
        {(["promo", "manual"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            disabled={m === "promo" && !promos.length}
            className={`rounded-full py-2 text-sm font-semibold ${mode === m ? "bg-bosque text-white" : "text-tinta-2"}`}
          >
            {m === "promo" ? "Con una promo" : "Con mis datos"}
          </button>
        ))}
      </div>

      {mode === "promo" && promo ? (
        <div className="tarjeta p-4">
          <label htmlFor="promo" className="etiqueta">
            Promo
          </label>
          <select id="promo" value={promoId} onChange={(e) => setPromoId(e.target.value)} className="campo min-w-0 truncate">
            {promos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.merchant.name} · {headline(p)} {headlineSuffix(p)} · {p.pmNames}
              </option>
            ))}
          </select>
          <div className="mt-3 flex items-center gap-3">
            <MerchantAvatar merchant={promo.merchant} size={44} />
            <div>
              <p className="numero text-2xl leading-none font-black">
                {headline(promo)} <span className="text-base font-bold">{headlineSuffix(promo)}</span>
              </p>
              <p className="mt-1 text-sm text-tinta-2">Tope {capLabel(promo)}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="tarjeta grid gap-3 p-4">
          <fieldset>
            <legend className="etiqueta">Tipo de beneficio</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["porcentaje", "Porcentaje"],
                  ["monto_fijo", "Monto fijo"],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="flex items-center justify-center gap-2 rounded-xl border border-linea py-2.5 text-sm font-semibold has-[:checked]:border-verde has-[:checked]:bg-lima-suave">
                  <input type="radio" name="kind" className="sr-only" checked={kind === k} onChange={() => setKind(k)} />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="etiqueta">{kind === "porcentaje" ? "Porcentaje" : "Descuento ($)"}</span>
              <input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} className="campo" />
            </label>
            <label>
              <span className="etiqueta">Tope ($, opcional)</span>
              <input inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} className="campo" placeholder="Sin tope" />
            </label>
          </div>
        </div>
      )}

      <div className="tarjeta grid grid-cols-[minmax(0,1fr)] gap-3 p-4">
        <label htmlFor="monto" className="etiqueta mb-0">
          Ingresá un monto
        </label>
        <AmountInput id="monto" value={amount} onChange={setAmount} />
        <CalcResultView input={input} amount={parseARS(amount) ?? 0} />
      </div>
      <p className="px-1 text-xs text-tenue">Este cálculo es una estimación. El reintegro se verá reflejado según los tiempos de tu banco o billetera.</p>
    </div>
  );
}

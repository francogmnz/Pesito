"use client";

import { useActionState, useState } from "react";
import { saveSubmissionEdits, type AdminState } from "@/app/admin/actions";
import { WEEKDAYS_SHORT } from "@/lib/domain/dates";
import { KIND_LABEL, REQUIREMENT_LABEL } from "@/lib/domain/labels";
import type { Category, PaymentMethod, PromoPayload } from "@/lib/domain/types";
import { REQUIREMENTS } from "@/lib/domain/types";

const num = (n: number | null) => (n == null ? "" : String(n));

export function EditPayloadForm({ id, payload, categories, paymentMethods, readOnly }: { id: string; payload: PromoPayload; categories: Category[]; paymentMethods: PaymentMethod[]; readOnly: boolean }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(saveSubmissionEdits.bind(null, id), null);
  const [kind, setKind] = useState(payload.kind);
  const [dk, setDk] = useState(payload.discountKind);
  const [redemption, setRedemption] = useState(payload.coupon?.redemption ?? "codigo");
  const c = payload.coupon;
  const b = payload.birthday;

  return (
    <form action={action} className="grid gap-4">
      <fieldset disabled={readOnly || pending} className="grid gap-4 disabled:opacity-80">
        <div className="grid grid-cols-2 gap-3">
          <L label="Tipo">
            <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as PromoPayload["kind"])} className="campo">
              {Object.entries(KIND_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </L>
          <L label="Público">
            <select name="audience" defaultValue={payload.audience} className="campo">
              <option value="todos">Todos</option>
              <option value="nuevos_clientes">Clientes nuevos</option>
              <option value="cumpleanieros">Cumpleañeros</option>
              <option value="miembros">Miembros de un programa</option>
            </select>
          </L>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <L label="Comercio">
            <input name="merchantName" defaultValue={payload.merchantName} required maxLength={80} className="campo" />
          </L>
          <L label="Categoría">
            <select name="categorySlug" defaultValue={payload.categorySlug ?? ""} className="campo">
              <option value="">Sin categoría</option>
              {categories.map((x) => (
                <option key={x.slug} value={x.slug}>
                  {x.name}
                </option>
              ))}
            </select>
          </L>
        </div>
        <L label="Título visible">
          <input name="title" defaultValue={payload.title} required maxLength={140} className="campo" />
        </L>
        <L label="Resumen (opcional)">
          <input name="summary" defaultValue={payload.summary ?? ""} maxLength={280} className="campo" />
        </L>

        <fieldset>
          <legend className="etiqueta">Medios de pago</legend>
          <p className="mb-2 text-xs text-tenue">
            Enviado: banco “{payload.bank ?? "—"}”, billetera “{payload.wallet ?? "—"}”. Marcá los del catálogo que correspondan.
          </p>
          <input type="hidden" name="bank" value={payload.bank ?? ""} />
          <input type="hidden" name="wallet" value={payload.wallet ?? ""} />
          <div className="flex flex-wrap gap-1.5">
            {paymentMethods.map((pm) => (
              <label key={pm.slug} className="cursor-pointer rounded-full border border-linea px-3 py-1.5 text-sm has-[:checked]:border-verde has-[:checked]:bg-lima-suave has-[:checked]:font-semibold">
                <input type="checkbox" name="paymentMethodSlugs" value={pm.slug} defaultChecked={payload.paymentMethodSlugs.includes(pm.slug) || [payload.bank, payload.wallet].some((n) => n && n.toLowerCase() === pm.name.toLowerCase())} className="sr-only" />
                {pm.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <L label="Beneficio">
            <select name="discountKind" value={dk} onChange={(e) => setDk(e.target.value as PromoPayload["discountKind"])} className="campo">
              <option value="porcentaje">Porcentaje</option>
              <option value="monto_fijo">Monto fijo</option>
              <option value="regalo">Regalo</option>
            </select>
          </L>
          {dk !== "regalo" && (
            <L label={dk === "porcentaje" ? "Porcentaje" : "Monto ($)"}>
              <input name="discountValue" defaultValue={num(payload.discountValue)} inputMode="decimal" className="campo" />
            </L>
          )}
          <L label="Tope ($)">
            <input name="capAmount" defaultValue={num(payload.capAmount)} inputMode="decimal" className="campo" placeholder="Sin tope" />
          </L>
          <L label="Período del tope">
            <select name="capPeriod" defaultValue={payload.capPeriod === "sin_tope" ? "mes" : payload.capPeriod} className="campo">
              <option value="compra">Por compra</option>
              <option value="dia">Por día</option>
              <option value="semana">Por semana</option>
              <option value="mes">Por mes</option>
              <option value="vigencia">En toda la promo</option>
            </select>
          </L>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <L label="Compra mínima ($)">
            <input name="minPurchase" defaultValue={num(payload.minPurchase)} inputMode="decimal" className="campo" />
          </L>
          <L label="Desde">
            <input type="date" name="validFrom" defaultValue={payload.validFrom ?? ""} className="campo" />
          </L>
          <L label="Hasta">
            <input type="date" name="validUntil" defaultValue={payload.validUntil ?? ""} className="campo" />
          </L>
          <L label="Canal">
            <select name="channel" defaultValue={payload.channel} className="campo">
              <option value="ambos">Locales y online</option>
              <option value="local">Solo locales</option>
              <option value="online">Solo online</option>
            </select>
          </L>
        </div>
        <fieldset>
          <legend className="etiqueta">Días (vacío = todos)</legend>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <label key={d} className="cursor-pointer rounded-xl border border-linea px-3 py-1.5 text-sm has-[:checked]:border-verde has-[:checked]:bg-lima">
                <input type="checkbox" name="daysOfWeek" value={d} defaultChecked={payload.daysOfWeek?.includes(d)} className="sr-only" />
                {WEEKDAYS_SHORT[d]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="etiqueta">Requisitos</legend>
          <div className="flex flex-wrap gap-1.5">
            {REQUIREMENTS.map((r) => (
              <label key={r} className="cursor-pointer rounded-full border border-linea px-3 py-1.5 text-sm has-[:checked]:border-verde has-[:checked]:bg-lima-suave">
                <input type="checkbox" name="requirements" value={r} defaultChecked={payload.requirements.includes(r)} className="sr-only" />
                {REQUIREMENT_LABEL[r]}
              </label>
            ))}
          </div>
        </fieldset>

        {kind === "cupon" && (
          <fieldset className="grid gap-3 rounded-2xl bg-crema p-3">
            <legend className="px-1 text-sm font-bold">Cupón</legend>
            <div className="grid grid-cols-2 gap-3">
              <L label="Cómo se usa">
                <select name="coupon.redemption" value={redemption} onChange={(e) => setRedemption(e.target.value as typeof redemption)} className="campo">
                  <option value="codigo">Con código</option>
                  <option value="link">Desde un enlace</option>
                  <option value="automatico">Se aplica solo</option>
                </select>
              </L>
              {redemption === "codigo" && (
                <L label="Código">
                  <input name="coupon.code" defaultValue={c?.code ?? ""} maxLength={40} className="campo font-mono uppercase" />
                </L>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="coupon.newCustomersOnly" defaultChecked={c?.newCustomersOnly ?? true} /> Solo para clientes nuevos
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="coupon.requiresExternalSignup" defaultChecked={c?.requiresExternalSignup ?? false} /> Requiere registrarse en otra plataforma
            </label>
            <L label="Plataforma de registro">
              <input name="coupon.externalPlatform" defaultValue={c?.externalPlatform ?? ""} maxLength={60} className="campo" placeholder="Ej.: app del comercio" />
            </L>
          </fieldset>
        )}

        {kind === "cumple" && (
          <fieldset className="grid gap-3 rounded-2xl bg-crema p-3">
            <legend className="px-1 text-sm font-bold">Cumpleaños</legend>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <L label="Cuándo vale">
                <select name="birthday.windowKind" defaultValue={b?.windowKind ?? "mes"} className="campo">
                  <option value="dia">Solo el día</option>
                  <option value="semana">La semana</option>
                  <option value="mes">Todo el mes</option>
                  <option value="rango">Días antes/después</option>
                </select>
              </L>
              <L label="Días antes">
                <input type="number" min={0} max={31} name="birthday.daysBefore" defaultValue={b?.daysBefore ?? 0} className="campo" />
              </L>
              <L label="Días después">
                <input type="number" min={0} max={31} name="birthday.daysAfter" defaultValue={b?.daysAfter ?? 0} className="campo" />
              </L>
              <L label="Tipo">
                <select name="birthday.benefit" defaultValue={b?.benefit ?? (dk === "regalo" ? "regalo" : "descuento")} className="campo">
                  <option value="descuento">Descuento</option>
                  <option value="regalo">Regalo</option>
                  <option value="cupon">Cupón</option>
                  <option value="experiencia">Experiencia</option>
                </select>
              </L>
            </div>
            <L label="Programa de beneficios (si hace falta)">
              <input name="birthday.loyaltyProgram" defaultValue={b?.loyaltyProgram ?? ""} maxLength={80} className="campo" />
            </L>
          </fieldset>
        )}

        <L label="Condiciones">
          <textarea name="conditions" defaultValue={payload.conditions ?? ""} rows={3} maxLength={4000} className="campo" />
        </L>
        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <L label="Enlace a la fuente oficial">
            <input name="sourceUrl" type="url" defaultValue={payload.sourceUrl ?? ""} className="campo" placeholder="https://" />
          </L>
          <L label="ID en la fuente">
            <input name="externalId" defaultValue={payload.externalId ?? ""} maxLength={120} className="campo" />
          </L>
        </div>
      </fieldset>

      {state && (
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
      )}
      {!readOnly && (
        <button className="btn-secundario" disabled={pending}>
          {pending ? "Guardando…" : "Guardar correcciones"}
        </button>
      )}
    </form>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="etiqueta">{label}</span>
      {children}
    </label>
  );
}

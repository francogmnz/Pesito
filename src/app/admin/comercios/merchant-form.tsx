"use client";

import { useActionState } from "react";
import { saveMerchant, type AdminState } from "@/app/admin/actions";
import { MerchantAvatar } from "@/components/brand";
import type { Category, Merchant } from "@/lib/domain/types";

export function MerchantForm({ merchant, categories }: { merchant: Merchant; categories: Pick<Category, "slug" | "name">[] }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(saveMerchant.bind(null, merchant.id), null);
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5 hover:bg-crema/60">
        {/* Vista previa tal como se ve en la app */}
        <MerchantAvatar merchant={merchant} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{merchant.name}</span>
          <span className="block text-xs text-tinta-2">
            {categories.find((c) => c.slug === merchant.categorySlug)?.name ?? "Sin rubro"}
            {merchant.logoUrl ? (merchant.logoAuthorized ? " · Logo visible" : " · Logo cargado, sin permiso (no se muestra)") : " · Sin logo"}
          </span>
        </span>
        <span className="text-sm font-semibold text-verde-oscuro group-open:hidden">Editar</span>
      </summary>
      <form action={action} className="grid gap-3 border-t border-linea bg-crema/40 p-3.5">
        <label className="grid gap-1 text-sm font-semibold">
          Rubro
          <select name="categorySlug" defaultValue={merchant.categorySlug ?? ""} className="campo">
            <option value="">Sin rubro</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          {merchant.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={merchant.logoUrl} alt="" width={48} height={48} className="size-12 rounded-xl border border-linea bg-white object-contain" />
          )}
          <label className="grid flex-1 gap-1 text-sm font-semibold">
            {merchant.logoUrl ? "Reemplazar logo" : "Subir logo"} <span className="font-normal text-tinta-2">PNG, JPG o WEBP, cuadrado, hasta 1 MB.</span>
            <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="text-sm" />
          </label>
        </div>
        {merchant.logoUrl && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="removeLogo" className="size-4 accent-[#5c8c3b]" /> Quitar el logo
          </label>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="logoAuthorized" defaultChecked={merchant.logoAuthorized} className="mt-0.5 size-4 shrink-0 accent-[#5c8c3b]" />
          <span>
            <b>Tengo permiso para usar este logo.</b> Sin esto, la app muestra las iniciales o el ícono del rubro.
          </span>
        </label>
        <div className="flex items-center gap-3">
          <button className="btn-primario btn-chico" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </button>
          {state && (
            <p role="status" className={`text-sm font-semibold ${state.ok ? "text-verde-oscuro" : "text-peligro"}`}>
              {state.message}
            </p>
          )}
        </div>
      </form>
    </details>
  );
}

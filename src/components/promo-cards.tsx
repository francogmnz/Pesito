import Link from "next/link";
import { availability } from "@/lib/domain/calc";
import { expiryLabel, isExpiringSoon } from "@/lib/domain/coupons";
import { formatDate } from "@/lib/domain/dates";
import { capLabel, headline, headlineSuffix, paymentLabel, sweetSpot } from "@/lib/domain/labels";
import { formatARS } from "@/lib/domain/money";
import type { Promotion } from "@/lib/domain/types";
import { MerchantAvatar } from "./brand";
import { Icon } from "./icon";
import { SampleBadge } from "./ui";

const CATEGORY_NAME: Record<string, string> = {
  supermercados: "Súper",
  farmacias: "Farmacia",
  gastronomia: "Gastronomía",
  delivery: "Delivery",
  combustible: "Combustible",
  indumentaria: "Indumentaria",
  tecnologia: "Tecnología",
  "tiendas-online": "Online",
  belleza: "Belleza",
  entretenimiento: "Entretenimiento",
  transporte: "Transporte",
  educacion: "Educación",
};

/** Tarjeta compacta de reintegro/descuento (inicio y catálogo). */
export function PromoCard({ promo, today, saved }: { promo: Promotion; today: string; saved?: boolean }) {
  const av = availability(promo, today);
  return (
    <Link href={`/promos/${promo.id}`} className="tarjeta flex flex-col gap-3 p-4 transition hover:-translate-y-0.5">
      <div className="flex items-center gap-2.5">
        <MerchantAvatar merchant={promo.merchant} size={34} />
        <span className="line-clamp-2 min-w-0 flex-1 text-[13.5px] leading-tight font-semibold">{promo.merchant.name}</span>
        {saved && <Icon name="heart" size={18} className="fill-verde text-verde" label="Guardada" />}
      </div>
      <div>
        <p className={`numero leading-none font-black whitespace-nowrap ${headline(promo).length > 5 ? "text-[26px]" : "text-[34px]"}`}>{headline(promo)}</p>
        <p className="text-sm font-semibold text-tinta-2">{headlineSuffix(promo)}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {promo.merchant.categorySlug && <span className="chip bg-lima-suave text-verde-oscuro">{CATEGORY_NAME[promo.merchant.categorySlug] ?? promo.merchant.categorySlug}</span>}
        {promo.isSample && <SampleBadge />}
      </div>
      <ul className="grid gap-1 text-[13px] text-tinta-2">
        <li className="flex items-center gap-1.5">
          <Icon name="tag" size={15} /> Tope {capLabel(promo)}
        </li>
        {sweetSpot(promo) && (
          <li className="-mx-1 rounded-lg bg-lima-suave px-1.5 py-1 font-semibold text-verde-oscuro">Gastá {formatARS(sweetSpot(promo)!.amount)} para el máximo</li>
        )}
        <li className="flex items-center gap-1.5">
          <Icon name="wallet" size={15} /> <span className="truncate">{paymentLabel(promo)}</span>
        </li>
        <li className={`flex items-center gap-1.5 ${av.state === "activa" ? "text-verde-oscuro" : "text-alerta"}`}>
          <Icon name="calendar" size={15} /> {av.state === "activa" ? (promo.validUntil ? `Hasta el ${formatDate(promo.validUntil, today)}` : "Aplica hoy") : av.label}
        </li>
      </ul>
    </Link>
  );
}

/** Fila de cupón: lo importante a la vista (beneficio, mínimo, vencimiento). */
export function CouponCard({ promo, today, saved, used }: { promo: Promotion; today: string; saved?: boolean; used?: boolean }) {
  const soon = isExpiringSoon(promo, today);
  return (
    <Link href={`/cupones/${promo.id}`} className={`tarjeta relative flex gap-3.5 overflow-hidden p-4 transition hover:-translate-y-0.5 ${used ? "opacity-70" : ""}`}>
      {/* Troquel del cupón */}
      <span aria-hidden className="absolute top-1/2 -left-2.5 size-5 -translate-y-1/2 rounded-full bg-crema" />
      <span aria-hidden className="absolute top-1/2 -right-2.5 size-5 -translate-y-1/2 rounded-full bg-crema" />
      <div className="flex w-[86px] shrink-0 flex-col items-center justify-center rounded-2xl bg-lima px-2 py-3 text-center">
        <span className={`numero leading-none font-black whitespace-nowrap ${headline(promo).length > 5 ? "text-[19px]" : "text-[26px]"}`}>{headline(promo)}</span>
        <span className="mt-1 text-[11px] font-semibold">{promo.discountKind === "regalo" ? "" : "off"}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <MerchantAvatar merchant={promo.merchant} size={26} />
          <span className="truncate text-sm font-semibold text-tinta-2">{promo.merchant.name}</span>
          {saved && <Icon name="heart" size={16} className="ml-auto shrink-0 fill-verde text-verde" label="Guardado" />}
        </div>
        <p className="mt-1 line-clamp-2 font-bold leading-snug">{promo.title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {used ? (
            <span className="chip bg-crema text-tinta-2">
              <Icon name="check" size={13} /> Usado
            </span>
          ) : (
            <span className={`chip ${soon ? "bg-alerta-suave text-alerta" : "bg-crema text-tinta-2"}`}>
              <Icon name="clock" size={13} /> {expiryLabel(promo, today)}
            </span>
          )}
          {promo.minPurchase ? <span className="chip bg-crema text-tinta-2">Mín. {formatARS(promo.minPurchase)}</span> : null}
          {promo.coupon?.code ? <span className="chip bg-bosque text-lima">Con código</span> : null}
          {promo.isSample && <SampleBadge />}
        </div>
      </div>
    </Link>
  );
}

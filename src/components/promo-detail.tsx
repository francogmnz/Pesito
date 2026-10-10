import { formatDate, formatDays } from "@/lib/domain/dates";
import { capLabel, CHANNEL_LABEL, REQUIREMENT_LABEL } from "@/lib/domain/labels";
import { formatARS } from "@/lib/domain/money";
import type { Promotion } from "@/lib/domain/types";
import { Icon } from "./icon";
import { DetailRow, Notice } from "./ui";

/** Bloque común de condiciones y fuente para promos, cupones y cumpleaños. */
export function PromoFacts({ promo, today, hideCap = false }: { promo: Promotion; today: string; hideCap?: boolean }) {
  return (
    <div className="tarjeta divide-y divide-linea px-4 py-1.5">
      {!hideCap && <DetailRow icon="tag" label="Tope">{capLabel(promo)}</DetailRow>}
      {promo.minPurchase ? <DetailRow icon="cart" label="Compra mínima">{formatARS(promo.minPurchase)}</DetailRow> : null}
      <DetailRow icon="calendar" label="Vigencia">
        {promo.validUntil ? `Hasta el ${formatDate(promo.validUntil, today)}` : "Sin fecha de fin informada"}
      </DetailRow>
      {promo.kind !== "cumple" && <DetailRow icon="clock" label="Días">{formatDays(promo.daysOfWeek)}</DetailRow>}
      {promo.paymentMethods.length > 0 && (
        <DetailRow icon="wallet" label="Medio de pago">
          {promo.paymentMethods.map((p) => p.name).join(", ")}
        </DetailRow>
      )}
      <DetailRow icon="store" label="Dónde aplica">{CHANNEL_LABEL[promo.channel]}</DetailRow>
    </div>
  );
}

export function Requirements({ promo }: { promo: Promotion }) {
  if (!promo.requirements.length) return null;
  return (
    <ul className="grid gap-2">
      {promo.requirements.map((r) => (
        <li key={r} className="flex items-center gap-2.5 rounded-2xl bg-superficie px-3.5 py-3 text-sm font-semibold">
          <Icon name="checkCircle" size={19} className="shrink-0 text-verde" />
          {REQUIREMENT_LABEL[r]}
        </li>
      ))}
    </ul>
  );
}

export function SourceAndConditions({ promo }: { promo: Promotion }) {
  return (
    <div className="grid gap-3">
      {promo.conditions && (
        <details className="tarjeta group p-4" open>
          <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
            Condiciones
            <Icon name="chevronDown" size={18} className="transition group-open:rotate-180" />
          </summary>
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-tinta-2">{promo.conditions}</p>
        </details>
      )}
      {promo.sourceUrl && (
        <a href={promo.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="btn-secundario">
          <Icon name="external" size={18} /> Ver en la fuente oficial
        </a>
      )}
      {promo.isSample ? (
        <Notice tone="alerta">Esta promo es un ejemplo del modo demo: no existe y el enlace no lleva a una fuente real.</Notice>
      ) : (
        <p className="text-center text-xs text-tenue">
          {promo.sourceName ? `Fuente: ${promo.sourceName}. ` : ""}
          {promo.lastVerifiedAt ? `Verificada el ${formatDate(promo.lastVerifiedAt.slice(0, 10))}. ` : ""}
          Revisá siempre las condiciones en la fuente oficial.
        </p>
      )}
    </div>
  );
}

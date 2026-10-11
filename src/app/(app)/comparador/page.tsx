import Link from "next/link";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { MerchantAvatar, PaymentDot } from "@/components/brand";
import { Icon } from "@/components/icon";
import { EmptyState, PageHeader } from "@/components/ui";
import { getCurrentUser, getRepo } from "@/lib/data";
import { compareForMerchant } from "@/lib/domain/calc";
import { todayAR } from "@/lib/domain/dates";
import { capLabel, headline, headlineSuffix } from "@/lib/domain/labels";
import { formatARS, parseARS } from "@/lib/domain/money";

export const metadata = { title: "Comparar medios de pago" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ comercio?: string; monto?: string }> }) {
  const sp = await searchParams;
  const [repo, user] = await Promise.all([getRepo(), getCurrentUser()]);
  const today = todayAR();
  const all = await repo.listPromotions({ kinds: ["reintegro", "descuento"] });
  // Solo comercios con al menos una promo vigente.
  const merchants = [...new Map(all.map((p) => [p.merchant.slug, p.merchant])).values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  // Por defecto, el comercio con más opciones para comparar.
  const optionsBySlug = new Map<string, number>();
  for (const p of all) optionsBySlug.set(p.merchant.slug, (optionsBySlug.get(p.merchant.slug) ?? 0) + p.paymentMethods.length);
  const busiest = [...merchants].sort((a, b) => (optionsBySlug.get(b.slug) ?? 0) - (optionsBySlug.get(a.slug) ?? 0))[0];
  const merchant = merchants.find((m) => m.slug === sp.comercio) ?? busiest;
  const amount = parseARS(sp.monto ?? "") ?? 25000;
  const rows = merchant ? compareForMerchant(all.filter((p) => p.merchant.slug === merchant.slug), amount, today, await repo.listPaymentMethods(), user?.paymentMethodIds ?? []) : [];
  const bestId = rows.find((r) => r.appliesToday)?.paymentMethod.id;

  return (
    <div>
      <PageHeader title="Comparar medios de pago" back="/" subtitle="Mismo comercio, distintas opciones. Elegí la que más te conviene." />
      {!merchant ? (
        <EmptyState title="Todavía no hay promos para comparar" text="Cuando haya promos publicadas vas a poder compararlas acá." pose="buscando" />
      ) : (
        <>
          <form className="tarjeta grid gap-3 p-4" action="/comparador">
            <div className="flex items-center gap-3">
              <MerchantAvatar merchant={merchant} size={44} />
              <label className="min-w-0 flex-1">
                <span className="sr-only">Comercio</span>
                <AutoSubmitSelect name="comercio" defaultValue={merchant.slug} className="campo font-semibold">
                  {merchants.map((m) => (
                    <option key={m.slug} value={m.slug}>
                      {m.name}
                    </option>
                  ))}
                </AutoSubmitSelect>
              </label>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex-1">
                <span className="etiqueta">Monto de la compra</span>
                <input name="monto" inputMode="decimal" defaultValue={new Intl.NumberFormat("es-AR").format(amount)} className="campo numero font-bold" />
              </label>
              <button className="btn-primario">Comparar</button>
            </div>
          </form>

          <ul className="mt-4 grid gap-3">
            {rows.map((r) => {
              const best = r.paymentMethod.id === bestId;
              return (
                <li key={r.paymentMethod.id}>
                  <Link
                    href={r.promotion ? `/promos/${r.promotion.id}` : "#"}
                    className={`tarjeta block p-4 ${best ? "ring-2 ring-verde" : ""} ${r.appliesToday ? "" : "opacity-75"}`}
                  >
                    {best && (
                      <span className="chip mb-2 bg-lima text-bosque">
                        <Icon name="checkCircle" size={14} /> Más ahorro hoy
                      </span>
                    )}
                    <div className="flex items-center gap-3">
                      <PaymentDot pm={r.paymentMethod} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {r.paymentMethod.name}
                          {r.userHasIt && <span className="ml-1.5 text-xs font-semibold text-verde">· lo tenés</span>}
                        </p>
                        {r.promotion && (
                          <p className="text-sm text-tinta-2">
                            <b className="text-verde-oscuro">
                              {headline(r.promotion)} {headlineSuffix(r.promotion)}
                            </b>{" "}
                            · Tope {capLabel(r.promotion)}
                          </p>
                        )}
                        {!r.appliesToday && <p className="text-xs font-semibold text-alerta">Hoy no aplica</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-tinta-2">Pagás</p>
                        <p className="numero font-bold">{formatARS(r.result?.finalCost ?? amount)}</p>
                        {r.result && r.result.saving > 0 && <p className="numero text-xs font-semibold text-verde">−{formatARS(r.result.saving)}</p>}
                      </div>
                    </div>
                    {r.result && !r.result.eligible && <p className="mt-2 text-xs font-semibold text-alerta">{r.result.reason}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 px-1 text-xs text-tenue">El costo final es estimado e incluye el reintegro que te devuelven después. Revisá las condiciones de cada promo.</p>
        </>
      )}
    </div>
  );
}

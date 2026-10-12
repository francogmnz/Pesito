import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MerchantAvatar } from "@/components/brand";
import { PromoCalculator } from "@/components/calculator";
import { Icon } from "@/components/icon";
import { SaveButton } from "@/components/promo-actions";
import { PromoFacts, Requirements, SourceAndConditions } from "@/components/promo-detail";
import { windowLabel } from "@/lib/domain/birthday";
import { PageHeader, SampleBadge } from "@/components/ui";
import { getCurrentUser, getRepo } from "@/lib/data";
import { availability } from "@/lib/domain/calc";
import { todayAR } from "@/lib/domain/dates";
import { headline, headlineSuffix, KIND_LABEL, sweetSpot } from "@/lib/domain/labels";
import { formatARS } from "@/lib/domain/money";

export default async function PromoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [repo, user] = await Promise.all([getRepo(), getCurrentUser()]);
  const promo = await repo.getPromotion(id);
  if (!promo) notFound();
  // Cupones y cumpleaños tienen su propia pantalla.
  if (promo.kind === "cupon") redirect(`/cupones/${id}`);
  const today = todayAR();
  const state = user ? (await repo.getUserStates(user.id)).get(id) : undefined;
  const av = availability(promo, today);
  const best = sweetSpot(promo);

  return (
    <div>
      <PageHeader title={promo.merchant.name} back={promo.kind === "cumple" ? "/cumple" : "/promos"} action={<SaveButton promotionId={id} saved={!!state?.savedAt} path={`/promos/${id}`} compact />} />
      <section className="tarjeta p-5">
        <div className="flex items-center gap-3">
          <MerchantAvatar merchant={promo.merchant} size={52} />
          <div className="min-w-0">
            <p className="text-lg font-bold">{promo.merchant.name}</p>
            <div className="mt-0.5 flex flex-wrap gap-1.5">
              <span className="chip bg-lima-suave text-verde-oscuro">{KIND_LABEL[promo.kind]}</span>
              {promo.isSample && <SampleBadge />}
            </div>
          </div>
        </div>
        <p className="mt-5 flex items-baseline gap-2">
          <span className="numero text-[64px] leading-[0.9] font-black">{headline(promo)}</span>
          <span className="text-xl font-bold">{headlineSuffix(promo)}</span>
        </p>
        <p className="mt-2 text-[15px] text-tinta-2">{promo.summary ?? promo.title}</p>
        <p className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${av.state === "activa" ? "bg-lima-suave text-verde-oscuro" : "bg-alerta-suave text-alerta"}`}>
          <Icon name={av.state === "activa" ? "checkCircle" : "clock"} size={16} /> {av.label}
        </p>
      </section>

      {best && (
        <section className="mt-3 flex items-center gap-3 rounded-2xl bg-lima p-4 text-bosque">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-bosque text-lima">
            <Icon name="bolt" />
          </span>
          <p className="text-[15px] leading-snug">
            <b className="block text-[17px]">Para aprovecharla al máximo, gastá {formatARS(best.amount)}</b>
            Con esa compra te {promo.kind === "reintegro" ? "devuelven" : "descuentan"} {formatARS(best.saving)}, que es el tope{best.period ? ` ${best.period}` : ""}. Si gastás más, el beneficio no sube.
          </p>
        </section>
      )}

      {promo.birthday && (
        <section className="mt-4 grid gap-2">
          <h2 className="font-bold">Cuándo y cómo se usa</h2>
          <p className="flex items-center gap-2.5 rounded-2xl bg-lima px-3.5 py-3 text-sm font-semibold">
            <Icon name="cake" size={19} /> {windowLabel(promo.birthday)}
          </p>
          {promo.birthday.loyaltyProgram && (
            <p className="flex items-center gap-2.5 rounded-2xl bg-superficie px-3.5 py-3 text-sm font-semibold">
              <Icon name="ticket" size={19} className="text-verde" /> Programa: {promo.birthday.loyaltyProgram}
            </p>
          )}
          <Requirements promo={promo} />
        </section>
      )}

      <div className="mt-4">
        <PromoFacts promo={promo} today={today} hideCap={promo.discountKind === "regalo"} />
      </div>

      {promo.discountKind !== "regalo" && (
        <section className="tarjeta mt-4 p-4">
          <h2 className="mb-3 flex items-center gap-2 font-bold">
            <Icon name="calculator" size={20} className="text-verde" /> Calculá tu ahorro
          </h2>
          <PromoCalculator input={{ discountKind: promo.discountKind, discountValue: promo.discountValue, capAmount: promo.capAmount, minPurchase: promo.minPurchase }} />
          <p className="mt-3 text-xs text-tenue">Es una estimación. El reintegro real depende de los tiempos y condiciones de cada banco o billetera.</p>
        </section>
      )}

      <div className="mt-4">
        <SourceAndConditions promo={promo} />
      </div>

      {promo.kind !== "cumple" && (
        <Link href={`/comparador?comercio=${promo.merchant.slug}`} className="btn-primario mt-4 w-full">
          <Icon name="compare" size={19} /> Comparar medios de pago acá
        </Link>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MerchantAvatar } from "@/components/brand";
import { Icon } from "@/components/icon";
import { CopyCode, ReportForm, SaveButton, UsedButton } from "@/components/promo-actions";
import { Requirements, SourceAndConditions } from "@/components/promo-detail";
import { DetailRow, PageHeader, SampleBadge } from "@/components/ui";
import { getCurrentUser, getRepo } from "@/lib/data";
import { expiryLabel, isExpired, isExpiringSoon } from "@/lib/domain/coupons";
import { formatDate } from "@/lib/domain/dates";
import { capLabel, CHANNEL_LABEL, headline } from "@/lib/domain/labels";
import { formatARS } from "@/lib/domain/money";
import { todayAR } from "@/lib/domain/dates";

export default async function CouponDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [repo, user] = await Promise.all([getRepo(), getCurrentUser()]);
  const promo = await repo.getPromotion(id);
  if (!promo) notFound();
  if (promo.kind !== "cupon") redirect(`/promos/${id}`);
  const today = todayAR();
  const state = user ? (await repo.getUserStates(user.id)).get(id) : undefined;
  const c = promo.coupon;
  const expired = isExpired(promo, today);
  const soon = isExpiringSoon(promo, today);
  const path = `/cupones/${id}`;

  return (
    <div>
      <PageHeader title="Cupón" back="/cupones" action={user ? <SaveButton promotionId={id} saved={!!state?.savedAt} path={path} compact /> : undefined} />

      <section className="relative overflow-hidden rounded-[26px] bg-lima p-5">
        <span aria-hidden className="absolute top-[118px] -left-3 size-6 rounded-full bg-crema" />
        <span aria-hidden className="absolute top-[118px] -right-3 size-6 rounded-full bg-crema" />
        <div className="flex items-center gap-3">
          <MerchantAvatar merchant={promo.merchant} size={48} />
          <div className="min-w-0 flex-1">
            <p className="text-lg leading-tight font-bold">{promo.merchant.name}</p>
            {promo.isSample && <SampleBadge />}
          </div>
        </div>
        <p className="numero mt-4 text-[56px] leading-[0.9] font-black">
          {headline(promo)}
          {promo.discountKind !== "regalo" && <span className="ml-2 text-2xl font-bold">off</span>}
        </p>
        <div className="mt-4 border-t-2 border-dashed border-bosque/25 pt-4">
          <p className="text-[17px] leading-snug font-bold">{promo.title}</p>
          <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${expired ? "bg-peligro-suave text-peligro" : soon ? "bg-bosque text-lima" : "bg-white/60"}`}>
            <Icon name="clock" size={16} /> {expiryLabel(promo, today)}
          </p>
        </div>
      </section>

      <section className="mt-4">
        {expired ? (
          <p className="rounded-2xl bg-peligro-suave p-4 text-sm font-semibold text-peligro">Este cupón venció el {formatDate(promo.validUntil, today)}.</p>
        ) : c?.redemption === "codigo" && c.code ? (
          <>
            <p className="etiqueta">Tu código</p>
            <CopyCode code={c.code} />
          </>
        ) : c?.redemption === "link" ? (
          <p className="flex items-start gap-2.5 rounded-2xl bg-superficie p-4 text-sm">
            <Icon name="link" size={19} className="mt-0.5 shrink-0 text-verde" />
            <span>
              <b className="block">No necesita código</b>Se activa desde el enlace oficial del comercio.
            </span>
          </p>
        ) : (
          <p className="flex items-start gap-2.5 rounded-2xl bg-superficie p-4 text-sm">
            <Icon name="bolt" size={19} className="mt-0.5 shrink-0 text-verde" />
            <span>
              <b className="block">Se aplica solo</b>El descuento aparece al pagar, si cumplís las condiciones.
            </span>
          </p>
        )}
      </section>

      <div className="tarjeta mt-4 divide-y divide-linea px-4 py-1.5">
        <DetailRow icon="tag" label="Descuento">
          {headline(promo)}
          {promo.capAmount ? ` · tope ${capLabel(promo)}` : ""}
        </DetailRow>
        <DetailRow icon="cart" label="Compra mínima">{promo.minPurchase ? formatARS(promo.minPurchase) : "Sin mínimo informado"}</DetailRow>
        <DetailRow icon="calendar" label="Vence">{promo.validUntil ? formatDate(promo.validUntil, today) : "Sin fecha informada"}</DetailRow>
        <DetailRow icon="user" label="Usuarios nuevos">{c?.newCustomersOnly ? "Solo para clientes nuevos" : "Para cualquier cliente"}</DetailRow>
        <DetailRow icon="device" label="Registro en otra plataforma">
          {c?.requiresExternalSignup ? `Sí: ${c.externalPlatform}` : "No hace falta"}
        </DetailRow>
        <DetailRow icon="store" label="Dónde">{CHANNEL_LABEL[promo.channel]}</DetailRow>
      </div>

      {promo.requirements.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 font-bold">Requisitos</h2>
          <Requirements promo={promo} />
        </section>
      )}

      <div className="mt-4">
        <SourceAndConditions promo={promo} />
      </div>

      {user ? (
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <SaveButton promotionId={id} saved={!!state?.savedAt} path={path} />
          <UsedButton promotionId={id} used={!!state?.usedAt} path={path} />
        </div>
      ) : (
        <Link href={`/ingresar?volver=${path}`} className="btn-secundario mt-4 w-full">
          Ingresá para guardar y marcar como usado
        </Link>
      )}

      <div className="mt-6 text-center">{user ? <ReportForm promotionId={id} /> : null}</div>
    </div>
  );
}

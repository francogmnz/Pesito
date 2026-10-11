import Link from "next/link";
import { notFound } from "next/navigation";
import { savePromotion, setPromotionStatus } from "@/app/admin/actions";
import { EditPayloadForm } from "@/app/admin/revision/[id]/edit-form";
import { MerchantAvatar } from "@/components/brand";
import { Icon } from "@/components/icon";
import { getRepo } from "@/lib/data";
import { headline, KIND_LABEL } from "@/lib/domain/labels";
import { payloadFromPromotion } from "@/lib/domain/payload-form";
import type { PromoStatus } from "@/lib/domain/types";

export const metadata = { title: "Editar promo" };

const STATUS_LABEL: Record<PromoStatus, string> = { borrador: "Borrador", en_revision: "Pausada", publicada: "Publicada", vencida: "Vencida", archivada: "Archivada" };

export default async function PromoAdminDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepo();
  const promo = await repo.getPromotion(id, { includeUnpublished: true });
  if (!promo) notFound();
  const [categories, paymentMethods, events] = await Promise.all([repo.listCategories(), repo.listPaymentMethods(), repo.listModerationEvents("promotion", id)]);
  const status = (to: PromoStatus, label: string, primary = false) => (
    <form action={setPromotionStatus.bind(null, id, to)}>
      <button className={`${primary ? "btn-primario" : "btn-secundario"} w-full`}>{label}</button>
    </form>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Link href="/admin/promos" className="inline-flex items-center gap-1 text-sm font-semibold text-tinta-2">
        <Icon name="chevronLeft" size={16} /> Volver a Promos
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <MerchantAvatar merchant={promo.merchant} size={48} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl leading-tight font-bold">{promo.title}</h1>
          <p className="text-sm text-tinta-2">
            {promo.merchant.name} · {KIND_LABEL[promo.kind]} · {headline(promo)} · {promo.sourceName ? `Leída de ${promo.sourceName}` : "Cargada a mano"}
          </p>
        </div>
        <span className="chip bg-bosque px-3 py-1 text-sm text-lima">{STATUS_LABEL[promo.status]}</span>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="tarjeta min-w-0 p-4">
          <h2 className="mb-1 font-bold">Datos de la promo</h2>
          <p className="mb-3 text-sm text-tinta-2">
            El nombre y el rubro del comercio se cambian desde <Link href={`/admin/comercios?q=${encodeURIComponent(promo.merchant.name)}`} className="font-semibold text-verde">Comercios</Link>.
          </p>
          <EditPayloadForm id={id} payload={payloadFromPromotion(promo)} categories={categories} paymentMethods={paymentMethods} readOnly={false} save={savePromotion.bind(null, id)} saveLabel="Guardar cambios" lockMerchant />
        </section>

        <aside className="grid gap-4 lg:sticky lg:top-4">
          <section className="tarjeta grid gap-2 p-4">
            <h2 className="font-bold">Estado</h2>
            {promo.status === "publicada" ? (
              <>
                <p className="text-sm text-tinta-2">Se ve en la app.</p>
                {status("archivada", "Archivar (dar de baja)")}
                {status("vencida", "Marcar como vencida")}
                {status("en_revision", "Pausar")}
              </>
            ) : (
              <>
                <p className="text-sm text-tinta-2">No se ve en la app.</p>
                {status("publicada", "Volver a publicar", true)}
                {promo.status !== "archivada" && status("archivada", "Archivar (dar de baja)")}
              </>
            )}
            {promo.status === "publicada" && (
              <Link href={promo.kind === "cupon" ? `/cupones/${id}` : `/promos/${id}`} className="inline-flex items-center gap-1.5 pt-1 text-sm font-semibold text-verde">
                <Icon name="external" size={16} /> Ver como la ve la gente
              </Link>
            )}
          </section>

          <section className="tarjeta p-4 text-sm">
            <h2 className="mb-2 font-bold">Origen</h2>
            <p className="text-tinta-2">{promo.sourceName ?? "Cargada a mano"}</p>
            {promo.externalId && <p className="text-xs break-all text-tinta-2">Identificador en la fuente: {promo.externalId}</p>}
            <p className="mt-1 text-xs text-tinta-2">
              {promo.lastVerifiedAt ? `Verificada por última vez el ${new Date(promo.lastVerifiedAt).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Sin verificar todavía"}
            </p>
          </section>

          <section className="tarjeta p-4">
            <h2 className="mb-2 font-bold">Historial</h2>
            <ol className="grid gap-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="border-l-2 border-lima pl-3">
                  <b>{e.action}</b>
                  <span className="block text-xs text-tinta-2">
                    {e.actorName ?? "Sistema"} · {new Date(e.createdAt).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {e.note && <span className="block text-xs">“{e.note}”</span>}
                </li>
              ))}
              {events.length === 0 && <li className="text-tinta-2">Sin movimientos todavía.</li>}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { MerchantAvatar } from "@/components/brand";
import { Icon } from "@/components/icon";
import { markDuplicate } from "@/app/admin/actions";
import { getRepo } from "@/lib/data";
import { findDuplicates } from "@/lib/domain/duplicates";
import { formatShortDate } from "@/lib/domain/dates";
import { headline, KIND_LABEL } from "@/lib/domain/labels";
import { allowedActions, canPublish, STATUS_LABEL } from "@/lib/domain/moderation";
import { publishProblems } from "@/lib/domain/validation";
import { EditPayloadForm } from "./edit-form";
import { ModerationPanel } from "./moderation-panel";

export const metadata = { title: "Revisar sugerencia" };

const DIFF_LABEL: Record<string, string> = {
  title: "Título",
  discountKind: "Tipo de beneficio",
  discountValue: "Beneficio",
  capAmount: "Tope",
  minPurchase: "Compra mínima",
  validFrom: "Desde",
  validUntil: "Hasta",
  daysOfWeek: "Días",
  channel: "Canal",
  conditions: "Condiciones",
  "coupon.code": "Código",
};

export default async function ReviewDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepo();
  const sub = await repo.getSubmission(id);
  if (!sub) notFound();
  const [image, existing, categories, paymentMethods, events] = await Promise.all([
    sub.imagePath ? repo.getSubmissionImage(sub.imagePath) : Promise.resolve(null),
    repo.listPromotions({ statuses: ["publicada", "en_revision", "borrador", "vencida"], limit: 1000 }),
    repo.listCategories(),
    repo.listPaymentMethods(),
    repo.listModerationEvents("submission", id),
  ]);
  const published = !!sub.publishedPromotionId;
  const dups = sub.changeType === "nueva" ? findDuplicates({ ...sub.payload, fingerprint: sub.fingerprint }, existing) : [];
  const problems = publishProblems(sub.payload);
  const matched = sub.matchedPromotionId ? existing.find((p) => p.id === sub.matchedPromotionId) : null;
  const ai = sub.aiExtraction as { confidence?: number; notes?: string | null } | null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Link href="/admin/revision" className="inline-flex items-center gap-1 text-sm font-semibold text-tinta-2">
        <Icon name="chevronLeft" size={16} /> Volver a la cola
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <MerchantAvatar merchant={{ name: sub.payload.merchantName || "?", logoUrl: null, logoAuthorized: false, categorySlug: sub.payload.categorySlug }} size={48} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl leading-tight font-bold">{sub.payload.title || "Sin título"}</h1>
          <p className="text-sm text-tinta-2">
            {KIND_LABEL[sub.payload.kind]} · {headline({ discountKind: sub.payload.discountKind, discountValue: sub.payload.discountValue })} ·{" "}
            {sub.origin === "usuario" ? `Sugerida por ${sub.submitterName ?? "una persona"}` : `Detectada en ${sub.sourceName ?? "una fuente"}`} · {formatShortDate(sub.createdAt.slice(0, 10))}
          </p>
        </div>
        <span className="chip bg-bosque px-3 py-1 text-sm text-lima">{published ? "Publicada" : STATUS_LABEL[sub.status]}</span>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-4">
          {/* Evidencia */}
          <section className="tarjeta grid gap-3 p-4">
            <h2 className="font-bold">Evidencia</h2>
            {image ? (
              <a href={image.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border border-linea">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="Captura enviada" className="max-h-[420px] w-full bg-crema object-contain" />
              </a>
            ) : (
              <p className="text-sm text-tinta-2">{sub.imagePath ? "No se pudo cargar la captura." : "Sin captura."}</p>
            )}
            {sub.payload.sourceUrl ? (
              <a href={sub.payload.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-sm font-semibold break-all text-verde">
                <Icon name="external" size={16} /> {sub.payload.sourceUrl}
              </a>
            ) : (
              <p className="text-sm font-semibold text-alerta">Sin enlace oficial: hay que encontrarlo antes de publicar.</p>
            )}
            {sub.comments && <blockquote className="rounded-2xl bg-crema p-3 text-sm">“{sub.comments}”</blockquote>}
            {ai && (
              <p className="flex items-start gap-2 text-sm text-tinta-2">
                <Icon name="wand" size={16} className="mt-0.5 shrink-0" />
                Completada con IA (confianza {Math.round((ai.confidence ?? 0) * 100)}%). {ai.notes ?? ""} Verificá cada dato.
              </p>
            )}
            {sub.flagReasons.length > 0 && (
              <ul className="grid gap-1">
                {sub.flagReasons.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm font-semibold text-alerta">
                    <Icon name="alert" size={16} /> {f}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Cambio detectado */}
          {sub.diff && (
            <section className="tarjeta p-4">
              <h2 className="mb-2 font-bold">Cambios detectados {matched && <Link href={`/promos/${matched.id}`} className="text-sm font-semibold text-verde">en “{matched.title}”</Link>}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-tinta-2">
                    <th className="py-1 font-semibold">Campo</th>
                    <th className="py-1 font-semibold">Antes</th>
                    <th className="py-1 font-semibold">Ahora</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(sub.diff).map(([k, v]) => (
                    <tr key={k} className="border-t border-linea">
                      <td className="py-1.5 pr-2 font-semibold">{DIFF_LABEL[k] ?? k}</td>
                      <td className="py-1.5 pr-2 text-tinta-2 line-through">{JSON.stringify(v.antes)}</td>
                      <td className="py-1.5 font-semibold">{JSON.stringify(v.despues)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Corregir */}
          <section className="tarjeta p-4">
            <h2 className="mb-3 font-bold">Datos de la promo</h2>
            <EditPayloadForm id={id} payload={sub.payload} categories={categories} paymentMethods={paymentMethods} readOnly={published || sub.status === "rechazada"} />
          </section>
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-4">
          <section className="tarjeta p-4">
            <h2 className="mb-3 font-bold">Decisión</h2>
            {problems.length > 0 && !published && sub.changeType !== "baja" && (
              <div className="mb-3 rounded-2xl bg-alerta-suave p-3 text-sm text-alerta">
                <b>Falta para publicar:</b>
                <ul className="mt-1 list-disc pl-5">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            <ModerationPanel id={id} actions={allowedActions(sub.status, published)} canPublish={canPublish(sub.status, published)} published={published} changeType={sub.changeType} />
          </section>

          {sub.changeType === "nueva" && (
            <section className="tarjeta p-4">
              <h2 className="mb-2 font-bold">Posibles duplicados</h2>
              {dups.length === 0 ? (
                <p className="text-sm text-tinta-2">No encontramos promos parecidas.</p>
              ) : (
                <ul className="grid gap-2">
                  {dups.map((d) => (
                    <li key={d.promotion.id} className="rounded-2xl border border-linea p-3">
                      <div className="flex items-start gap-2">
                        <Link href={d.promotion.kind === "cupon" ? `/cupones/${d.promotion.id}` : `/promos/${d.promotion.id}`} className="min-w-0 flex-1 text-sm font-semibold hover:underline">
                          {d.promotion.merchant.name}: {d.promotion.title}
                        </Link>
                        <span className={`chip ${d.score >= 0.9 ? "bg-peligro-suave text-peligro" : "bg-alerta-suave text-alerta"}`}>{Math.round(d.score * 100)}%</span>
                      </div>
                      <p className="mt-1 text-xs text-tinta-2">{d.reasons.join(" · ")}</p>
                      {!published && sub.status !== "rechazada" && (
                        <form action={markDuplicate.bind(null, id, d.promotion.id)} className="mt-2">
                          <button className="btn-secundario btn-chico w-full">Es duplicado: rechazar</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="tarjeta p-4">
            <h2 className="mb-2 font-bold">Historial</h2>
            <ol className="grid gap-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="border-l-2 border-lima pl-3">
                  <b>{e.action}</b> {e.toStatus && e.fromStatus !== e.toStatus ? `→ ${e.toStatus}` : ""}
                  <span className="block text-xs text-tinta-2">
                    {e.actorName ?? "Sistema"} · {new Date(e.createdAt).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {e.note && <span className="block text-xs">“{e.note}”</span>}
                </li>
              ))}
              {events.length === 0 && <li className="text-tinta-2">Sin movimientos todavía.</li>}
            </ol>
            {sub.reviewNote && <p className="mt-2 rounded-xl bg-crema p-2 text-xs">Nota: {sub.reviewNote}</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

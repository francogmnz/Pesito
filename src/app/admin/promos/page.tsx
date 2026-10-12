import Link from "next/link";
import { setPromotionStatus } from "@/app/admin/actions";
import { getRepo } from "@/lib/data";
import { formatShortDate } from "@/lib/domain/dates";
import { capLabel, headline, KIND_LABEL, paymentLabel } from "@/lib/domain/labels";
import type { PromoKind, PromoStatus } from "@/lib/domain/types";

export const metadata = { title: "Promos" };

const STATUSES: [PromoStatus, string][] = [
  ["publicada", "Publicadas"],
  ["en_revision", "Pausadas"],
  ["vencida", "Vencidas"],
  ["archivada", "Archivadas"],
];
const KINDS = Object.keys(KIND_LABEL) as PromoKind[];

type SP = Promise<{ estado?: string; tipo?: string; q?: string }>;

export default async function PromosAdmin({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const status = STATUSES.some(([s]) => s === sp.estado) ? (sp.estado as PromoStatus) : "publicada";
  const kind = KINDS.includes(sp.tipo as PromoKind) ? (sp.tipo as PromoKind) : undefined;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const list = await (await getRepo()).listPromotions({ statuses: [status], kinds: kind ? [kind] : undefined, q: q || undefined, limit: 300 });
  const href = (p: { estado?: string; tipo?: string }) => {
    const u = new URLSearchParams({ estado: p.estado ?? status });
    const t = "tipo" in p ? p.tipo : kind;
    if (t) u.set("tipo", t);
    if (q) u.set("q", q);
    return `/admin/promos?${u}`;
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Promos, cupones y beneficios cargados</h1>
          <p className="text-sm text-tinta-2">Editá, archivá o volvé a publicar lo que ya está en la app. Lo archivado deja de verse, pero no se borra.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/promos/rapida" className="btn-primario btn-chico">
            Carga rápida de cupón
          </Link>
          <Link href="/admin/promos/nueva" className="btn-secundario btn-chico">
            Carga completa
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map(([s, label]) => (
          <Link
            key={s}
            href={href({ estado: s })}
            aria-current={s === status ? "page" : undefined}
            className={`rounded-full border px-3.5 py-2 text-sm font-semibold ${s === status ? "border-bosque bg-bosque text-white" : "border-linea bg-superficie text-tinta-2"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="py-1.5 text-tinta-2">Tipo:</span>
        {[undefined, ...KINDS].map((k) => (
          <Link key={k ?? "todos"} href={href({ tipo: k })} aria-current={kind === k ? "true" : undefined} className={`rounded-full px-3 py-1.5 font-semibold ${kind === k ? "bg-lima text-bosque" : "bg-superficie text-tinta-2"}`}>
            {k ? KIND_LABEL[k] : "Todos"}
          </Link>
        ))}
      </div>
      <form className="flex flex-wrap items-center gap-2" action="/admin/promos">
        <input type="hidden" name="estado" value={status} />
        {kind && <input type="hidden" name="tipo" value={kind} />}
        <input name="q" type="search" defaultValue={q} placeholder="Buscar por comercio o título" className="campo max-w-xs flex-1" />
        <button className="btn-secundario btn-chico">Buscar</button>
      </form>

      <p className="text-sm text-tinta-2">{list.length === 1 ? "1 resultado" : `${list.length} resultados`}{list.length === 300 ? " (se muestran los primeros 300: afiná la búsqueda)" : ""}</p>
      {list.length ? (
        <ul className="tarjeta divide-y divide-linea">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-2 pr-3.5">
              <Link href={`/admin/promos/${p.id}`} className="min-w-0 flex-1 p-3.5 hover:bg-crema/60">
                <p className="truncate font-semibold">{p.title}</p>
                <p className="flex flex-wrap gap-x-2 text-xs text-tinta-2">
                  <span>{p.merchant.name}</span>
                  <span>· {KIND_LABEL[p.kind]}</span>
                  <span>· {headline(p)}</span>
                  <span>· {capLabel(p)}</span>
                  <span>· {paymentLabel(p)}</span>
                  <span>· {p.validUntil ? `hasta ${formatShortDate(p.validUntil)}` : "sin vencimiento"}</span>
                  <span>· {p.sourceName ?? "Cargada a mano"}</span>
                </p>
              </Link>
              {status === "publicada" ? (
                <form action={setPromotionStatus.bind(null, p.id, "archivada")}>
                  <button className="btn-secundario btn-chico">Archivar</button>
                </form>
              ) : (
                <form action={setPromotionStatus.bind(null, p.id, "publicada")}>
                  <button className="btn-secundario btn-chico">Publicar</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="tarjeta p-5 text-sm text-tinta-2">No hay nada para mostrar con estos filtros.</p>
      )}
    </div>
  );
}

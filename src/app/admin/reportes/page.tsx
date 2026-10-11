import Link from "next/link";
import { Icon } from "@/components/icon";
import { resolveReport, setPromotionStatus } from "@/app/admin/actions";
import { getRepo } from "@/lib/data";
import type { Promotion, PromotionReport } from "@/lib/domain/types";

export const metadata = { title: "Reportes" };

const REASON: Record<PromotionReport["reason"], string> = {
  vencido: "Está vencido",
  codigo_invalido: "El código no funciona",
  datos_incorrectos: "Datos incorrectos",
  otro: "Otro",
};

export default async function ReportsPage() {
  const repo = await getRepo();
  const [reports, paused] = await Promise.all([repo.listReports("abierto"), repo.listPromotions({ statuses: ["en_revision"] })]);
  const byPromo = new Map<string, PromotionReport[]>();
  for (const r of reports) byPromo.set(r.promotionId, [...(byPromo.get(r.promotionId) ?? []), r]);
  const pausedById = new Map(paused.map((p) => [p.id, p]));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div>
        <h1 className="text-xl font-bold">Reportes de cupones y promos</h1>
        <p className="text-sm text-tinta-2">Con 3 reportes de personas distintas, la promo se pausa sola hasta que la revises.</p>
      </div>

      {byPromo.size === 0 && paused.length === 0 && <p className="tarjeta p-5 text-sm text-tinta-2">No hay reportes abiertos.</p>}

      {[...byPromo.entries()].map(([pid, list]) => (
        <ReportGroup key={pid} promotionId={pid} reports={list} paused={pausedById.get(pid)} />
      ))}

      {paused
        .filter((p) => !byPromo.has(p.id))
        .map((p) => (
          <ReportGroup key={p.id} promotionId={p.id} reports={[]} paused={p} />
        ))}
    </div>
  );
}

function ReportGroup({ promotionId, reports, paused }: { promotionId: string; reports: PromotionReport[]; paused?: Promotion }) {
  const title = reports[0]?.promotionTitle ?? paused?.title ?? "Promo";
  const merchant = reports[0]?.merchantName ?? paused?.merchant.name ?? "";
  return (
    <section className="tarjeta p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-tinta-2">{merchant}</p>
          <Link href={paused ? "#" : `/cupones/${promotionId}`} className="font-bold hover:underline">
            {title}
          </Link>
        </div>
        {paused ? (
          <span className="chip bg-alerta-suave text-alerta">
            <Icon name="alert" size={13} /> Pausada
          </span>
        ) : (
          <span className="chip bg-crema text-tinta-2">{reports.length === 1 ? "1 reporte" : `${reports.length} reportes`}</span>
        )}
      </div>
      {reports.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-crema p-3 text-sm">
              <span className="min-w-0 flex-1">
                <b>{REASON[r.reason]}</b>
                {r.comment && <span className="block text-tinta-2">“{r.comment}”</span>}
              </span>
              <form action={resolveReport.bind(null, r.id, "resuelto")}>
                <button className="btn-secundario btn-chico">Resuelto</button>
              </form>
              <form action={resolveReport.bind(null, r.id, "descartado")}>
                <button className="btn-secundario btn-chico">Descartar</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {paused && (
          <form action={setPromotionStatus.bind(null, promotionId, "publicada")}>
            <button className="btn-lima btn-chico">Funciona: volver a publicar</button>
          </form>
        )}
        <form action={setPromotionStatus.bind(null, promotionId, "vencida")}>
          <button className="btn-secundario btn-chico">Marcar vencida</button>
        </form>
        <form action={setPromotionStatus.bind(null, promotionId, "archivada")}>
          <button className="btn-secundario btn-chico text-peligro">Archivar</button>
        </form>
      </div>
    </section>
  );
}

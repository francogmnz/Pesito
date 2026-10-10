import Link from "next/link";
import { Icon } from "@/components/icon";
import { getRepo } from "@/lib/data";
import { todayAR } from "@/lib/domain/dates";
import { STATUS_LABEL } from "@/lib/domain/moderation";
import { SubmissionRow } from "./submission-row";

export default async function AdminHome() {
  const repo = await getRepo();
  const today = todayAR();
  const [stats, queue] = await Promise.all([repo.adminStats(today), repo.listSubmissions({ status: "pendiente" })]);
  const tiles = [
    { label: STATUS_LABEL.pendiente, n: stats.submissions.pendiente, href: "/admin/revision?estado=pendiente", tone: "bg-lima" },
    { label: STATUS_LABEL.en_revision, n: stats.submissions.en_revision, href: "/admin/revision?estado=en_revision", tone: "bg-superficie" },
    { label: STATUS_LABEL.aprobada, n: stats.submissions.aprobada, href: "/admin/revision?estado=aprobada", tone: "bg-superficie" },
    { label: STATUS_LABEL.rechazada, n: stats.submissions.rechazada, href: "/admin/revision?estado=rechazada", tone: "bg-superficie" },
  ];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <section>
        <h1 className="mb-3 text-xl font-bold">Cola de revisión</h1>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href} className={`rounded-[20px] p-4 shadow-[var(--shadow-tarjeta)] ${t.tone}`}>
              <p className="numero text-3xl font-black">{t.n}</p>
              <p className="text-sm font-semibold text-tinta-2">{t.label}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Link href="/admin/reportes" className="tarjeta flex items-center gap-3 p-4">
          <Icon name="flag" className="text-alerta" />
          <span className="flex-1">
            <b className="numero block text-2xl">{stats.openReports}</b>
            <span className="text-sm text-tinta-2">Reportes abiertos</span>
          </span>
        </Link>
        <div className="tarjeta flex items-center gap-3 p-4">
          <Icon name="checkCircle" className="text-verde" />
          <span className="flex-1">
            <b className="numero block text-2xl">{stats.published}</b>
            <span className="text-sm text-tinta-2">Promos publicadas · {stats.inReview} pausadas por reportes</span>
          </span>
        </div>
        <div className="tarjeta flex items-center gap-3 p-4">
          <Icon name="clock" className="text-alerta" />
          <span className="flex-1">
            <b className="numero block text-2xl">{stats.expiringSoon}</b>
            <span className="text-sm text-tinta-2">Vencen en los próximos 7 días</span>
          </span>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Pendientes más recientes</h2>
          <Link href="/admin/revision" className="text-sm font-semibold text-verde">
            Ver todas
          </Link>
        </div>
        <ul className="tarjeta divide-y divide-linea">
          {queue.slice(0, 6).map((s) => (
            <SubmissionRow key={s.id} s={s} />
          ))}
          {queue.length === 0 && <li className="p-4 text-sm text-tinta-2">No hay nada pendiente. ¡Bien!</li>}
        </ul>
      </section>
    </div>
  );
}

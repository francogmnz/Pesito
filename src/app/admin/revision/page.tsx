import Link from "next/link";
import { getRepo } from "@/lib/data";
import { todayAR } from "@/lib/domain/dates";
import { STATUS_LABEL } from "@/lib/domain/moderation";
import type { SubmissionOrigin, SubmissionStatus } from "@/lib/domain/types";
import { SubmissionRow } from "../submission-row";

export const metadata = { title: "Revisión" };

const STATUSES: SubmissionStatus[] = ["pendiente", "en_revision", "aprobada", "rechazada"];

export default async function ReviewList({ searchParams }: { searchParams: Promise<{ estado?: string; origen?: string }> }) {
  const sp = await searchParams;
  const status = (STATUSES as string[]).includes(sp.estado ?? "") ? (sp.estado as SubmissionStatus) : "pendiente";
  const origin = sp.origen === "usuario" || sp.origen === "automatizacion" ? (sp.origen as SubmissionOrigin) : undefined;
  const repo = await getRepo();
  const [list, stats] = await Promise.all([repo.listSubmissions({ status, origin }), repo.adminStats(todayAR())]);
  const href = (p: { estado?: string; origen?: string }) => {
    const q = new URLSearchParams();
    const e = p.estado ?? status;
    const o = "origen" in p ? p.origen : origin;
    q.set("estado", e);
    if (o) q.set("origen", o);
    return `/admin/revision?${q}`;
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <h1 className="text-xl font-bold">Promociones sugeridas y detectadas</h1>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={href({ estado: s })}
            aria-current={s === status ? "page" : undefined}
            className={`rounded-full border px-3.5 py-2 text-sm font-semibold ${s === status ? "border-bosque bg-bosque text-white" : "border-linea bg-superficie text-tinta-2"}`}
          >
            {STATUS_LABEL[s]} <span className="opacity-70">{stats.submissions[s]}</span>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="py-1.5 text-tinta-2">Origen:</span>
        {(
          [
            [undefined, "Todos"],
            ["usuario", "Personas"],
            ["automatizacion", "Automatización"],
          ] as const
        ).map(([o, l]) => (
          <Link key={l} href={href({ origen: o })} aria-current={origin === o ? "true" : undefined} className={`rounded-full px-3 py-1.5 font-semibold ${origin === o ? "bg-lima text-bosque" : "bg-superficie text-tinta-2"}`}>
            {l}
          </Link>
        ))}
      </div>
      <ul className="tarjeta divide-y divide-linea">
        {list.map((s) => (
          <SubmissionRow key={s.id} s={s} />
        ))}
        {list.length === 0 && <li className="p-5 text-sm text-tinta-2">No hay sugerencias en “{STATUS_LABEL[status]}”{origin ? " con ese origen" : ""}.</li>}
      </ul>
    </div>
  );
}

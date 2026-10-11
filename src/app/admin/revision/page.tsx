import Link from "next/link";
import { getRepo } from "@/lib/data";
import { todayAR } from "@/lib/domain/dates";
import { STATUS_LABEL } from "@/lib/domain/moderation";
import { isBlocking } from "@/lib/ingest/process";
import type { SubmissionOrigin, SubmissionStatus } from "@/lib/domain/types";
import { SubmissionRow } from "../submission-row";
import { BulkForm } from "./bulk-form";

export const metadata = { title: "Revisión" };

const STATUSES: SubmissionStatus[] = ["pendiente", "en_revision", "aprobada", "rechazada"];

/** "Posible duplicado de “X”" y "Posible duplicado de “Y”" son el mismo motivo. */
const reasonGroup = (r: string) =>
  r
    .replace(/[“"«].*?[”"»]/g, "…")
    .replace(/\(.*?\)/g, "")
    .replace(/\d[\d./-]*/g, "…")
    .replace(/:.*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);

export default async function ReviewList({ searchParams }: { searchParams: Promise<{ estado?: string; origen?: string; motivo?: string; fuente?: string }> }) {
  const sp = await searchParams;
  const status = (STATUSES as string[]).includes(sp.estado ?? "") ? (sp.estado as SubmissionStatus) : "pendiente";
  const origin = sp.origen === "usuario" || sp.origen === "automatizacion" ? (sp.origen as SubmissionOrigin) : undefined;
  const repo = await getRepo();
  const [all, stats] = await Promise.all([repo.listSubmissions({ status, origin }), repo.adminStats(todayAR())]);
  const motivo = (sp.motivo ?? "").slice(0, 80);
  const fuente = (sp.fuente ?? "").slice(0, 80);
  // Motivos y fuentes de lo que está en la cola, con cuántas tiene cada uno: lo más repetido primero.
  const count = (keys: string[]) => [...keys.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const reasons = count(all.flatMap((s) => [...new Set(s.flagReasons.filter(isBlocking).map(reasonGroup))]));
  const sources = count(all.map((s) => s.sourceName ?? (s.origin === "usuario" ? "Personas" : "Automatización")));
  const clean = all.filter((s) => !s.flagReasons.some(isBlocking)).length;
  const list = all.filter(
    (s) =>
      (!fuente || (s.sourceName ?? (s.origin === "usuario" ? "Personas" : "Automatización")) === fuente) &&
      (!motivo || (motivo === "sin-avisos" ? !s.flagReasons.some(isBlocking) : s.flagReasons.filter(isBlocking).some((r) => reasonGroup(r) === motivo))),
  );
  const href = (p: { estado?: string; origen?: string; motivo?: string; fuente?: string }) => {
    const q = new URLSearchParams();
    const e = p.estado ?? status;
    const o = "origen" in p ? p.origen : origin;
    q.set("estado", e);
    if (o) q.set("origen", o);
    const m = "motivo" in p ? p.motivo : motivo;
    const f = "fuente" in p ? p.fuente : fuente;
    if (m && !("estado" in p)) q.set("motivo", m);
    if (f && !("estado" in p)) q.set("fuente", f);
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
      {all.length > 0 && (sources.length > 1 || reasons.length > 0) && (
        <div className="tarjeta grid gap-2 p-3 text-sm">
          {sources.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-tinta-2">Fuente:</span>
              <Link href={href({ fuente: undefined })} className={`rounded-full px-3 py-1 font-semibold ${!fuente ? "bg-lima text-bosque" : "bg-crema text-tinta-2"}`}>
                Todas
              </Link>
              {sources.map(([name, n]) => (
                <Link key={name} href={href({ fuente: name })} className={`rounded-full px-3 py-1 font-semibold ${fuente === name ? "bg-lima text-bosque" : "bg-crema text-tinta-2"}`}>
                  {name} <span className="opacity-70">{n}</span>
                </Link>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-tinta-2">Motivo:</span>
            <Link href={href({ motivo: undefined })} className={`rounded-full px-3 py-1 font-semibold ${!motivo ? "bg-lima text-bosque" : "bg-crema text-tinta-2"}`}>
              Todos
            </Link>
            {clean > 0 && (
              <Link href={href({ motivo: "sin-avisos" })} className={`rounded-full px-3 py-1 font-semibold ${motivo === "sin-avisos" ? "bg-lima text-bosque" : "bg-lima-suave text-verde-oscuro"}`}>
                Sin avisos <span className="opacity-70">{clean}</span>
              </Link>
            )}
            {reasons.map(([r, n]) => (
              <Link key={r} href={href({ motivo: r })} className={`rounded-full px-3 py-1 font-semibold ${motivo === r ? "bg-lima text-bosque" : "bg-alerta-suave text-alerta"}`}>
                {r} <span className="opacity-70">{n}</span>
              </Link>
            ))}
          </div>
          {motivo && motivo !== "sin-avisos" && <p className="text-xs text-tinta-2">Estás viendo un solo motivo: si ya sabés qué hacer con este grupo, podés marcarlas todas y publicarlas o rechazarlas juntas.</p>}
        </div>
      )}
      <BulkForm allowFlagged={!!motivo && motivo !== "sin-avisos"} total={list.filter((s) => !s.publishedPromotionId && status !== "rechazada").length}>
        <ul className="tarjeta divide-y divide-linea">
          {list.map((s) => (
            <SubmissionRow key={s.id} s={s} selectable={status !== "rechazada"} />
          ))}
          {list.length === 0 && <li className="p-5 text-sm text-tinta-2">No hay sugerencias en “{STATUS_LABEL[status]}”{origin ? " con ese origen" : ""}.</li>}
        </ul>
      </BulkForm>
    </div>
  );
}

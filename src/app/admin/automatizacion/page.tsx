import { getRepo } from "@/lib/data";
import { RunNowButton } from "./run-now";

export const metadata = { title: "Automatización" };

const KIND = { oficial: "Oficial", autorizada: "Autorizada", comunidad: "Comunidad" } as const;

export default async function AutomationPage() {
  const repo = await getRepo();
  const [sources, runs] = await Promise.all([repo.listSources(), repo.listIngestionRuns(15)]);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Actualización automática</h1>
          <p className="max-w-2xl text-sm text-tinta-2">
            Lee feeds oficiales o autorizados, detecta promos, cupones y beneficios de cumpleaños nuevos o con cambios, vence lo terminado y manda a revisión todo lo dudoso. Solo las fuentes oficiales con
            publicación automática pueden publicar sin revisión.
          </p>
        </div>
        <RunNowButton />
      </div>

      <section className="tarjeta overflow-x-auto p-4">
        <h2 className="mb-2 font-bold">Fuentes</h2>
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-tinta-2">
              <th className="py-1.5 font-semibold">Fuente</th>
              <th className="py-1.5 font-semibold">Tipo</th>
              <th className="py-1.5 font-semibold">Estado</th>
              <th className="py-1.5 font-semibold">Publica sola</th>
              <th className="py-1.5 font-semibold">Última corrida</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-t border-linea">
                <td className="py-2 pr-2">
                  <b>{s.name}</b>
                  <span className="block text-xs break-all text-tinta-2">{s.url}</span>
                </td>
                <td className="py-2 pr-2">{KIND[s.kind]}</td>
                <td className="py-2 pr-2">{s.active ? "Activa" : "Pausada"}</td>
                <td className="py-2 pr-2">{s.autoPublish ? "Sí" : "No, todo a revisión"}</td>
                <td className="py-2">{s.lastRunAt ? new Date(s.lastRunAt).toLocaleString("es-AR") : "Nunca"}</td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-tinta-2">
                  Todavía no hay fuentes. Cargalas en la tabla <code>sources</code> con su adaptador (por ejemplo <code>json-feed</code>).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="tarjeta overflow-x-auto p-4">
        <h2 className="mb-2 font-bold">Últimas corridas</h2>
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-tinta-2">
              <th className="py-1.5 font-semibold">Cuándo</th>
              <th className="py-1.5 font-semibold">Fuente</th>
              <th className="py-1.5 text-right font-semibold">Leídas</th>
              <th className="py-1.5 text-right font-semibold">Nuevas</th>
              <th className="py-1.5 text-right font-semibold">Actualizadas</th>
              <th className="py-1.5 text-right font-semibold">Verificadas</th>
              <th className="py-1.5 text-right font-semibold">A revisión</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-linea">
                <td className="py-2 pr-2">{new Date(r.startedAt).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="py-2 pr-2">
                  {r.sourceName ?? "—"}
                  {r.error && <span className="block text-xs font-semibold text-peligro">{r.error}</span>}
                </td>
                <td className="numero py-2 text-right">{r.found}</td>
                <td className="numero py-2 text-right">{r.created}</td>
                <td className="numero py-2 text-right">{r.updated}</td>
                <td className="numero py-2 text-right">{r.verified}</td>
                <td className="numero py-2 text-right">{r.flagged}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 text-tinta-2">
                  Sin corridas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

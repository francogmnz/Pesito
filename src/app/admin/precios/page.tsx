import Link from "next/link";
import { getRepo } from "@/lib/data";
import { PRICE_ADAPTER } from "@/lib/prices/crawl";

export const metadata = { title: "Precios" };

const n = (v: number | undefined) => (v ?? 0).toLocaleString("es-AR");

export default async function PricesAdmin() {
  const repo = await getRepo();
  const [sources, stats, health, merchants, runs] = await Promise.all([repo.listSources(), repo.priceStats(), repo.priceHealth(), repo.priceMerchants(), repo.listIngestionRuns(60)]);
  const stores = sources.filter((s) => s.adapter === PRICE_ADAPTER);
  const progress = new Map(await Promise.all(stores.map(async (s) => [s.id, await repo.sourceRecordStats(s.id)] as const)));
  const priceRuns = runs.filter((r) => stores.some((s) => s.id === r.sourceId)).slice(0, 15);
  const loaded = (slug: unknown) => merchants.find((m) => m.slug === slug)?.products ?? 0;

  const cards = [
    { label: "Productos", value: n(stats.products), hint: "uno por código de barras" },
    { label: "Comparables", value: n(stats.comparable), hint: "están en 2 o más tiendas" },
    { label: "Cambiaron de precio", value: n(health.changed24h), hint: "en las últimas 24 horas" },
    { label: "Sin stock", value: n(health.outOfStock), hint: "publicaciones" },
    { label: "Sin verificar", value: n(health.stale), hint: "hace más de 5 días", alert: health.stale > 0 },
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Comparar precios</h1>
          <p className="max-w-2xl text-sm text-tinta-2">Cómo viene la carga de productos y precios de cada tienda. Se leen solos, por tandas; los precios se revisan cada 3 días.</p>
        </div>
        <Link href="/conviene" className="btn-secundario btn-chico">
          Ver como la ve la gente
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="tarjeta p-4">
            <p className="text-xs font-semibold text-tinta-2">{c.label}</p>
            <p className={`numero text-2xl font-black ${c.alert ? "text-alerta" : ""}`}>{c.value}</p>
            <p className="text-xs text-tinta-2">{c.hint}</p>
          </div>
        ))}
      </div>

      <section className="tarjeta overflow-x-auto p-4">
        <h2 className="mb-2 font-bold">Tiendas</h2>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-tinta-2">
              <th className="py-1.5 font-semibold">Tienda</th>
              <th className="py-1.5 text-right font-semibold">Con precio</th>
              <th className="py-1.5 text-right font-semibold">Faltan leer</th>
              <th className="py-1.5 text-right font-semibold">Otros rubros o sin código</th>
              <th className="py-1.5 text-right font-semibold">Con error</th>
              <th className="py-1.5 font-semibold">Última lectura</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => {
              const st = progress.get(s.id) ?? {};
              const total = Object.values(st).reduce((a, b) => a + (b ?? 0), 0);
              const done = total ? Math.round(((total - (st.nueva ?? 0)) / total) * 100) : 0;
              return (
                <tr key={s.id} className="border-t border-linea">
                  <td className="py-2 pr-2">
                    <b>{String(s.config.merchantName ?? s.name)}</b>
                    <span className="block text-xs text-tinta-2">
                      {s.active ? (total ? `${done}% del catálogo leído` : "todavía no empezó") : "pausada"}
                    </span>
                  </td>
                  <td className="numero py-2 text-right">{n(loaded(s.config.merchantSlug))}</td>
                  <td className="numero py-2 text-right">{n(st.nueva)}</td>
                  <td className="numero py-2 text-right">{n((st.omitida ?? 0) + (st.sin_datos ?? 0))}</td>
                  <td className={`numero py-2 text-right ${st.error ? "font-bold text-alerta" : ""}`}>{n(st.error)}</td>
                  <td className="py-2 pl-2">{s.lastRunAt ? new Date(s.lastRunAt).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Nunca"}</td>
                </tr>
              );
            })}
            {stores.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-tinta-2">
                  Todavía no hay tiendas cargadas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="tarjeta overflow-x-auto p-4">
        <h2 className="mb-2 font-bold">Últimas lecturas</h2>
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-tinta-2">
              <th className="py-1.5 font-semibold">Cuándo</th>
              <th className="py-1.5 font-semibold">Tienda</th>
              <th className="py-1.5 text-right font-semibold">Páginas</th>
              <th className="py-1.5 text-right font-semibold">Productos nuevos</th>
              <th className="py-1.5 text-right font-semibold">Cambios de precio</th>
            </tr>
          </thead>
          <tbody>
            {priceRuns.map((r) => (
              <tr key={r.id} className="border-t border-linea">
                <td className="py-2 pr-2">{new Date(r.startedAt).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="py-2 pr-2">
                  {r.sourceName ?? "—"}
                  {r.error && <span className="block text-xs font-semibold text-peligro">{r.error}</span>}
                </td>
                <td className="numero py-2 text-right">{n(r.found)}</td>
                <td className="numero py-2 text-right">{n(r.created)}</td>
                <td className="numero py-2 text-right">{n(r.updated)}</td>
              </tr>
            ))}
            {priceRuns.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-tinta-2">
                  Sin lecturas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

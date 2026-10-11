import Link from "next/link";
import { Icon } from "@/components/icon";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { getRepo } from "@/lib/data";
import { formatARS } from "@/lib/domain/money";

export const metadata = { title: "¿Dónde conviene?" };

export default async function WherePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const repo = await getRepo();
  const [results, stats] = await Promise.all([repo.searchProducts(q, 40), repo.priceStats()]);

  return (
    <div>
      <PageHeader title="¿Dónde conviene?" back="/" subtitle="El mismo producto. El mejor precio." />
      <form action="/conviene" className="mb-3 flex gap-2">
        <input name="q" type="search" defaultValue={q} placeholder="Buscá por marca o producto" aria-label="Buscar producto" className="campo flex-1" />
        <button className="btn-primario" aria-label="Buscar">
          <Icon name="search" size={18} />
        </button>
      </form>

      {stats.products === 0 ? (
        <EmptyState title="Todavía estamos cargando precios" text="En unos días vas a poder comparar productos de perfumería, dermocosmética y cuidado personal entre farmacias." />
      ) : results.length === 0 ? (
        <EmptyState title="No lo encontramos" text={q ? `No hay productos con «${q}». Probá con la marca o con menos palabras.` : "Probá buscando una marca o un producto."} />
      ) : (
        <>
          <p className="mb-2 text-sm text-tinta-2">{q ? `${results.length === 40 ? "Primeros 40 resultados" : results.length === 1 ? "1 resultado" : `${results.length} resultados`} para «${q}»` : "Productos que están en más comercios"}</p>
          <ul className="grid gap-2">
            {results.map((p) => {
              const diff = p.stores > 1 && p.maxPrice > p.minPrice ? p.maxPrice - p.minPrice : 0;
              return (
                <li key={p.id}>
                  <Link href={`/conviene/${p.id}`} className="tarjeta flex items-center gap-3 p-3">
                    <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-white">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain" />
                      ) : (
                        <Icon name="tag" className="text-tenue" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      {p.brand && <span className="block text-xs font-semibold tracking-wide text-tinta-2 uppercase">{p.brand}</span>}
                      <b className="block leading-tight">{p.name}</b>
                      <span className="mt-0.5 block text-sm text-tinta-2">
                        {p.stores > 1 ? `Desde ${formatARS(p.minPrice)} · ${p.stores} comercios` : `${formatARS(p.minPrice)} · por ahora en 1 comercio`}
                      </span>
                      {diff > 0 && <span className="chip mt-1 bg-lima text-bosque">Hasta {formatARS(diff)} de diferencia</span>}
                    </span>
                    <Icon name="chevronRight" className="shrink-0 text-tenue" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-4">
        <Notice>
          Comparamos el mismo producto por su código de barras. Los precios son los que publica cada comercio en su tienda online y pueden cambiar: en cada uno te mostramos cuándo lo verificamos.
          {stats.products > 0 && ` Hoy hay ${stats.products.toLocaleString("es-AR")} productos cargados, ${stats.comparable.toLocaleString("es-AR")} en más de un comercio.`}
        </Notice>
      </div>
    </div>
  );
}

import Link from "next/link";
import { Icon } from "@/components/icon";
import { EmptyState, FinePrint, Notice, PageHeader } from "@/components/ui";
import { getRepo } from "@/lib/data";
import { formatARS, parseARS } from "@/lib/domain/money";

export const metadata = { title: "¿Dónde conviene?" };

const PAGE = 24;
const SORTS = [
  ["comercios", "En más comercios"],
  ["menor", "Menor precio"],
  ["mayor", "Mayor precio"],
] as const;
type Sort = (typeof SORTS)[number][0];

type SP = Promise<{ q?: string; orden?: string; comparar?: string; desde?: string; hasta?: string; pagina?: string }>;

export default async function WherePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const sort: Sort = SORTS.some(([s]) => s === sp.orden) ? (sp.orden as Sort) : "comercios";
  const comparable = sp.comparar === "1";
  const minPrice = parseARS(sp.desde ?? "") || undefined;
  const maxPrice = parseARS(sp.hasta ?? "") || undefined;
  const page = Math.min(500, Math.max(1, Math.trunc(Number(sp.pagina)) || 1));
  const repo = await getRepo();
  // Se pide uno de más para saber si hay página siguiente.
  const [found, stats] = await Promise.all([repo.searchProducts(q, { limit: PAGE + 1, offset: (page - 1) * PAGE, sort, comparable, minPrice, maxPrice }), repo.priceStats()]);
  const results = found.slice(0, PAGE);
  const hasNext = found.length > PAGE;
  const filtered = !!q || comparable || minPrice != null || maxPrice != null;

  const link = (patch: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = { q: q || undefined, orden: sort === "comercios" ? undefined : sort, comparar: comparable ? "1" : undefined, desde: sp.desde || undefined, hasta: sp.hasta || undefined, pagina: undefined, ...patch };
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return `/conviene${s ? `?${s}` : ""}`;
  };
  const chip = (active: boolean) => `inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-[13px] font-semibold ${active ? "border-bosque bg-bosque text-white" : "border-linea bg-superficie text-tinta-2"}`;

  return (
    <div>
      <PageHeader title="¿Dónde conviene?" back="/" subtitle="El mismo producto. El mejor precio." />
      <form action="/conviene" className="grid gap-2">
        <div className="flex gap-2">
          <input name="q" type="search" defaultValue={q} placeholder="Buscá por marca o producto" aria-label="Buscar producto" className="campo flex-1" />
          <button className="btn-primario" aria-label="Buscar">
            <Icon name="search" size={18} />
          </button>
        </div>
        {stats.products > 0 && (
          <div className="flex items-center gap-2 text-sm text-tinta-2">
            <span className="shrink-0">Precio</span>
            <input name="desde" inputMode="numeric" defaultValue={sp.desde ?? ""} placeholder="desde $" aria-label="Precio desde" className="campo min-w-0 flex-1 py-2 text-sm" />
            <input name="hasta" inputMode="numeric" defaultValue={sp.hasta ?? ""} placeholder="hasta $" aria-label="Precio hasta" className="campo min-w-0 flex-1 py-2 text-sm" />
            <button className="btn-secundario btn-chico shrink-0">Aplicar</button>
          </div>
        )}
        {sort !== "comercios" && <input type="hidden" name="orden" value={sort} />}
        {comparable && <input type="hidden" name="comparar" value="1" />}
      </form>

      {stats.products > 0 && (
        <div className="-mx-4 mt-2 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {SORTS.map(([s, label]) => (
            <Link key={s} href={link({ orden: s === "comercios" ? undefined : s })} aria-current={sort === s ? "true" : undefined} className={chip(sort === s)}>
              {label}
            </Link>
          ))}
          <Link href={link({ comparar: comparable ? undefined : "1" })} aria-current={comparable ? "true" : undefined} className={chip(comparable)}>
            Solo en 2 o más comercios
          </Link>
        </div>
      )}

      {stats.products === 0 ? (
        <EmptyState title="Todavía estamos cargando precios" text="En unos días vas a poder comparar productos de perfumería, dermocosmética y cuidado personal entre farmacias." />
      ) : results.length === 0 ? (
        <EmptyState title="No lo encontramos" text={filtered ? "No hay productos con esos filtros. Probá con la marca, menos palabras o sacando algún filtro." : "Probá buscando una marca o un producto."} />
      ) : (
        <>
          <p className="mb-2 text-sm text-tinta-2">
            {q ? `Resultados para «${q}»` : "Productos cargados"}
            {page > 1 ? ` · página ${page}` : ""}
          </p>
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
          {(page > 1 || hasNext) && (
            <nav aria-label="Páginas" className="mt-4 flex items-center justify-between gap-2">
              {page > 1 ? (
                <Link href={link({ pagina: page > 2 ? String(page - 1) : undefined })} className="btn-secundario btn-chico">
                  <Icon name="chevronLeft" size={16} /> Anterior
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-tinta-2">Página {page}</span>
              {hasNext ? (
                <Link href={link({ pagina: String(page + 1) })} className="btn-secundario btn-chico">
                  Siguiente <Icon name="chevronRight" size={16} />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}

      <div className="mt-4">
        <Notice>
          Comparamos el mismo producto por su código de barras. Los precios son los que publica cada comercio en su tienda online y pueden cambiar: en cada uno te mostramos cuándo lo verificamos.
          {stats.products > 0 && ` Hoy hay ${stats.products.toLocaleString("es-AR")} productos cargados, ${stats.comparable.toLocaleString("es-AR")} en más de un comercio.`}
        </Notice>
      </div>
      <FinePrint>Precios, fotos, nombres y disponibilidad tomados de la tienda online de cada comercio en la fecha que se indica junto a cada precio. Pueden cambiar sin aviso o ser distintos en los locales. Pesito no vende productos ni interviene en la compra: el precio final es el que informa el comercio al momento de pagar. Las marcas y sus imágenes pertenecen a sus respectivos dueños.</FinePrint>
    </div>
  );
}

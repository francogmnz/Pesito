import { getRepo } from "@/lib/data";
import { matchesQuery } from "@/lib/domain/fingerprint";
import { MerchantForm } from "./merchant-form";

export const metadata = { title: "Comercios" };

type SP = Promise<{ q?: string; sin?: string }>;

export default async function MerchantsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const repo = await getRepo();
  const [merchants, categories] = await Promise.all([repo.listMerchants(), repo.listCategories()]);
  const q = (sp.q ?? "").slice(0, 60);
  const onlyMissing = sp.sin === "1";
  const list = merchants.filter((m) => (!q || matchesQuery(m.name, q)) && (!onlyMissing || !m.logoUrl || !m.categorySlug));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div>
        <h1 className="text-xl font-bold">Comercios</h1>
        <p className="text-sm text-tinta-2">
          Rubro y logo de cada comercio. Los servicios como colectivos o subte ya muestran su ícono. Para mostrar el logo de una marca (YPF, Coto…) marcá que tenés permiso de uso.
        </p>
      </div>
      <form className="flex flex-wrap items-center gap-2" action="/admin/comercios">
        <input name="q" type="search" defaultValue={q} placeholder="Buscar comercio" className="campo max-w-xs flex-1" />
        <label className="flex items-center gap-2 text-sm font-semibold text-tinta-2">
          <input type="checkbox" name="sin" value="1" defaultChecked={onlyMissing} className="size-4 accent-[#5c8c3b]" /> Solo sin logo o rubro
        </label>
        <button className="btn-secundario btn-chico">Filtrar</button>
      </form>
      <p className="text-sm text-tinta-2">{list.length === 1 ? "1 comercio" : `${list.length} comercios`}</p>
      {list.length ? (
        <ul className="tarjeta divide-y divide-linea overflow-hidden">
          {list.map((m) => (
            <li key={m.id}>
              <MerchantForm merchant={m} categories={categories} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="tarjeta p-5 text-sm text-tinta-2">No hay comercios para mostrar.</p>
      )}
    </div>
  );
}

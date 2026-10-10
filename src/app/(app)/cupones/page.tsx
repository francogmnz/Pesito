import Link from "next/link";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { Mascot } from "@/components/brand";
import { Icon } from "@/components/icon";
import { CouponCard } from "@/components/promo-cards";
import { EmptyState, ExploreTabs } from "@/components/ui";
import { getCurrentUser, getRepo } from "@/lib/data";
import { byExpiry, isExpired, isExpiringSoon } from "@/lib/domain/coupons";
import { todayAR } from "@/lib/domain/dates";
import type { PromoUserState } from "@/lib/domain/types";

export const metadata = { title: "Cupones para vos" };

type SP = Promise<{ categoria?: string; comercio?: string; ver?: string; q?: string }>;
const VIEWS = [
  { key: "", label: "Todos" },
  { key: "vencen", label: "Vencen pronto" },
  { key: "codigo", label: "Con código" },
  { key: "guardados", label: "Guardados" },
  { key: "usados", label: "Usados" },
] as const;

export default async function CouponsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [repo, user] = await Promise.all([getRepo(), getCurrentUser()]);
  const today = todayAR();
  const [all, categories, states] = await Promise.all([
    repo.listPromotions({ kinds: ["cupon"], q: sp.q?.slice(0, 80) || undefined }),
    repo.listCategories(),
    user ? repo.getUserStates(user.id) : Promise.resolve(new Map<string, PromoUserState>()),
  ]);
  const vigentes = all.filter((c) => !isExpired(c, today));
  const usedIds = new Set([...states].filter(([, s]) => s.usedAt).map(([id]) => id));

  // Solo categorías y comercios que tienen cupones.
  const catSlugs = new Set(vigentes.map((c) => c.merchant.categorySlug).filter(Boolean));
  const cats = categories.filter((c) => catSlugs.has(c.slug));
  const merchants = [...new Map(vigentes.map((c) => [c.merchant.slug, c.merchant])).values()].sort((a, b) => a.name.localeCompare(b.name, "es"));

  let list = vigentes;
  if (sp.categoria) list = list.filter((c) => c.merchant.categorySlug === sp.categoria);
  if (sp.comercio) list = list.filter((c) => c.merchant.slug === sp.comercio);
  switch (sp.ver) {
    case "vencen":
      list = list.filter((c) => isExpiringSoon(c, today));
      break;
    case "codigo":
      list = list.filter((c) => c.coupon?.code);
      break;
    case "guardados":
      list = list.filter((c) => states.get(c.id)?.savedAt);
      break;
    case "usados":
      list = list.filter((c) => usedIds.has(c.id));
      break;
  }
  // Los usados quedan al final (salvo en la vista "Usados").
  list = list.sort(byExpiry).sort((a, b) => (sp.ver === "usados" ? 0 : Number(usedIds.has(a.id)) - Number(usedIds.has(b.id))));
  const soon = !sp.ver && !sp.categoria && !sp.comercio ? vigentes.filter((c) => isExpiringSoon(c, today) && !usedIds.has(c.id)).length : 0;

  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ categoria: sp.categoria, comercio: sp.comercio, ver: sp.ver, q: sp.q, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return `/cupones${s ? `?${s}` : ""}`;
  };

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+16px)]">
      <ExploreTabs current="cupones" />

      <section className="relative overflow-hidden rounded-[26px] bg-bosque p-5 pr-28 text-crema">
        <h1 className="text-[24px] leading-tight font-black tracking-tight text-lima">Cupones para vos</h1>
        <p className="mt-1 text-sm text-crema/85">Bienvenida, primera compra y promos para clientes nuevos.</p>
        {soon > 0 && (
          <Link href={link({ ver: "vencen" })} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-lima px-3 py-1.5 text-sm font-semibold text-bosque">
            <Icon name="clock" size={16} /> {soon === 1 ? "1 vence esta semana" : `${soon} vencen esta semana`}
          </Link>
        )}
        <Mascot pose="celular" width={104} eager className="absolute right-1 bottom-0" />
      </section>

      <form action="/cupones" className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2" role="search">
        {sp.ver && <input type="hidden" name="ver" value={sp.ver} />}
        <label className="relative">
          <span className="sr-only">Buscar cupones</span>
          <Icon name="search" size={19} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-tenue" />
          <input name="q" type="search" defaultValue={sp.q} placeholder="Buscar comercio" className="campo rounded-full pl-10" />
        </label>
        <label>
          <span className="sr-only">Comercio</span>
          <AutoSubmitSelect name="comercio" defaultValue={sp.comercio ?? ""} className="campo w-[9.5rem] rounded-full">
            <option value="">Comercios</option>
            {merchants.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
              </option>
            ))}
          </AutoSubmitSelect>
        </label>
        <noscript>
          <button className="btn-primario btn-chico col-span-2">Filtrar</button>
        </noscript>
      </form>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {VIEWS.map((v) => (
          <Chip key={v.key} href={link({ ver: v.key || undefined })} active={(sp.ver ?? "") === v.key}>
            {v.label}
          </Chip>
        ))}
      </div>
      {cats.length > 1 && (
        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {cats.map((c) => (
            <Chip key={c.slug} href={link({ categoria: sp.categoria === c.slug ? undefined : c.slug })} active={sp.categoria === c.slug} soft>
              {c.name}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {list.map((c) => (
          <CouponCard key={c.id} promo={c} today={today} saved={!!states.get(c.id)?.savedAt} used={usedIds.has(c.id)} />
        ))}
        {list.length === 0 && (
          <EmptyState
            title={sp.ver === "guardados" || sp.ver === "usados" ? (user ? "No hay cupones acá todavía" : "Ingresá para ver tus cupones") : "No hay cupones con esos filtros"}
            text="Probá con otra categoría o comercio. ¿Conocés un cupón que no está? Mandalo y lo verificamos."
            pose="celular"
            action={
              <Link href={user || !(sp.ver === "guardados" || sp.ver === "usados") ? "/sugerir" : "/ingresar?volver=/cupones"} className="btn-primario">
                {user || !(sp.ver === "guardados" || sp.ver === "usados") ? "Sugerí un cupón" : "Ingresar"}
              </Link>
            }
          />
        )}
      </div>
      <p className="mt-4 px-1 text-xs text-tenue">Publicamos solo cupones verificados en fuentes oficiales. Si uno no funciona, reportalo desde su detalle.</p>
    </div>
  );
}

function Chip({ href, active, soft, children }: { href: string; active: boolean; soft?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-semibold ${
        active ? (soft ? "border-verde bg-lima-suave text-verde-oscuro" : "border-bosque bg-bosque text-white") : "border-linea bg-superficie text-tinta-2"
      }`}
    >
      {children}
    </Link>
  );
}

import Link from "next/link";
import { Icon } from "@/components/icon";
import { PromoCard } from "@/components/promo-cards";
import { EmptyState, ExploreTabs } from "@/components/ui";
import { getCurrentUser, getRepo } from "@/lib/data";
import { availability } from "@/lib/domain/calc";
import { todayAR } from "@/lib/domain/dates";

export const metadata = { title: "Promos" };

type SP = Promise<{ q?: string; categoria?: string; mios?: string; hoy?: string }>;

export default async function PromosPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [repo, user] = await Promise.all([getRepo(), getCurrentUser()]);
  const today = todayAR();
  const q = (sp.q ?? "").slice(0, 80);
  const onlyMine = sp.mios === "1" && !!user?.paymentMethodIds.length;
  const onlyToday = sp.hoy === "1";
  const [categories, promos, states] = await Promise.all([
    repo.listCategories(),
    repo.listPromotions({
      kinds: ["reintegro", "descuento"],
      q: q || undefined,
      categorySlug: sp.categoria || undefined,
      paymentMethodIds: onlyMine ? user!.paymentMethodIds : undefined,
    }),
    user ? repo.getUserStates(user.id) : Promise.resolve(new Map()),
  ]);
  const visible = promos
    .filter((p) => {
      const s = availability(p, today).state;
      return s !== "vencida" && (!onlyToday || s === "activa");
    })
    .sort((a, b) => (b.discountValue ?? 0) - (a.discountValue ?? 0));

  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { q: q || undefined, categoria: sp.categoria, mios: sp.mios, hoy: sp.hoy, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return `/promos${s ? `?${s}` : ""}`;
  };

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+16px)]">
      <ExploreTabs current="promos" />
      <form action="/promos" role="search" className="relative">
        {sp.categoria && <input type="hidden" name="categoria" value={sp.categoria} />}
        <Icon name="search" size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-tenue" />
        <label htmlFor="q" className="sr-only">
          Buscar promos
        </label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Comercio, banco o billetera" className="campo rounded-full pl-11" />
      </form>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <FilterChip href={link({ categoria: undefined })} active={!sp.categoria}>
          Todas
        </FilterChip>
        {categories.map((c) => (
          <FilterChip key={c.slug} href={link({ categoria: sp.categoria === c.slug ? undefined : c.slug })} active={sp.categoria === c.slug}>
            {c.name}
          </FilterChip>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <FilterChip href={link({ hoy: onlyToday ? undefined : "1" })} active={onlyToday} icon="calendar">
          Aplican hoy
        </FilterChip>
        {user?.paymentMethodIds.length ? (
          <FilterChip href={link({ mios: onlyMine ? undefined : "1" })} active={onlyMine} icon="wallet">
            Mis medios de pago
          </FilterChip>
        ) : (
          <FilterChip href="/bienvenida?volver=/promos" active={false} icon="wallet">
            Elegir mis medios de pago
          </FilterChip>
        )}
      </div>

      <p className="mt-4 mb-2 text-sm text-tinta-2" aria-live="polite">
        {visible.length === 1 ? "1 promo" : `${visible.length} promos`}
        {q ? ` para “${q}”` : ""}
      </p>
      {visible.length ? (
        <div className="grid grid-cols-2 gap-3">
          {visible.map((p) => (
            <PromoCard key={p.id} promo={p} today={today} saved={!!states.get(p.id)?.savedAt} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No encontramos promos"
          text="Probá con otra búsqueda o sacá algún filtro. Si conocés una promo que falta, mandala."
          pose="camina"
          action={
            <Link href="/sugerir" className="btn-primario">
              <Icon name="plus" size={18} /> Sugerí una promo
            </Link>
          }
        />
      )}
    </div>
  );
}

function FilterChip({ href, active, children, icon }: { href: string; active: boolean; children: React.ReactNode; icon?: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold ${active ? "border-bosque bg-bosque text-white" : "border-linea bg-superficie text-tinta-2"}`}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </Link>
  );
}

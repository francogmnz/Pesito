import Link from "next/link";
import { Icon } from "@/components/icon";
import { PromoCard } from "@/components/promo-cards";
import { EmptyState, ExploreTabs } from "@/components/ui";
import { getCurrentUser, getRepo } from "@/lib/data";
import { availability } from "@/lib/domain/calc";
import { todayAR } from "@/lib/domain/dates";

export const metadata = { title: "Promos" };

type SP = Promise<{ q?: string; categoria?: string; mios?: string; hoy?: string; comercio?: string; medio?: string }>;

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
  const current = promos.filter((p) => {
    const s = availability(p, today).state;
    return s !== "vencida" && (!onlyToday || s === "activa");
  });
  // Comercios y medios de pago que tienen promos con los filtros de arriba, del que más tiene al que menos.
  const tally = <T extends { slug: string; name: string }>(items: T[]) =>
    [...items.reduce((m, x) => m.set(x.slug, { slug: x.slug, name: x.name, n: (m.get(x.slug)?.n ?? 0) + 1 }), new Map<string, { slug: string; name: string; n: number }>()).values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const merchantSlug = (sp.comercio ?? "").slice(0, 80);
  const methodSlug = (sp.medio ?? "").slice(0, 80);
  const byMethod = (p: (typeof current)[number]) => !methodSlug || p.paymentMethods.some((pm) => pm.slug === methodSlug);
  const byMerchant = (p: (typeof current)[number]) => !merchantSlug || p.merchant.slug === merchantSlug;
  const merchants = tally(current.filter(byMethod).map((p) => p.merchant)).slice(0, 40);
  const methods = tally(current.filter(byMerchant).flatMap((p) => p.paymentMethods));
  const visible = current.filter((p) => byMethod(p) && byMerchant(p)).sort((a, b) => (b.discountValue ?? 0) - (a.discountValue ?? 0));

  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { q: q || undefined, categoria: sp.categoria, mios: sp.mios, hoy: sp.hoy, comercio: merchantSlug || undefined, medio: methodSlug || undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return `/promos${s ? `?${s}` : ""}`;
  };

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+16px)]">
      <ExploreTabs current="promos" />
      <form action="/promos" role="search" className="relative">
        {sp.categoria && <input type="hidden" name="categoria" value={sp.categoria} />}
        {methodSlug && <input type="hidden" name="medio" value={methodSlug} />}
        <Icon name="search" size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-tenue" />
        <label htmlFor="q" className="sr-only">
          Buscar promos
        </label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Comercio, banco o billetera" className="campo rounded-full pl-11" />
      </form>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <FilterChip href={link({ categoria: undefined, comercio: undefined })} active={!sp.categoria}>
          Todas
        </FilterChip>
        {categories.map((c) => (
          <FilterChip key={c.slug} href={link({ categoria: sp.categoria === c.slug ? undefined : c.slug, comercio: undefined })} active={sp.categoria === c.slug}>
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

      {(sp.categoria || q || merchantSlug) && merchants.length > 1 && (
        <FilterRow label="Comercio">
          <FilterChip href={link({ comercio: undefined })} active={!merchantSlug} small>
            Todos
          </FilterChip>
          {merchants.map((m) => (
            <FilterChip key={m.slug} href={link({ comercio: merchantSlug === m.slug ? undefined : m.slug })} active={merchantSlug === m.slug} small>
              {m.name} <span className="opacity-60">{m.n}</span>
            </FilterChip>
          ))}
        </FilterRow>
      )}
      {methods.length > 1 && (
        <FilterRow label="Banco o billetera">
          <FilterChip href={link({ medio: undefined })} active={!methodSlug} small>
            Todos
          </FilterChip>
          {methods.map((m) => (
            <FilterChip key={m.slug} href={link({ medio: methodSlug === m.slug ? undefined : m.slug })} active={methodSlug === m.slug} small>
              {m.name} <span className="opacity-60">{m.n}</span>
            </FilterChip>
          ))}
        </FilterRow>
      )}

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
          pose="buscando"
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

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <span className="text-xs font-semibold text-tinta-2">{label}</span>
      <div className="-mx-4 mt-1 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">{children}</div>
    </div>
  );
}

function FilterChip({ href, active, children, icon, small = false }: { href: string; active: boolean; children: React.ReactNode; icon?: string; small?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold ${small ? "px-3 py-1.5 text-[13px]" : "px-3.5 py-2 text-sm"} ${active ? "border-bosque bg-bosque text-white" : "border-linea bg-superficie text-tinta-2"}`}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </Link>
  );
}

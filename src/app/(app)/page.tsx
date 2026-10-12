import Link from "next/link";
import { Logo, Mascot } from "@/components/brand";
import { Icon } from "@/components/icon";
import { CouponCard, PromoCard } from "@/components/promo-cards";
import { FinePrint, SectionTitle, SupportCard } from "@/components/ui";
import { getCurrentUser, getRepo } from "@/lib/data";
import { daysUntilBirthday } from "@/lib/domain/birthday";
import { availability } from "@/lib/domain/calc";
import { byExpiry, isExpired } from "@/lib/domain/coupons";
import { daysBetween, todayAR } from "@/lib/domain/dates";
import { headline, headlineSuffix } from "@/lib/domain/labels";

const HOME_CATEGORIES = [
  { slug: "", name: "Todas", icon: "bag" },
  { slug: "supermercados", name: "Súper", icon: "cart" },
  { slug: "gastronomia", name: "Gastronomía", icon: "fork" },
  { slug: "farmacias", name: "Farmacias", icon: "pill" },
  { slug: "combustible", name: "Combustible", icon: "fuel" },
  { slug: "delivery", name: "Delivery", icon: "bike" },
];

const TOOLS = [
  { href: "/conviene", label: "Comparar precios", icon: "store" },
  { href: "/calculadora", label: "Calculadora de reintegro", icon: "calculator" },
  { href: "/comparador", label: "Comparar medios de pago", icon: "compare" },
] as const;

export default async function HomePage() {
  const [repo, user] = await Promise.all([getRepo(), getCurrentUser()]);
  const today = todayAR();
  const [promos, coupons, states] = await Promise.all([
    repo.listPromotions({ kinds: ["reintegro", "descuento"] }),
    repo.listPromotions({ kinds: ["cupon"] }),
    user ? repo.getUserStates(user.id) : Promise.resolve(new Map()),
  ]);

  const mine = new Set(user?.paymentMethodIds ?? []);
  const featured = promos
    .filter((p) => availability(p, today).state !== "vencida")
    .sort((a, b) => {
      const am = a.paymentMethods.some((pm) => mine.has(pm.id)) ? 1 : 0;
      const bm = b.paymentMethods.some((pm) => mine.has(pm.id)) ? 1 : 0;
      if (am !== bm) return bm - am;
      const aa = availability(a, today).state === "activa" ? 1 : 0;
      const ba = availability(b, today).state === "activa" ? 1 : 0;
      if (aa !== ba) return ba - aa;
      return (b.discountValue ?? 0) - (a.discountValue ?? 0);
    })
    .slice(0, 4);
  const couponList = coupons.filter((c) => !isExpired(c, today) && !states.get(c.id)?.usedAt).sort(byExpiry).slice(0, 3);
  // Lo que vence hoy o en los próximos tres días, de lo más urgente a lo menos; a igual urgencia, el mayor beneficio.
  const flash = [...promos, ...coupons]
    .filter((p) => p.validUntil && !states.get(p.id)?.usedAt && availability(p, today).state !== "vencida")
    .map((p) => ({ p, left: daysBetween(today, p.validUntil!) }))
    .filter((x) => x.left >= 0 && x.left <= 3)
    .sort((a, b) => a.left - b.left || (b.p.discountValue ?? 0) - (a.p.discountValue ?? 0))
    .slice(0, 10);
  const bdayIn = user?.birthdayDay && user.birthdayMonth ? daysUntilBirthday(user.birthdayDay, user.birthdayMonth, today) : null;

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+10px)]">
      <header className="flex items-center justify-between py-2">
        <Logo size="sm" />
        {user ? (
          <Link href="/perfil" className="grid size-10 place-items-center rounded-full bg-lima font-bold" aria-label="Mi perfil">
            {user.name.slice(0, 1).toUpperCase()}
          </Link>
        ) : (
          <Link href="/ingresar" className="btn-secundario btn-chico">
            Ingresar
          </Link>
        )}
      </header>

      <form action="/promos" role="search" className="relative mt-3">
        <Icon name="search" size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-tenue" />
        <label htmlFor="q" className="sr-only">
          Buscar promos
        </label>
        <input id="q" name="q" type="search" placeholder="Buscá por comercio, banco o categoría" className="campo rounded-full py-3.5 pl-11" />
      </form>

      <nav aria-label="Herramientas" className="mt-4 grid grid-cols-3 gap-2.5">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="tarjeta flex flex-col items-center gap-1.5 px-2 py-3 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-lima-suave text-verde-oscuro">
              <Icon name={t.icon} size={20} />
            </span>
            <b className="text-[12.5px] leading-tight">{t.label}</b>
          </Link>
        ))}
      </nav>

      {flash.length > 0 && (
        <section className="mt-5" aria-label="Se terminan pronto">
          <h2 className="flex items-center gap-1.5 text-[17px] font-bold">
            <Icon name="bolt" size={18} className="text-alerta" /> Se terminan pronto
          </h2>
          <div className="-mx-4 mt-2 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {flash.map(({ p, left }) => (
              <Link key={p.id} href={p.kind === "cupon" ? `/cupones/${p.id}` : `/promos/${p.id}`} className="tarjeta flex w-[150px] shrink-0 flex-col gap-1 p-3">
                <span className="chip w-fit bg-alerta-suave text-alerta">{left === 0 ? "Termina hoy" : left === 1 ? "Termina mañana" : `Quedan ${left} días`}</span>
                <b className="numero text-[22px] leading-none">{headline(p)}</b>
                <span className="text-xs font-semibold text-tinta-2">{p.kind === "cupon" ? "cupón" : headlineSuffix(p)}</span>
                <span className="line-clamp-2 text-[13px] leading-tight font-semibold">{p.merchant.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <nav aria-label="Categorías" className="-mx-4 mt-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {HOME_CATEGORIES.map((c) => (
          <Link key={c.slug} href={c.slug ? `/promos?categoria=${c.slug}` : "/promos"} className="flex w-[74px] shrink-0 flex-col items-center gap-1.5 text-center">
            <span className={`grid size-14 place-items-center rounded-2xl ${c.slug ? "bg-superficie text-verde-oscuro shadow-[var(--shadow-tarjeta)]" : "bg-lima text-bosque"}`}>
              <Icon name={c.icon} size={24} />
            </span>
            <span className="text-[11.5px] font-semibold text-tinta-2">{c.name}</span>
          </Link>
        ))}
      </nav>

      {user && user.paymentMethodIds.length === 0 && (
        <Link href="/bienvenida" className="tarjeta mt-4 flex items-center gap-3 p-4">
          <span className="grid size-11 place-items-center rounded-full bg-lima-suave text-verde-oscuro">
            <Icon name="wallet" />
          </span>
          <span className="flex-1 text-sm">
            <b className="block text-[15px]">Elegí tus bancos y billeteras</b>
            Así te mostramos primero las promos que podés usar.
          </span>
          <Icon name="chevronRight" className="text-tenue" />
        </Link>
      )}

      <section className="relative mt-4 flex items-center gap-3 overflow-hidden rounded-2xl bg-lima py-3 pr-24 pl-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] leading-tight font-bold">¿Viste una promo que no está?</h2>
          <Link href="/sugerir" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-bosque underline underline-offset-2">
            <Icon name="plus" size={16} strokeWidth={2.4} /> Sugerila y la sumamos
          </Link>
        </div>
        <Mascot pose="saludo" width={76} eager className="absolute -right-1 bottom-0" />
      </section>

      <section className="mt-5">
        <SectionTitle title={mine.size ? "Para tus medios de pago" : "Promos destacadas"} href="/promos" />
        {featured.length ? (
          <div className="grid grid-cols-2 gap-3">
            {featured.map((p) => (
              <PromoCard key={p.id} promo={p} today={today} saved={!!states.get(p.id)?.savedAt} />
            ))}
          </div>
        ) : (
          <p className="tarjeta p-4 text-sm text-tinta-2">Todavía no hay promos publicadas.</p>
        )}
      </section>

      <section className="mt-7">
        <SectionTitle title="Cupones para vos" href="/cupones" linkLabel="Ver todos" />
        <div className="grid gap-3">
          {couponList.map((c) => (
            <CouponCard key={c.id} promo={c} today={today} saved={!!states.get(c.id)?.savedAt} />
          ))}
          {couponList.length === 0 && <p className="tarjeta p-4 text-sm text-tinta-2">No hay cupones vigentes por ahora.</p>}
        </div>
      </section>

      <Link href="/cumple" className="tarjeta mt-7 flex items-center gap-4 overflow-hidden p-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-bosque text-lima">
          <Icon name="cake" size={28} />
        </span>
        <span className="flex-1">
          <b className="block text-[16px]">Tu cumple con Pesito 🎂</b>
          <span className="text-sm text-tinta-2">
            {bdayIn === 0 ? "¡Hoy es tu cumpleaños! Mirá tus beneficios." : bdayIn != null ? `Faltan ${bdayIn} días. Mirá qué te regalan.` : "Regalos y descuentos para tu cumpleaños."}
          </span>
        </span>
        <Icon name="chevronRight" className="text-tenue" />
      </Link>

      <div className="mt-4">
        <SupportCard compact />
      </div>

      <FinePrint>
        Pesito reúne promociones, cupones y precios publicados por bancos, billeteras y comercios en sus sitios oficiales. Pueden cambiar o terminar sin aviso: antes de comprar, verificá las condiciones en la fuente, que está enlazada en cada promo. Los montos de reintegro y ahorro son estimaciones. Pesito no vende productos ni representa a las marcas mencionadas, que pertenecen a sus respectivos dueños.
      </FinePrint>
    </div>
  );
}

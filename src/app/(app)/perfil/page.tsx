import Link from "next/link";
import { Mascot, PaymentDot } from "@/components/brand";
import { Icon } from "@/components/icon";
import { EmptyState, PageHeader, SupportCard } from "@/components/ui";
import { signOut } from "@/app/actions";
import { getCurrentUser, getRepo } from "@/lib/data";
import { MONTHS } from "@/lib/domain/dates";
import { STATUS_LABEL } from "@/lib/domain/moderation";
import type { SubmissionStatus } from "@/lib/domain/types";
import { NameForm } from "./name-form";

export const metadata = { title: "Mi perfil" };

const STATUS_STYLE: Record<SubmissionStatus, string> = {
  pendiente: "bg-crema text-tinta-2",
  en_revision: "bg-alerta-suave text-alerta",
  aprobada: "bg-lima-suave text-verde-oscuro",
  rechazada: "bg-peligro-suave text-peligro",
};

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div>
        <PageHeader title="Mi perfil" />
        <EmptyState
          title="Creá tu cuenta en Pesito"
          text="Guardá promos, elegí tus medios de pago, recibí beneficios de cumpleaños y sugerí promos."
          action={
            <Link href="/ingresar?volver=/perfil" className="btn-primario">
              Ingresar
            </Link>
          }
        />
      </div>
    );
  }
  const repo = await getRepo();
  const [states, methods, suggestions] = await Promise.all([repo.getUserStates(user.id), repo.listPaymentMethods(), repo.listSubmissions({ origin: "usuario", submittedBy: user.id })]);
  const saved = [...states.values()].filter((s) => s.savedAt).length;
  const used = [...states.values()].filter((s) => s.usedAt).length;
  const mine = methods.filter((m) => user.paymentMethodIds.includes(m.id));

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+16px)]">
      <header className="flex items-center gap-3">
        <span className="grid size-14 place-items-center rounded-full bg-lima text-xl font-black">{user.name.slice(0, 1).toUpperCase()}</span>
        <div className="flex-1">
          <h1 className="text-[22px] font-black tracking-tight">Hola, {user.name}</h1>
          <p className="text-sm text-tinta-2">Todas tus promos en un solo lugar.</p>
        </div>
        {user.role === "admin" && (
          <Link href="/admin" className="btn-secundario btn-chico">
            <Icon name="shield" size={16} /> Panel
          </Link>
        )}
      </header>

      <section className="mt-5 grid grid-cols-3 gap-2.5" aria-label="Resumen">
        {[
          { n: saved, l: "Guardados", href: "/guardados" },
          { n: used, l: "Cupones usados", href: "/guardados?ver=usados" },
          { n: suggestions.length, l: "Sugerencias", href: "#sugerencias" },
        ].map((t) => (
          <Link key={t.l} href={t.href} className="tarjeta p-3.5">
            <p className="numero text-2xl font-black">{t.n}</p>
            <p className="text-xs font-semibold text-tinta-2">{t.l}</p>
          </Link>
        ))}
      </section>

      <section className="tarjeta mt-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Mis medios de pago</h2>
          <Link href="/bienvenida?volver=/perfil" className="text-sm font-semibold text-verde">
            Editar
          </Link>
        </div>
        {mine.length ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {mine.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-full bg-crema py-1 pr-3 pl-1 text-sm font-semibold">
                <PaymentDot pm={m} size={24} /> {m.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-tinta-2">Todavía no elegiste. Sumalos para ver primero las promos que podés usar.</p>
        )}
      </section>

      <Link href="/cumple" className="tarjeta mt-3 flex items-center gap-3 p-4">
        <Icon name="cake" className="text-verde" />
        <span className="flex-1">
          <b className="block">Mi cumpleaños</b>
          <span className="text-sm text-tinta-2">
            {user.birthdayDay && user.birthdayMonth ? `${user.birthdayDay} de ${MONTHS[user.birthdayMonth - 1]}` : "Sin cargar · es opcional"}
          </span>
        </span>
        <Icon name="chevronRight" className="text-tenue" />
      </Link>

      <section id="sugerencias" className="mt-6">
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="text-[17px] font-bold">Mis sugerencias</h2>
          <Link href="/sugerir" className="text-sm font-semibold text-verde">
            + Sugerí una promo
          </Link>
        </div>
        {suggestions.length ? (
          <ul className="tarjeta divide-y divide-linea">
            {suggestions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.payload.title}</p>
                  <p className="text-xs text-tinta-2">{new Date(s.createdAt).toLocaleDateString("es-AR", { day: "numeric", month: "long" })}</p>
                  {s.status === "rechazada" && s.reviewNote && <p className="mt-1 text-xs text-tinta-2">Motivo: {s.reviewNote}</p>}
                </div>
                <span className={`chip ${STATUS_STYLE[s.status]}`}>{s.publishedPromotionId ? "Publicada" : STATUS_LABEL[s.status]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="tarjeta flex items-center gap-3 p-4">
            <Mascot pose="celular" width={64} />
            <p className="text-sm text-tinta-2">¿Encontraste una promo que no está en Pesito? Mandala y la revisamos.</p>
          </div>
        )}
      </section>

      <section className="tarjeta mt-6 p-4">
        <h2 className="mb-2 font-bold">Tu nombre</h2>
        <NameForm current={user.name} />
      </section>

      <div className="mt-6">
        <SupportCard />
      </div>

      <form action={signOut} className="mt-4">
        <button className="btn-secundario w-full">
          <Icon name="logout" size={18} /> Salir
        </button>
      </form>
    </div>
  );
}

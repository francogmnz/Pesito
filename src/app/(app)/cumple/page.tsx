import Link from "next/link";
import { MerchantAvatar, Mascot } from "@/components/brand";
import { Icon } from "@/components/icon";
import { EmptyState, ExploreTabs, SampleBadge } from "@/components/ui";
import { getCurrentUser, getRepo } from "@/lib/data";
import { birthdayStatus, daysUntilBirthday, isValidBirthday, windowLabel, type BirthdayStatus } from "@/lib/domain/birthday";
import { formatDate, MONTHS, todayAR } from "@/lib/domain/dates";
import { BENEFIT_LABEL, headline, REQUIREMENT_LABEL } from "@/lib/domain/labels";
import type { Promotion } from "@/lib/domain/types";
import { SaveBirthdayForm, TryBirthdayForm } from "./birthday-form";

export const metadata = { title: "Tu cumple con Pesito" };

const BENEFITS = [
  { key: "", label: "Todos" },
  { key: "regalo", label: "Regalos" },
  { key: "descuento", label: "Descuentos" },
  { key: "cupon", label: "Cupones" },
  { key: "experiencia", label: "Experiencias" },
] as const;

type SP = Promise<{ dia?: string; mes?: string; day?: string; month?: string; tipo?: string; editar?: string }>;

export default async function BirthdayPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [repo, user] = await Promise.all([getRepo(), getCurrentUser()]);
  const today = todayAR();

  // Cumpleaños: el guardado en el perfil, o el que consultó alguien sin cuenta (solo en la URL).
  const qDay = Number(sp.dia ?? sp.day);
  const qMonth = Number(sp.mes ?? sp.month);
  const fromQuery = isValidBirthday(qDay, qMonth) ? { day: qDay, month: qMonth } : null;
  const saved = user?.birthdayDay && user.birthdayMonth ? { day: user.birthdayDay, month: user.birthdayMonth } : null;
  const bday = saved ?? fromQuery;

  const all = (await repo.listPromotions({ kinds: ["cumple"] })).filter((p) => p.birthday);
  const withStatus = all
    .filter((p) => !sp.tipo || p.birthday!.benefit === sp.tipo)
    .map((p) => ({ promo: p, status: bday ? birthdayStatus(p.birthday!, bday.day, bday.month, today) : null }))
    .sort((a, b) => {
      if (!a.status || !b.status) return a.promo.merchant.name.localeCompare(b.promo.merchant.name, "es");
      if (a.status.state !== b.status.state) return a.status.state === "activo" ? -1 : 1;
      return (a.status.state === "proximo" ? a.status.inDays : 0) - (b.status.state === "proximo" ? b.status.inDays : 0);
    });
  const activeNow = withStatus.filter((x) => x.status?.state === "activo").length;
  const daysLeft = bday ? daysUntilBirthday(bday.day, bday.month, today) : null;
  const editing = sp.editar === "1" || (!!user && !saved);

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+16px)]">
      <ExploreTabs current="cumple" />

      <section className="relative overflow-hidden rounded-[26px] bg-lima p-5 pr-28">
        <h1 className="text-[24px] leading-tight font-black tracking-tight">Tu cumple con Pesito 🎂</h1>
        {bday ? (
          <p className="mt-1 text-[15px] font-semibold">
            {daysLeft === 0 ? "¡Feliz cumpleaños! Hoy es tu día." : daysLeft === 1 ? "¡Mañana es tu cumple!" : `Faltan ${daysLeft} días para tu cumple.`}
            <span className="block text-sm font-medium text-bosque/75">
              {activeNow > 0 ? `Tenés ${activeNow} ${activeNow === 1 ? "beneficio disponible" : "beneficios disponibles"} ahora.` : "Te mostramos cuándo se activa cada beneficio."}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm font-medium text-bosque/80">Regalos, descuentos y cupones de comercios argentinos para tu cumpleaños.</p>
        )}
        <Mascot pose="cumple" width={118} eager className="absolute right-2 bottom-0" />
      </section>

      <section className="tarjeta mt-4 p-4">
        {user ? (
          saved && !editing ? (
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-lima-suave text-verde-oscuro">
                <Icon name="cake" />
              </span>
              <p className="flex-1 text-sm">
                Tu cumpleaños: <b className="text-[15px]">{`${saved.day} de ${MONTHS[saved.month - 1]}`}</b>
              </p>
              <Link href="/cumple?editar=1" className="text-sm font-semibold text-verde">
                Cambiar
              </Link>
            </div>
          ) : (
            <>
              <h2 className="font-bold">¿Cuándo es tu cumpleaños?</h2>
              <p className="mb-3 text-sm text-tinta-2">Es opcional y no te pedimos el año. Lo usamos solo para mostrarte tus beneficios.</p>
              <SaveBirthdayForm day={saved?.day ?? null} month={saved?.month ?? null} />
            </>
          )
        ) : (
          <>
            <h2 className="font-bold">Mirá qué beneficios te tocan</h2>
            <p className="mb-3 text-sm text-tinta-2">Elegí día y mes (sin año). No guardamos nada: para recordarlo, ingresá a tu cuenta.</p>
            <TryBirthdayForm day={fromQuery?.day} month={fromQuery?.month} />
            <Link href="/ingresar?volver=/cumple" className="mt-3 block text-center text-sm font-semibold text-verde">
              Ingresar para guardar mi cumpleaños
            </Link>
          </>
        )}
      </section>

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {BENEFITS.map((b) => {
          const params = new URLSearchParams();
          if (fromQuery && !saved) {
            params.set("dia", String(fromQuery.day));
            params.set("mes", String(fromQuery.month));
          }
          if (b.key) params.set("tipo", b.key);
          const active = (sp.tipo ?? "") === b.key;
          return (
            <Link
              key={b.key}
              href={`/cumple${params.size ? `?${params}` : ""}`}
              aria-current={active ? "true" : undefined}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-semibold ${active ? "border-bosque bg-bosque text-white" : "border-linea bg-superficie text-tinta-2"}`}
            >
              {b.label}
            </Link>
          );
        })}
      </div>

      <ul className="mt-4 grid gap-3">
        {withStatus.map(({ promo, status }) => (
          <li key={promo.id}>
            <BirthdayCard promo={promo} status={status} today={today} />
          </li>
        ))}
      </ul>
      {withStatus.length === 0 && (
        <EmptyState title="No hay beneficios de este tipo" text="Probá con otro filtro o mandanos un beneficio de cumpleaños que conozcas." pose="corazon" />
      )}
      <p className="mt-4 px-1 text-xs text-tenue">Cada comercio define sus requisitos. Revisalos antes de ir y llevá tu DNI cuando lo pidan.</p>
    </div>
  );
}

function BirthdayCard({ promo, status, today }: { promo: Promotion; status: BirthdayStatus | null; today: string }) {
  const b = promo.birthday!;
  return (
    <Link href={`/promos/${promo.id}`} className={`tarjeta block p-4 ${status?.state === "activo" ? "ring-2 ring-verde" : ""}`}>
      <div className="flex items-start gap-3">
        <MerchantAvatar merchant={promo.merchant} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-tinta-2">{promo.merchant.name}</p>
          <p className="leading-snug font-bold">{promo.title}</p>
        </div>
        <span className="numero shrink-0 rounded-xl bg-lima px-2.5 py-1 text-sm font-black">{b.benefit === "regalo" ? "🎁" : headline(promo)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="chip bg-bosque text-lima">
          <Icon name="cake" size={13} /> {windowLabel(b)}
        </span>
        <span className="chip bg-lima-suave text-verde-oscuro">{BENEFIT_LABEL[b.benefit]}</span>
        {promo.isSample && <SampleBadge />}
      </div>
      {promo.requirements.length > 0 && (
        <ul className="mt-2.5 grid gap-1 text-[13px] text-tinta-2">
          {promo.requirements.map((r) => (
            <li key={r} className="flex items-center gap-1.5">
              <Icon name="checkCircle" size={14} className="text-verde" /> {r === "programa_fidelizacion" && b.loyaltyProgram ? `Ser parte de ${b.loyaltyProgram}` : REQUIREMENT_LABEL[r]}
            </li>
          ))}
        </ul>
      )}
      {status && (
        <p className={`mt-3 flex items-center gap-1.5 text-sm font-semibold ${status.state === "activo" ? "text-verde-oscuro" : "text-tinta-2"}`}>
          <Icon name={status.state === "activo" ? "checkCircle" : "calendar"} size={16} />
          {status.state === "activo"
            ? status.label
            : `${status.label} · ${status.start === status.end ? formatDate(status.start, today) : `del ${formatDate(status.start, today)} al ${formatDate(status.end, today)}`}`}
        </p>
      )}
    </Link>
  );
}

import Link from "next/link";
import { Mascot, type Pose } from "./brand";
import { Icon } from "./icon";

export function PageHeader({ title, back, action, subtitle }: { title: string; back?: string; action?: React.ReactNode; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-30 -mx-4 mb-4 bg-crema/95 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 backdrop-blur">
      <div className="flex items-center gap-2">
        {back && (
          <Link href={back} className="-ml-2 grid size-10 place-items-center rounded-full hover:bg-superficie" aria-label="Volver">
            <Icon name="chevronLeft" />
          </Link>
        )}
        <h1 className="min-w-0 flex-1 truncate text-[19px] font-bold tracking-tight">{title}</h1>
        {action}
      </div>
      {subtitle && <p className="mt-1 text-sm text-tinta-2">{subtitle}</p>}
    </header>
  );
}

export function ExploreTabs({ current }: { current: "promos" | "cupones" | "cumple" }) {
  const tabs = [
    { key: "promos", href: "/promos", label: "Promos" },
    { key: "cupones", href: "/cupones", label: "Cupones" },
    { key: "cumple", href: "/cumple", label: "Cumpleaños" },
  ] as const;
  return (
    <nav aria-label="Secciones" className="mb-4 grid grid-cols-3 rounded-full bg-superficie p-1 shadow-[var(--shadow-tarjeta)]">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={`rounded-full py-2 text-center text-sm font-semibold transition ${t.key === current ? "bg-bosque text-white" : "text-tinta-2 hover:text-tinta"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function SectionTitle({ title, href, linkLabel = "Ver todas" }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between">
      <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>
      {href && (
        <Link href={href} className="inline-flex items-center gap-0.5 text-sm font-semibold text-verde">
          {linkLabel}
          <Icon name="chevronRight" size={16} />
        </Link>
      )}
    </div>
  );
}

export function EmptyState({ title, text, pose = "saludo", action }: { title: string; text: string; pose?: Pose; action?: React.ReactNode }) {
  return (
    <div className="tarjeta flex flex-col items-center px-6 py-8 text-center">
      <Mascot pose={pose} width={110} />
      <h2 className="mt-3 text-lg font-bold">{title}</h2>
      <p className="mt-1 max-w-xs text-sm text-tinta-2">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "alerta" | "ok"; children: React.ReactNode }) {
  const styles = {
    info: "bg-superficie text-tinta-2",
    alerta: "bg-alerta-suave text-alerta",
    ok: "bg-lima-suave text-verde-oscuro",
  }[tone];
  return (
    <div className={`flex gap-2.5 rounded-2xl p-3.5 text-sm ${styles}`}>
      <Icon name={tone === "ok" ? "checkCircle" : tone === "alerta" ? "alert" : "info"} size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Letra chica al pie de una pantalla: de dónde salen los datos y qué no garantiza Pesito. */
export function FinePrint({ children }: { children: React.ReactNode }) {
  return <p className="mt-6 text-[11px] leading-snug text-tenue">{children}</p>;
}

export function SampleBadge() {
  return (
    <span className="chip bg-alerta-suave text-alerta" title="Dato de ejemplo del modo demo: no es una promo real">
      Ejemplo
    </span>
  );
}

export function DetailRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <Icon name={icon} size={19} className="mt-0.5 shrink-0 text-verde" />
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(84px,38%)_1fr] gap-2 text-sm">
        <span className="text-tinta-2">{label}</span>
        <span className="font-semibold break-words">{children}</span>
      </div>
    </div>
  );
}

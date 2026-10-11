"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";

const ITEMS = [
  { href: "/", label: "Inicio", icon: "home", match: (p: string) => p === "/" },
  { href: "/promos", label: "Explorar", icon: "explore", match: (p: string) => /^\/(promos|cupones|cumple)/.test(p) },
  null, // botón central
  { href: "/guardados", label: "Guardados", icon: "heart", match: (p: string) => p.startsWith("/guardados") },
  { href: "/perfil", label: "Perfil", icon: "user", match: (p: string) => p.startsWith("/perfil") || p.startsWith("/bienvenida") },
] as const;

const QUICK = [
  { href: "/sugerir", label: "Sugerí una promo", hint: "Mandanos una promo que encontraste", icon: "plus", primary: true },
  { href: "/calculadora", label: "Calculadora de reintegro", hint: "Cuánto te devuelven y cuánto pagás", icon: "calculator" },
  { href: "/comparador", label: "Comparar medios de pago", hint: "Qué tarjeta o billetera conviene", icon: "compare" },
  { href: "/cumple", label: "Tu cumple con Pesito", hint: "Beneficios para tu cumpleaños", icon: "cake" },
] as const;

/**
 * Barra inferior con 4 destinos + un botón central de acciones rápidas.
 * Promos, cupones y cumpleaños viven juntos en "Explorar"; las herramientas, en el botón central.
 */
export function BottomNav() {
  const pathname = usePathname();
  // Se guarda en qué pantalla se abrió: al navegar, el menú queda cerrado solo.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean | ((prev: boolean) => boolean)) => setOpenOn((typeof v === "function" ? v(open) : v) ? pathname : null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    sheetRef.current?.querySelector<HTMLElement>("a")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-bosque/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden />
      )}
      <div
        ref={sheetRef}
        id="acciones-rapidas"
        role="dialog"
        aria-modal="true"
        aria-label="Acciones rápidas"
        hidden={!open}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-xl rounded-t-[28px] bg-crema px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+96px)] shadow-2xl"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-linea" />
        <ul className="grid gap-2">
          {QUICK.map((q) => (
            <li key={q.href}>
              <Link
                href={q.href}
                className={`flex items-center gap-3 rounded-2xl p-3.5 ${"primary" in q && q.primary ? "bg-lima" : "bg-superficie"}`}
              >
                <span className={`grid size-11 place-items-center rounded-full ${"primary" in q && q.primary ? "bg-bosque text-lima" : "bg-lima-suave text-verde-oscuro"}`}>
                  <Icon name={q.icon} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{q.label}</span>
                  <span className="block text-sm text-tinta-2">{q.hint}</span>
                </span>
                <Icon name="chevronRight" size={18} className="text-tenue" />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-linea bg-superficie/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto grid max-w-xl grid-cols-5 items-end px-2">
          {ITEMS.map((it, i) =>
            it ? (
              <li key={it.href}>
                <Link
                  href={it.href}
                  aria-current={it.match(pathname) ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${it.match(pathname) ? "text-verde" : "text-tenue"}`}
                >
                  <Icon name={it.icon} size={23} strokeWidth={it.match(pathname) ? 2.3 : 1.9} />
                  {it.label}
                </Link>
              </li>
            ) : (
              <li key={`centro-${i}`} className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  aria-expanded={open}
                  aria-controls="acciones-rapidas"
                  aria-label={open ? "Cerrar acciones rápidas" : "Abrir acciones rápidas: sugerir promo, calculadora y comparador"}
                  className="-mt-5 mb-2 grid size-14 place-items-center rounded-full bg-bosque text-lima shadow-[0_8px_20px_-6px_rgb(25_39_31/0.55)] ring-4 ring-crema transition active:scale-95"
                >
                  <Icon name={open ? "x" : "plus"} size={26} strokeWidth={2.4} />
                </button>
              </li>
            ),
          )}
        </ul>
      </nav>
    </>
  );
}

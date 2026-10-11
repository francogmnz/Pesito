"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ pending, reports }: { pending: number; reports: number }) {
  const path = usePathname();
  const items = [
    { href: "/admin", label: "Resumen", active: path === "/admin" },
    { href: "/admin/revision", label: "Revisión", count: pending, active: path.startsWith("/admin/revision") },
    { href: "/admin/reportes", label: "Reportes", count: reports, active: path.startsWith("/admin/reportes") },
    { href: "/admin/comercios", label: "Comercios", active: path.startsWith("/admin/comercios") },
    { href: "/admin/automatizacion", label: "Automatización", active: path.startsWith("/admin/automatizacion") },
  ];
  return (
    <nav aria-label="Panel" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 [scrollbar-width:none]">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={it.active ? "page" : undefined}
          className={`flex shrink-0 items-center gap-1.5 border-b-[3px] px-3 py-2.5 text-sm font-semibold ${it.active ? "border-verde text-tinta" : "border-transparent text-tinta-2"}`}
        >
          {it.label}
          {it.count ? <span className="rounded-full bg-lima px-1.5 text-xs font-bold text-bosque">{it.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

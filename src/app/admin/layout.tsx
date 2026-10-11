import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import { Icon } from "@/components/icon";
import { getCurrentUser, getRepo } from "@/lib/data";
import { todayAR } from "@/lib/domain/dates";
import { AdminNav } from "./admin-nav";

export const metadata = { title: { default: "Panel", template: "%s · Panel Pesito" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/ingresar?volver=/admin");
  if (user.role !== "admin") {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-bold">Esta sección es solo para el equipo de Pesito</h1>
        <Link href="/" className="btn-primario mt-4">
          Volver al inicio
        </Link>
      </main>
    );
  }
  const repo = await getRepo();
  const stats = await repo.adminStats(todayAR());
  return (
    <div className="min-h-dvh">
      <header className="border-b border-linea bg-superficie">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-2">
          <Link href="/admin" aria-label="Panel">
            <Logo size="sm" />
          </Link>
          <span className="chip bg-bosque text-lima">Panel</span>
          {repo.mode === "demo" && <span className="chip bg-alerta-suave text-alerta">Demo</span>}
          <Link href="/" className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-tinta-2">
            Ver la app <Icon name="external" size={15} />
          </Link>
        </div>
        <AdminNav pending={stats.submissions.pendiente + stats.submissions.en_revision} reports={stats.openReports} />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 pb-16">{children}</main>
    </div>
  );
}

import Link from "next/link";
import { BottomNav } from "@/components/bottom-nav";
import { getRepo } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const repo = await getRepo();
  return (
    <>
      {repo.mode === "demo" && (
        <div className="bg-bosque px-4 py-1.5 text-center text-xs text-crema">
          Modo demo: las promos marcadas como <b className="text-lima">Ejemplo</b> son inventadas.{" "}
          <Link href="/ingresar" className="font-semibold text-lima underline underline-offset-2">
            Cambiar usuario
          </Link>
        </div>
      )}
      <main className="mx-auto min-h-dvh max-w-xl px-4 pb-[calc(env(safe-area-inset-bottom)+104px)]">{children}</main>
      <BottomNav />
    </>
  );
}

import Link from "next/link";
import { Mascot } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <Mascot pose="buscando" width={140} />
      <h1 className="mt-4 text-2xl font-black tracking-tight">No encontramos esta página</h1>
      <p className="mt-2 text-tinta-2">Puede que la promo haya terminado o que el enlace esté mal.</p>
      <Link href="/" className="btn-primario mt-6">
        Ir al inicio
      </Link>
    </main>
  );
}

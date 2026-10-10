import Link from "next/link";
import { Mascot } from "@/components/brand";

export const metadata = { title: "Sugerencia enviada" };

export default function SentPage() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
      <Mascot pose="corazon" width={150} />
      <h1 className="mt-4 text-[26px] font-black tracking-tight">¡Gracias por sumar!</h1>
      <p className="mt-2 max-w-xs text-tinta-2">Recibimos tu sugerencia. La vamos a verificar en la fuente oficial y te avisamos el estado en tu perfil.</p>
      <div className="mt-6 grid w-full max-w-xs gap-2">
        <Link href="/perfil#sugerencias" className="btn-primario">
          Ver mis sugerencias
        </Link>
        <Link href="/sugerir" className="btn-secundario">
          Sugerir otra
        </Link>
      </div>
    </div>
  );
}

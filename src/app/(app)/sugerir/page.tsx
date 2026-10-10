import Link from "next/link";
import { Mascot } from "@/components/brand";
import { EmptyState, PageHeader } from "@/components/ui";
import { getCurrentUser, getRepo } from "@/lib/data";
import { isAiExtractionEnabled } from "@/lib/env";
import { SuggestForm } from "./suggest-form";

export const metadata = { title: "Sugerí una promo" };

export default async function SuggestPage() {
  const [repo, user] = await Promise.all([getRepo(), getCurrentUser()]);
  if (!user) {
    return (
      <div>
        <PageHeader title="Sugerí una promo" back="/" />
        <EmptyState
          title="Ingresá para sugerir promos"
          text="Así podés seguir el estado de lo que mandás y evitamos el spam."
          pose="celular"
          action={
            <Link href="/ingresar?volver=/sugerir" className="btn-primario">
              Ingresar
            </Link>
          }
        />
      </div>
    );
  }
  const methods = await repo.listPaymentMethods();
  return (
    <div>
      <PageHeader title="Sugerí una promo" back="/" />
      <div className="mb-5 flex items-center gap-3 rounded-[22px] bg-lima p-4">
        <Mascot pose="celular" width={70} eager />
        <p className="text-sm font-medium">
          <b className="block text-[16px]">¿Encontraste una promo?</b>
          Contanos lo básico. Nuestro equipo la verifica en la fuente oficial antes de publicarla.
        </p>
      </div>
      <SuggestForm
        banks={methods.filter((m) => m.kind === "banco").map((m) => m.name)}
        wallets={methods.filter((m) => m.kind === "billetera").map((m) => m.name)}
        aiEnabled={isAiExtractionEnabled()}
      />
    </div>
  );
}

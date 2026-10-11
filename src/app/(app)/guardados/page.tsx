import Link from "next/link";
import { CouponCard, PromoCard } from "@/components/promo-cards";
import { EmptyState, PageHeader } from "@/components/ui";
import { getCurrentUser, getRepo } from "@/lib/data";
import { todayAR } from "@/lib/domain/dates";

export const metadata = { title: "Guardados" };

export default async function SavedPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const tab = ver === "usados" ? "usados" : "guardados";
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div>
        <PageHeader title="Guardados" />
        <EmptyState
          title="Guardá tus promos favoritas"
          text="Ingresá para guardar promos y cupones, y marcar los que ya usaste."
          pose="corazon"
          action={
            <Link href="/ingresar?volver=/guardados" className="btn-primario">
              Ingresar
            </Link>
          }
        />
      </div>
    );
  }
  const repo = await getRepo();
  const states = await repo.getUserStates(user.id);
  const ids = [...states.entries()].filter(([, s]) => (tab === "usados" ? s.usedAt : s.savedAt)).map(([id]) => id);
  // Incluye vencidas: si guardaste algo, tiene que seguir apareciendo aunque haya terminado.
  const promos = ids.length ? await repo.listPromotions({ ids, statuses: ["publicada", "vencida"] }) : [];
  const today = todayAR();
  const sorted = promos.sort((a, b) => {
    const ka = tab === "usados" ? states.get(a.id)!.usedAt! : states.get(a.id)!.savedAt!;
    const kb = tab === "usados" ? states.get(b.id)!.usedAt! : states.get(b.id)!.savedAt!;
    return kb.localeCompare(ka);
  });

  return (
    <div>
      <PageHeader title="Guardados" />
      <nav aria-label="Ver" className="mb-4 grid grid-cols-2 rounded-full bg-superficie p-1 shadow-[var(--shadow-tarjeta)]">
        {(["guardados", "usados"] as const).map((t) => (
          <Link
            key={t}
            href={t === "usados" ? "/guardados?ver=usados" : "/guardados"}
            aria-current={tab === t ? "page" : undefined}
            className={`rounded-full py-2 text-center text-sm font-semibold ${tab === t ? "bg-bosque text-white" : "text-tinta-2"}`}
          >
            {t === "usados" ? "Cupones usados" : "Guardados"}
          </Link>
        ))}
      </nav>
      {sorted.length === 0 ? (
        <EmptyState
          title={tab === "usados" ? "Todavía no marcaste cupones usados" : "Todavía no guardaste nada"}
          text={tab === "usados" ? "Cuando uses un cupón, marcalo como usado y lo vas a ver acá." : "Tocá el corazón en una promo o cupón para tenerlo a mano."}
          pose="corazon"
          action={
            <Link href={tab === "usados" ? "/cupones" : "/promos"} className="btn-primario">
              {tab === "usados" ? "Ver cupones" : "Explorar promos"}
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3">
          {sorted.some((p) => p.kind === "reintegro" || p.kind === "descuento" || p.kind === "cumple") && (
            <div className="grid grid-cols-2 gap-3">
              {sorted
                .filter((p) => p.kind !== "cupon")
                .map((p) => (
                  <PromoCard key={p.id} promo={p} today={today} saved={!!states.get(p.id)?.savedAt} />
                ))}
            </div>
          )}
          {sorted
            .filter((p) => p.kind === "cupon")
            .map((p) => (
              <CouponCard key={p.id} promo={p} today={today} saved={!!states.get(p.id)?.savedAt} used={!!states.get(p.id)?.usedAt} />
            ))}
        </div>
      )}
    </div>
  );
}

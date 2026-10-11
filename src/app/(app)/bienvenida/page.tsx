import Link from "next/link";
import { Mascot, PaymentDot } from "@/components/brand";
import { Icon } from "@/components/icon";
import { savePaymentMethods } from "@/app/actions";
import { getCurrentUser, getRepo } from "@/lib/data";
import { safeNext } from "@/lib/request";

export const metadata = { title: "Bienvenida" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ volver?: string }> }) {
  const { volver } = await searchParams;
  const next = safeNext(volver, "/");
  const [repo, user] = await Promise.all([getRepo(), getCurrentUser()]);
  const methods = await repo.listPaymentMethods();
  const mine = new Set(user?.paymentMethodIds ?? []);

  return (
    <div className="flex min-h-[calc(100dvh-140px)] flex-col pt-[calc(env(safe-area-inset-top)+16px)]">
      <div className="flex justify-end">
        <Link href={next} className="text-sm font-semibold text-tinta-2">
          Lo hago más tarde
        </Link>
      </div>
      <div className="flex flex-col items-center text-center">
        <Mascot pose="logo" width={130} eager />
        <h1 className="mt-2 text-[28px] leading-tight font-black tracking-tight">¡Bienvenido a Pesito!</h1>
        <p className="mt-1 max-w-xs text-tinta-2">Elegí tus bancos y billeteras para ver primero las promos que podés usar.</p>
      </div>

      {!user ? (
        <div className="mt-8 grid gap-3">
          <Link href={`/ingresar?volver=${encodeURIComponent(`/bienvenida?volver=${next}`)}`} className="btn-primario">
            Ingresar para empezar
          </Link>
          <Link href="/promos" className="btn-secundario">
            Explorar sin cuenta
          </Link>
        </div>
      ) : (
        <form action={savePaymentMethods} className="mt-6 flex flex-1 flex-col">
          <input type="hidden" name="volver" value={next} />
          <fieldset>
            <legend className="sr-only">Tus bancos y billeteras</legend>
            <div className="grid grid-cols-2 gap-2.5">
              {methods.map((m) => (
                <label
                  key={m.id}
                  className="relative flex cursor-pointer items-center gap-2.5 rounded-2xl border-2 border-transparent bg-superficie p-3 shadow-[var(--shadow-tarjeta)] has-[:checked]:border-verde has-[:checked]:bg-lima-suave has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lima"
                >
                  <input type="checkbox" name="pm" value={m.id} defaultChecked={mine.has(m.id)} className="peer sr-only" />
                  <PaymentDot pm={m} size={32} />
                  <span className="min-w-0 flex-1 text-sm leading-tight font-semibold">{m.name}</span>
                  <span className="hidden size-5 place-items-center rounded-full bg-verde text-white peer-checked:grid">
                    <Icon name="check" size={13} strokeWidth={3} />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+92px)] mt-6 pt-2">
            <button className="btn-primario w-full">
              Continuar <Icon name="chevronRight" size={18} />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

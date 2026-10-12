import Link from "next/link";
import { Icon } from "@/components/icon";
import { getRepo } from "@/lib/data";
import { addDaysISO, todayAR } from "@/lib/domain/dates";
import { QuickCouponForm } from "./quick-form";

export const metadata = { title: "Carga rápida" };

export default async function QuickCouponPage() {
  const categories = await (await getRepo()).listCategories();
  const today = todayAR();
  return (
    <div className="grid max-w-xl grid-cols-[minmax(0,1fr)] gap-4">
      <Link href="/admin/promos" className="inline-flex items-center gap-1 text-sm font-semibold text-tinta-2">
        <Icon name="chevronLeft" size={16} /> Volver a Promos
      </Link>
      <div>
        <h1 className="text-xl font-bold">Carga rápida de cupón</h1>
        <p className="text-sm text-tinta-2">Para lo que ves en redes y se termina enseguida. Con comercio, descuento y fecha alcanza; se publica al toque y aparece en «Se terminan pronto» cuando le queden 3 días o menos.</p>
      </div>
      <section className="tarjeta p-4">
        <QuickCouponForm categories={categories} today={today} defaultUntil={addDaysISO(today, 2)} />
      </section>
    </div>
  );
}

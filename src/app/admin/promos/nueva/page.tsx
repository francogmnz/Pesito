import Link from "next/link";
import { createPromotion } from "@/app/admin/actions";
import { EditPayloadForm } from "@/app/admin/revision/[id]/edit-form";
import { Icon } from "@/components/icon";
import { getRepo } from "@/lib/data";
import type { PromoPayload } from "@/lib/domain/types";

export const metadata = { title: "Cargar promo" };

const EMPTY: PromoPayload = {
  kind: "reintegro",
  audience: "todos",
  merchantName: "",
  categorySlug: null,
  title: "",
  summary: null,
  bank: null,
  wallet: null,
  paymentMethodSlugs: [],
  discountKind: "porcentaje",
  discountValue: null,
  capAmount: null,
  capPeriod: "sin_tope",
  minPurchase: null,
  validFrom: null,
  validUntil: null,
  daysOfWeek: null,
  channel: "ambos",
  conditions: null,
  requirements: [],
  sourceUrl: null,
  externalId: null,
  coupon: null,
  birthday: null,
};

export default async function NewPromoAdmin() {
  const repo = await getRepo();
  const [categories, paymentMethods] = await Promise.all([repo.listCategories(), repo.listPaymentMethods()]);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Link href="/admin/promos" className="inline-flex items-center gap-1 text-sm font-semibold text-tinta-2">
        <Icon name="chevronLeft" size={16} /> Volver a Promos
      </Link>
      <div>
        <h1 className="text-xl font-bold">Cargar una promo, cupón o beneficio</h1>
        <p className="text-sm text-tinta-2">Se publica al guardar. Si el comercio no existe, se crea con el nombre que escribas.</p>
      </div>
      <section className="tarjeta max-w-3xl p-4">
        <EditPayloadForm id="nueva" payload={EMPTY} categories={categories} paymentMethods={paymentMethods} readOnly={false} save={createPromotion} saveLabel="Publicar" />
      </section>
    </div>
  );
}

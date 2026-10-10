import { PageHeader } from "@/components/ui";
import { getRepo } from "@/lib/data";
import { availability } from "@/lib/domain/calc";
import { todayAR } from "@/lib/domain/dates";
import { CalculatorPage } from "./calculator-page";

export const metadata = { title: "Calculadora de reintegro" };

export default async function Page({ searchParams }: { searchParams: Promise<{ promo?: string }> }) {
  const { promo } = await searchParams;
  const repo = await getRepo();
  const today = todayAR();
  const promos = (await repo.listPromotions({ kinds: ["reintegro", "descuento"] }))
    .filter((p) => availability(p, today).state !== "vencida")
    .map((p) => ({
      id: p.id,
      title: p.title,
      kind: p.kind,
      discountKind: p.discountKind,
      discountValue: p.discountValue,
      capAmount: p.capAmount,
      capPeriod: p.capPeriod,
      minPurchase: p.minPurchase,
      merchant: { name: p.merchant.name, logoUrl: p.merchant.logoUrl, logoAuthorized: p.merchant.logoAuthorized },
      pmNames: p.paymentMethods.map((x) => x.name).join(", ") || "Cualquier medio",
    }));
  return (
    <div>
      <PageHeader title="Calculadora de reintegro" back="/" subtitle="Ingresá un monto y conocé tu ahorro y el progreso al tope." />
      <CalculatorPage promos={promos} initialId={promo} />
    </div>
  );
}

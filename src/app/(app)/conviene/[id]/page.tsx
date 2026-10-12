import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { FinePrint, Notice, PageHeader } from "@/components/ui";
import { getCurrentUser, getRepo } from "@/lib/data";
import { compareForMerchant, type CompareRow } from "@/lib/domain/calc";
import { todayAR } from "@/lib/domain/dates";
import { formatARS } from "@/lib/domain/money";
import { normalizeText } from "@/lib/domain/fingerprint";
import { compareListings, priceAge, priceTrend, type Listing } from "@/lib/domain/products";

export const metadata = { title: "Comparar precios" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepo();
  const found = await repo.getProduct(id);
  if (!found) notFound();
  const { product, listings } = found;
  const cmp = compareListings(listings);
  const today = todayAR();
  const [user, paymentMethods, merchants] = await Promise.all([getCurrentUser(), repo.listPaymentMethods(), repo.listMerchants()]);
  // Las promos de una cadena suelen estar cargadas con otro nombre ("Farmacity Online", "Farmacity, Simplicity y Get the look"):
  // valen las de todo comercio cuyo nombre contiene el de la tienda.
  const sameChain = (name: string) => merchants.filter((m) => ` ${normalizeText(m.name)} `.includes(` ${normalizeText(name)} `)).map((m) => m.slug);

  // Mejor promo bancaria de hoy en cada comercio, calculada con el mismo motor de la calculadora.
  const bestPromo = new Map<string, CompareRow>();
  await Promise.all(
    cmp.available.map(async (l) => {
      const slugs = [...new Set([l.merchantSlug, ...sameChain(l.merchantName)])].slice(0, 6);
      // El precio es el de la tienda online: no cuentan las promos que son solo para locales.
      const promos = (await Promise.all(slugs.map((merchantSlug) => repo.listPromotions({ merchantSlug, kinds: ["reintegro", "descuento"], limit: 100 })))).flat().filter((p) => p.channel !== "local");
      const rows = compareForMerchant(promos, l.price, today, paymentMethods, user?.paymentMethodIds ?? []).filter((r) => r.promotion && r.appliesToday && r.result?.eligible && r.result.saving > 0);
      // Si la persona cargó sus medios de pago, primero los suyos.
      const row = rows.find((r) => r.userHasIt) ?? rows[0];
      if (row) bestPromo.set(l.merchantSlug, row);
    }),
  );

  const row = (l: Listing, best: boolean) => {
    const age = priceAge(l.lastOkAt);
    const trend = l.inStock ? priceTrend(l) : null;
    const promo = bestPromo.get(l.merchantSlug);
    return (
      <li key={l.url} className={`tarjeta p-4 ${best ? "ring-2 ring-verde" : ""}`}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {best && cmp.available.length > 1 && <span className="chip mb-1 bg-lima text-bosque">El más barato</span>}
            <b className="block text-[16px]">{l.merchantName}</b>
            <span className={`block text-xs ${age.stale ? "font-semibold text-alerta" : "text-tinta-2"}`}>Precio {age.label}</span>
          </div>
          <div className="text-right">
            <b className="numero block text-xl">{l.inStock ? formatARS(l.price) : "Sin stock"}</b>
            {l.inStock && l.listPrice && <span className="numero block text-xs text-tinta-2 line-through">{formatARS(l.listPrice)}</span>}
          </div>
        </div>
        {trend && (
          <p className={`mt-2 text-sm font-semibold ${trend.tone === "bueno" ? "text-verde-oscuro" : trend.tone === "malo" ? "text-alerta" : "text-tinta-2"}`}>{trend.text}</p>
        )}
        {l.inStock && promo?.promotion && promo.result && (
          <Link href={`/promos/${promo.promotion.id}`} className="mt-3 block rounded-2xl bg-lima-suave p-3 text-sm text-verde-oscuro">
            <b>
              Con {promo.paymentMethod.name}: te quedaría en {formatARS(promo.result.finalCost)}
            </b>
            <span className="block">
              Reintegro o descuento estimado de {formatARS(promo.result.saving)} por «{promo.promotion.title}». Es una estimación: revisá las condiciones{promo.userHasIt ? "" : " y si tenés ese medio de pago"}.
            </span>
          </Link>
        )}
        <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-verde">
          <Icon name="external" size={16} /> Ver en {l.merchantName}
        </a>
      </li>
    );
  };

  return (
    <div>
      <PageHeader title="Comparar precios" back="/conviene" />
      <div className="tarjeta mb-3 flex items-center gap-3 p-3">
        <span className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-white">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt="" referrerPolicy="no-referrer" className="size-full object-contain" />
          ) : (
            <Icon name="tag" className="text-tenue" />
          )}
        </span>
        <div className="min-w-0">
          {product.brand && <span className="block text-xs font-semibold tracking-wide text-tinta-2 uppercase">{product.brand}</span>}
          <h2 className="text-[17px] leading-tight font-bold">{product.name}</h2>
          {product.category && <span className="mt-1 block text-xs text-tinta-2">{product.category}</span>}
          <span className="block text-xs text-tenue">Código de barras {product.ean}</span>
        </div>
      </div>

      {cmp.spread && cmp.best && (
        <div className="mb-3 rounded-2xl bg-bosque p-4 text-white">
          <b className="block text-lg text-lima">
            Ahorrás {formatARS(cmp.spread.amount)} ({cmp.spread.percent}%)
          </b>
          <span className="text-sm">comprándolo en {cmp.best.merchantName} en vez del más caro.</span>
        </div>
      )}
      {cmp.available.length === 1 && (
        <div className="mb-3">
          <Notice>Por ahora lo encontramos en un solo comercio. Cuando aparezca en otro, lo vas a poder comparar acá.</Notice>
        </div>
      )}
      {cmp.available.length === 0 && (
        <div className="mb-3">
          <Notice tone="alerta">Ningún comercio lo tiene con stock en este momento.</Notice>
        </div>
      )}

      <ul className="grid gap-3">
        {cmp.available.map((l, i) => row(l, i === 0))}
        {cmp.unavailable.map((l) => row(l, false))}
      </ul>

      <div className="mt-4">
        <Notice>
          Los precios son los publicados por cada comercio en su tienda online; pueden cambiar o ser distintos en el local. El costo con promo es una estimación con las promos que Pesito tiene cargadas: no incluye envío ni garantiza que la promo aplique a este producto.
        </Notice>
      </div>
      <FinePrint>Precios, fotos, nombres y disponibilidad tomados de la tienda online de cada comercio en la fecha que se indica junto a cada precio. Pueden cambiar sin aviso o ser distintos en los locales. Pesito no vende productos ni interviene en la compra: el precio final es el que informa el comercio al momento de pagar. Las marcas y sus imágenes pertenecen a sus respectivos dueños.</FinePrint>
    </div>
  );
}

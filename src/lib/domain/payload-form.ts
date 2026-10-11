import { parseARS } from "./money";
import { REQUIREMENTS, type PromoPayload, type Promotion } from "./types";

/** Una promo ya guardada, en el formato del formulario del panel. */
export function payloadFromPromotion(p: Promotion): PromoPayload {
  return {
    kind: p.kind,
    audience: p.audience,
    merchantName: p.merchant.name,
    categorySlug: p.merchant.categorySlug,
    title: p.title,
    summary: p.summary,
    bank: null,
    wallet: null,
    paymentMethodSlugs: p.paymentMethods.map((m) => m.slug),
    discountKind: p.discountKind,
    discountValue: p.discountValue,
    capAmount: p.capAmount,
    capPeriod: p.capPeriod,
    minPurchase: p.minPurchase,
    validFrom: p.validFrom,
    validUntil: p.validUntil,
    daysOfWeek: p.daysOfWeek,
    channel: p.channel,
    conditions: p.conditions,
    requirements: p.requirements,
    sourceUrl: p.sourceUrl,
    externalId: p.externalId,
    coupon: p.coupon,
    birthday: p.birthday,
  };
}

type Getter = { get(name: string): FormDataEntryValue | null; getAll(name: string): FormDataEntryValue[] };

const str = (f: Getter, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const money = (f: Getter, k: string) => parseARS(String(f.get(k) ?? ""));
const int = (f: Getter, k: string, d = 0) => {
  const n = Number(f.get(k));
  return Number.isFinite(n) ? Math.trunc(n) : d;
};

/** Arma un PromoPayload desde el formulario de revisión del admin (se valida después con payloadSchema). */
export function payloadFromForm(f: Getter): PromoPayload {
  const kind = (str(f, "kind") ?? "reintegro") as PromoPayload["kind"];
  const discountKind = (str(f, "discountKind") ?? "porcentaje") as PromoPayload["discountKind"];
  const capAmount = money(f, "capAmount");
  const days = f.getAll("daysOfWeek").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const redemption = (str(f, "coupon.redemption") ?? "codigo") as NonNullable<PromoPayload["coupon"]>["redemption"];
  return {
    kind,
    audience: (str(f, "audience") ?? (kind === "cupon" ? "nuevos_clientes" : kind === "cumple" ? "cumpleanieros" : "todos")) as PromoPayload["audience"],
    merchantName: str(f, "merchantName") ?? "",
    categorySlug: str(f, "categorySlug"),
    title: str(f, "title") ?? "",
    summary: str(f, "summary"),
    bank: str(f, "bank"),
    wallet: str(f, "wallet"),
    paymentMethodSlugs: [...new Set(f.getAll("paymentMethodSlugs").map(String))],
    discountKind,
    discountValue: discountKind === "regalo" ? null : parseARS(String(f.get("discountValue") ?? "").replace("%", "")),
    capAmount,
    capPeriod: capAmount ? ((str(f, "capPeriod") ?? "mes") as PromoPayload["capPeriod"]) : "sin_tope",
    minPurchase: money(f, "minPurchase"),
    validFrom: str(f, "validFrom"),
    validUntil: str(f, "validUntil"),
    daysOfWeek: days.length && days.length < 7 ? [...new Set(days)].sort() : null,
    channel: (str(f, "channel") ?? "ambos") as PromoPayload["channel"],
    conditions: str(f, "conditions"),
    requirements: f.getAll("requirements").map(String).filter((r): r is PromoPayload["requirements"][number] => (REQUIREMENTS as readonly string[]).includes(r)),
    sourceUrl: str(f, "sourceUrl"),
    externalId: str(f, "externalId"),
    coupon:
      kind === "cupon"
        ? {
            redemption,
            code: redemption === "codigo" ? (str(f, "coupon.code")?.toUpperCase() ?? null) : null,
            newCustomersOnly: f.get("coupon.newCustomersOnly") === "on",
            requiresExternalSignup: f.get("coupon.requiresExternalSignup") === "on",
            externalPlatform: str(f, "coupon.externalPlatform"),
          }
        : null,
    birthday:
      kind === "cumple"
        ? {
            windowKind: (str(f, "birthday.windowKind") ?? "mes") as NonNullable<PromoPayload["birthday"]>["windowKind"],
            daysBefore: Math.min(31, Math.max(0, int(f, "birthday.daysBefore"))),
            daysAfter: Math.min(31, Math.max(0, int(f, "birthday.daysAfter"))),
            benefit: (str(f, "birthday.benefit") ?? (discountKind === "regalo" ? "regalo" : "descuento")) as NonNullable<PromoPayload["birthday"]>["benefit"],
            loyaltyProgram: str(f, "birthday.loyaltyProgram"),
          }
        : null,
  };
}

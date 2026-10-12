import { describe, expect, it } from "vitest";
import { birthdayInYear, birthdayStatus, daysUntilBirthday, isValidBirthday, nextBirthday } from "./birthday";
import { availability, calcSaving, compareForMerchant } from "./calc";
import { byExpiry, expiryLabel, isExpiringSoon } from "./coupons";
import { addDaysISO, daysBetween, formatDays, isValidISODate, todayAR } from "./dates";
import { findDuplicates, similarity } from "./duplicates";
import { fingerprint, matchesQuery, normalizeText, slugify } from "./fingerprint";
import { formatARS, parseARS } from "./money";
import { allowedActions, canPublish, ModerationError, nextStatus } from "./moderation";
import { payloadFromForm } from "./payload-form";
import { formToPayload, isSafePublicUrl, isSpam, publishProblems, sniffImageType, suggestionFormSchema } from "./validation";
import { buildDemoPromotions, paymentMethods } from "@/lib/data/demo-seed";
import type { PromoPayload } from "./types";

const TODAY = "2026-10-10"; // sábado

describe("fechas y dinero", () => {
  it("calcula la fecha de Argentina aunque en UTC ya sea otro día", () => {
    expect(todayAR(new Date("2026-10-11T02:30:00Z"))).toBe("2026-10-10"); // 23:30 en Buenos Aires
  });
  it("opera con fechas ISO", () => {
    expect(daysBetween("2026-10-10", "2026-10-17")).toBe(7);
    expect(addDaysISO("2026-12-30", 3)).toBe("2027-01-02");
    expect(isValidISODate("2026-02-29")).toBe(false);
    expect(isValidISODate("2028-02-29")).toBe(true);
  });
  it("describe los días de la promo", () => {
    expect(formatDays(null)).toBe("Todos los días");
    expect(formatDays([1, 2, 3, 4, 5])).toBe("De lunes a viernes");
    expect(formatDays([6])).toBe("Solo sábado");
    expect(formatDays([3, 1])).toBe("Lun y Mié");
  });
  it("lee y escribe pesos argentinos", () => {
    expect(parseARS("25.000")).toBe(25000);
    expect(parseARS("$ 1.234,50")).toBe(1234.5);
    expect(parseARS("abc")).toBeNull();
    expect(formatARS(12450)).toBe("$ 12.450");
  });
});

describe("calculadora de reintegro", () => {
  it("respeta el tope (caso de la pantalla de referencia)", () => {
    const r = calcSaving({ amount: 25000, discountKind: "porcentaje", discountValue: 25, capAmount: 8000, minPurchase: null });
    expect(r.saving).toBe(6250);
    expect(r.finalCost).toBe(18750);
    expect(Math.round(r.capProgress! * 100)).toBe(78);
    expect(r.amountForFullCap).toBe(32000);
  });
  it("corta en el tope y en lo ya usado del período", () => {
    const r = calcSaving({ amount: 100000, discountKind: "porcentaje", discountValue: 25, capAmount: 8000, minPurchase: null, capUsed: 5000 });
    expect(r.saving).toBe(3000);
    expect(r.capReached).toBe(true);
  });
  it("aplica compra mínima y montos fijos", () => {
    expect(calcSaving({ amount: 10000, discountKind: "monto_fijo", discountValue: 3000, capAmount: null, minPurchase: 12000 }).eligible).toBe(false);
    expect(calcSaving({ amount: 2000, discountKind: "monto_fijo", discountValue: 3000, capAmount: null, minPurchase: null }).saving).toBe(2000);
  });
  it("sabe si una promo aplica hoy", () => {
    const base = { validFrom: null, validUntil: "2026-12-31", status: "publicada" as const };
    expect(availability({ ...base, daysOfWeek: [6] }, TODAY).state).toBe("activa");
    expect(availability({ ...base, daysOfWeek: [1, 3] }, TODAY).state).toBe("hoy_no");
    expect(availability({ ...base, validUntil: "2026-10-01", daysOfWeek: null }, TODAY).state).toBe("vencida");
    expect(availability({ ...base, validFrom: "2026-10-12", daysOfWeek: null }, TODAY).label).toBe("Empieza en 2 días");
  });
  it("el comparador ordena por ahorro y prioriza lo que aplica hoy", () => {
    const promos = buildDemoPromotions(TODAY).filter((p) => p.merchant.slug === "super-la-esquina");
    const rows = compareForMerchant(promos, 25000, TODAY, paymentMethods, ["pm-bbva"]);
    expect(rows.map((r) => r.paymentMethod.slug)).toEqual(["banco-nacion", "mercado-pago", "bbva", "santander"]); // Santander es lun/mié
    expect(rows[0].result!.saving).toBe(6250);
    expect(rows.find((r) => r.paymentMethod.slug === "santander")!.appliesToday).toBe(false);
    expect(rows.find((r) => r.paymentMethod.slug === "bbva")!.userHasIt).toBe(true);
  });
});

describe("cumpleaños (sin año de nacimiento)", () => {
  const dia = { windowKind: "dia" as const, daysBefore: 0, daysAfter: 0, benefit: "regalo" as const, loyaltyProgram: null };
  const mes = { ...dia, windowKind: "mes" as const };
  const semana = { ...dia, windowKind: "semana" as const };
  it("valida día y mes", () => {
    expect(isValidBirthday(29, 2)).toBe(true);
    expect(isValidBirthday(31, 4)).toBe(false);
    expect(isValidBirthday(0, 1)).toBe(false);
  });
  it("festeja el 29/2 el 28/2 en años no bisiestos", () => {
    expect(birthdayInYear(29, 2, 2027)).toBe("2027-02-28");
    expect(birthdayInYear(29, 2, 2028)).toBe("2028-02-29");
  });
  it("calcula el próximo cumple", () => {
    expect(nextBirthday(10, 10, TODAY)).toBe("2026-10-10");
    expect(nextBirthday(9, 10, TODAY)).toBe("2027-10-09");
    expect(daysUntilBirthday(20, 10, TODAY)).toBe(10);
  });
  it("dice si el beneficio está disponible", () => {
    expect(birthdayStatus(dia, 10, 10, TODAY).state).toBe("activo");
    expect(birthdayStatus(dia, 10, 10, TODAY).label).toBe("Disponible solo hoy");
    expect(birthdayStatus(mes, 25, 10, TODAY).state).toBe("activo");
    const prox = birthdayStatus(dia, 20, 10, TODAY);
    expect(prox.state === "proximo" && prox.inDays).toBe(10);
  });
  it("la ventana que cruza el año sigue abierta en enero", () => {
    expect(birthdayStatus(semana, 31, 12, "2027-01-02").state).toBe("activo");
  });
});

describe("cupones", () => {
  it("detecta los próximos a vencer y ordena por vencimiento", () => {
    const p = (validUntil: string | null) => ({ validUntil, status: "publicada" as const });
    expect(isExpiringSoon(p("2026-10-15"), TODAY)).toBe(true);
    expect(isExpiringSoon(p("2026-11-15"), TODAY)).toBe(false);
    expect(isExpiringSoon(p("2026-10-01"), TODAY)).toBe(false);
    expect(expiryLabel(p("2026-10-11"), TODAY)).toBe("Vence mañana");
    expect([p(null), p("2026-12-01"), p("2026-10-20")].sort(byExpiry).map((x) => x.validUntil)).toEqual(["2026-10-20", "2026-12-01", null]);
  });
});

const basePayload: PromoPayload = {
  kind: "reintegro",
  audience: "todos",
  merchantName: "Súper La Esquina",
  categorySlug: null,
  title: "20% en Súper La Esquina",
  summary: null,
  bank: null,
  wallet: null,
  paymentMethodSlugs: ["mercado-pago"],
  discountKind: "porcentaje",
  discountValue: 20,
  capAmount: 5000,
  capPeriod: "mes",
  minPurchase: null,
  validFrom: null,
  validUntil: "2026-11-30",
  daysOfWeek: null,
  channel: "ambos",
  conditions: null,
  requirements: [],
  sourceUrl: "https://example.com/promo",
  externalId: null,
  coupon: null,
  birthday: null,
};

describe("huellas, búsqueda y duplicados", () => {
  it("normaliza nombres", () => {
    expect(normalizeText("Súper  La Esquina S.A.")).toBe("super esquina");
    expect(slugify("Farmacia Ñandú")).toBe("farmacia-nandu");
  });
  it("la huella ignora la redacción pero no el beneficio", () => {
    const a = fingerprint(basePayload);
    expect(fingerprint({ ...basePayload, title: "Otro título", merchantName: "super la esquina" } as PromoPayload)).toBe(a);
    expect(fingerprint({ ...basePayload, discountValue: 25 })).not.toBe(a);
  });
  it("busca por comienzo de palabra (no por pedazos)", () => {
    expect(matchesQuery("Estación Ruta 40 combustible", "ombu")).toBe(false);
    expect(matchesQuery("Verdulería El Ombú", "ombu")).toBe(true);
    expect(matchesQuery("Súper La Esquina Mercado Pago", "super pago")).toBe(true);
  });
  it("encuentra duplicados parecidos", () => {
    expect(similarity("Súper La Esquina", "Super La Esquina")).toBe(1);
    const promos = buildDemoPromotions(TODAY);
    const d = findDuplicates({ ...basePayload, validUntil: addDaysISO(TODAY, 30) }, promos);
    expect(d[0].promotion.id).toBe("p-esquina-mp");
    expect(d[0].reasons).toContain("Medio de pago en común");
    expect(findDuplicates({ ...basePayload, merchantName: "Otra cosa total" }, promos)).toHaveLength(0);
  });
});

describe("moderación", () => {
  it("sigue el flujo pendiente → en revisión → aprobada", () => {
    expect(nextStatus("pendiente", "tomar")).toBe("en_revision");
    expect(nextStatus("en_revision", "aprobar")).toBe("aprobada");
    expect(canPublish("aprobada", false)).toBe(true);
    expect(canPublish("en_revision", false)).toBe(false);
  });
  it("no permite saltos inválidos", () => {
    expect(() => nextStatus("rechazada", "aprobar")).toThrow(ModerationError);
    expect(() => nextStatus("aprobada", "rechazar", { published: true })).toThrow(ModerationError);
    expect(allowedActions("aprobada", true)).not.toContain("rechazar");
  });
});

describe("validación de sugerencias", () => {
  const form = {
    merchantName: "  Verdulería   El Ombú ",
    kind: "reintegro",
    discountKind: "porcentaje",
    discountValue: "15",
    capAmount: "2.500",
    validUntil: "2026-12-31",
    days: ["2", "4"],
    sourceUrl: "https://ombu.example.com/promo",
    wallet: "MODO",
  };
  it("acepta un formulario correcto y arma el candidato", () => {
    const r = suggestionFormSchema.parse(form);
    expect(r.merchantName).toBe("Verdulería El Ombú");
    expect(r.capAmount).toBe(2500);
    const p = formToPayload(r);
    expect(p.title).toBe("15% de reintegro en Verdulería El Ombú con MODO");
    expect(p.daysOfWeek).toEqual([2, 4]);
  });
  it("rechaza porcentajes imposibles y enlaces inseguros", () => {
    expect(suggestionFormSchema.safeParse({ ...form, discountValue: "150" }).success).toBe(false);
    expect(suggestionFormSchema.safeParse({ ...form, sourceUrl: "http://ombu.com" }).success).toBe(false);
    expect(isSafePublicUrl("https://192.168.0.1/admin")).toBe(false);
    expect(isSafePublicUrl("https://user:pass@banco.com")).toBe(false);
    expect(isSafePublicUrl("https://www.bna.com.ar/promos")).toBe(true);
  });
  it("detecta bots por la trampa y por la velocidad", () => {
    const now = 1_000_000;
    expect(isSpam({ website: "spam.com", startedAt: now - 60_000 }, now)).toBe(true);
    expect(isSpam({ website: "", startedAt: now - 500 }, now)).toBe(true);
    expect(isSpam({ website: "", startedAt: now - 20_000 }, now)).toBe(false);
  });
  it("reconoce imágenes por sus bytes, no por la extensión", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(sniffImageType(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
  });
  it("lista lo que falta para publicar", () => {
    expect(publishProblems(basePayload)).toEqual([]);
    expect(publishProblems({ ...basePayload, sourceUrl: null })).toContain("Falta el enlace a la fuente oficial.");
    expect(publishProblems({ ...basePayload, paymentMethodSlugs: [] })).toContain("Indicá con qué banco o billetera aplica.");
    expect(publishProblems({ ...basePayload, kind: "cupon", coupon: null })).toContain("Faltan los datos del cupón.");
  });
  it("arma el candidato desde el formulario del admin", () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ kind: "cupon", merchantName: "Tienda", title: "10% bienvenida", discountKind: "porcentaje", discountValue: "10", "coupon.redemption": "codigo", "coupon.code": "hola10", "coupon.newCustomersOnly": "on", sourceUrl: "https://t.example.com" })) fd.set(k, v);
    fd.append("requirements", "primera_compra");
    fd.append("requirements", "inventado");
    const p = payloadFromForm(fd);
    expect(p.coupon).toEqual({ redemption: "codigo", code: "HOLA10", newCustomersOnly: true, requiresExternalSignup: false, externalPlatform: null });
    expect(p.requirements).toEqual(["primera_compra"]);
    expect(p.audience).toBe("nuevos_clientes");
    expect(p.capPeriod).toBe("sin_tope");
  });
});

describe("cuánto gastar para aprovechar una promo al máximo", () => {
  it("es la compra que llega justo al tope, o la mínima si es mayor", async () => {
    const { sweetSpot } = await import("./labels");
    const base = { discountKind: "porcentaje", capPeriod: "semana", minPurchase: null } as const;
    expect(sweetSpot({ ...base, discountValue: 25, capAmount: 10000 })).toEqual({ amount: 40000, saving: 10000, period: "por semana" });
    expect(sweetSpot({ ...base, discountValue: 30, capAmount: 15000, minPurchase: 60000 })).toMatchObject({ amount: 60000, saving: 15000 });
    expect(sweetSpot({ ...base, discountValue: 100, capAmount: 25000 })).toMatchObject({ amount: 25000 });
    // Sin tope o sin porcentaje no hay un monto ideal.
    expect(sweetSpot({ ...base, discountValue: 20, capAmount: null })).toBeNull();
    expect(sweetSpot({ ...base, discountKind: "monto_fijo", discountValue: 3000, capAmount: 3000 })).toBeNull();
  });
});

describe("enlace a la fuente", () => {
  it("un cupón se puede publicar sin enlace; una promo bancaria, no", async () => {
    const { publishProblems } = await import("./validation");
    const base = { audience: "todos", merchantName: "Rappi", categorySlug: null, title: "30% de descuento en Rappi", summary: null, bank: null, wallet: null, paymentMethodSlugs: [], discountKind: "porcentaje", discountValue: 30, capAmount: null, capPeriod: "sin_tope", minPurchase: null, validFrom: null, validUntil: "2099-01-01", daysOfWeek: null, channel: "ambos", conditions: null, requirements: [], sourceUrl: null, externalId: null, birthday: null } as const;
    expect(publishProblems({ ...base, kind: "cupon", requirements: [], paymentMethodSlugs: [], coupon: { redemption: "codigo", code: "RAPPI30", newCustomersOnly: false, requiresExternalSignup: false, externalPlatform: null } })).toEqual([]);
    expect(publishProblems({ ...base, kind: "reintegro", requirements: [], paymentMethodSlugs: ["modo"], coupon: null })).toContain("Falta el enlace a la fuente oficial.");
  });
});

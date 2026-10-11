/**
 * Datos del modo demo. TODO es inventado: comercios ficticios, códigos con el
 * prefijo EJEMPLO y enlaces a example.com. Sirven para ver el diseño y probar
 * los flujos sin una base de datos; nunca se cargan en Supabase.
 */
import { addDaysISO, todayAR } from "@/lib/domain/dates";
import { fingerprint } from "@/lib/domain/fingerprint";
import type {
  BirthdayDetails,
  Category,
  CouponDetails,
  Merchant,
  PaymentMethod,
  PromoKind,
  Promotion,
  Requirement,
  Source,
  UserProfile,
} from "@/lib/domain/types";

export const DEMO_USER_ID = "demo-usuario";
export const DEMO_ADMIN_ID = "demo-admin";

export const categories: Category[] = [
  { id: 1, slug: "supermercados", name: "Supermercados", icon: "cart" },
  { id: 2, slug: "farmacias", name: "Farmacias", icon: "pill" },
  { id: 3, slug: "gastronomia", name: "Gastronomía", icon: "fork" },
  { id: 4, slug: "delivery", name: "Delivery", icon: "bike" },
  { id: 5, slug: "combustible", name: "Combustible", icon: "fuel" },
  { id: 6, slug: "indumentaria", name: "Indumentaria", icon: "shirt" },
  { id: 7, slug: "tecnologia", name: "Tecnología", icon: "device" },
  { id: 8, slug: "tiendas-online", name: "Tiendas online", icon: "bag" },
  { id: 9, slug: "belleza", name: "Belleza", icon: "sparkle" },
  { id: 10, slug: "entretenimiento", name: "Entretenimiento", icon: "ticket" },
  { id: 11, slug: "transporte", name: "Transporte", icon: "bus" },
  { id: 12, slug: "educacion", name: "Educación", icon: "book" },
];

const pm = (slug: string, name: string, kind: PaymentMethod["kind"], color: string): PaymentMethod => ({ id: `pm-${slug}`, slug, name, kind, color });
export const paymentMethods: PaymentMethod[] = [
  pm("mercado-pago", "Mercado Pago", "billetera", "#00A6E0"),
  pm("banco-nacion", "Banco Nación", "banco", "#0069B4"),
  pm("santander", "Santander", "banco", "#EC0000"),
  pm("bbva", "BBVA", "banco", "#072146"),
  pm("galicia", "Galicia", "banco", "#F26B21"),
  pm("personal-pay", "Personal Pay", "billetera", "#7B3FE4"),
  pm("naranja-x", "Naranja X", "billetera", "#FE5000"),
  pm("macro", "Macro", "banco", "#1B3A6B"),
  pm("modo", "MODO", "billetera", "#2D2D7F"),
  pm("uala", "Ualá", "billetera", "#3E6BFF"),
  pm("cuenta-dni", "Cuenta DNI", "billetera", "#00843D"),
  pm("provincia", "Banco Provincia", "banco", "#00843D"),
];
const P = (slug: string) => paymentMethods.find((p) => p.slug === slug)!;

const m = (slug: string, name: string, categorySlug: string): Merchant => ({ id: `m-${slug}`, slug, name, categorySlug, logoUrl: null, logoAuthorized: false });
export const merchants: Merchant[] = [
  m("super-la-esquina", "Súper La Esquina", "supermercados"),
  m("mercado-del-barrio", "Mercado del Barrio", "supermercados"),
  m("farmavida", "FarmaVida", "farmacias"),
  m("cafe-molino", "Café Molino", "gastronomia"),
  m("pizzeria-don-tano", "Pizzería Don Tano", "gastronomia"),
  m("helados-cumbre", "Helados Cumbre", "gastronomia"),
  m("envio-rayo", "Envío Rayo", "delivery"),
  m("estacion-ruta-40", "Estación Ruta 40", "combustible"),
  m("urbana-ropa", "Urbana Ropa", "indumentaria"),
  m("tecnopunto", "TecnoPunto", "tecnologia"),
  m("tienda-ceibo", "Tienda Ceibo", "tiendas-online"),
  m("perfumeria-lirio", "Perfumería Lirio", "belleza"),
  m("cine-aurora", "Cine Aurora", "entretenimiento"),
];
const M = (slug: string) => merchants.find((x) => x.slug === slug)!;

export const sources: Source[] = [
  {
    id: "src-demo",
    name: "Fuente de ejemplo",
    url: "https://example.com/feed.json",
    kind: "autorizada",
    active: false,
    adapter: "json-feed",
    config: {},
    autoPublish: false,
    lastRunAt: null,
  },
];

interface SeedPromo {
  id: string;
  kind: PromoKind;
  merchant: string;
  title: string;
  summary?: string;
  discountKind?: Promotion["discountKind"];
  value: number | null;
  cap?: number;
  capPeriod?: Promotion["capPeriod"];
  min?: number;
  until: number | null; // días desde hoy
  days?: number[];
  channel?: Promotion["channel"];
  pms?: string[];
  conditions?: string;
  requirements?: Requirement[];
  coupon?: CouponDetails;
  birthday?: BirthdayDetails;
}

const seeds: SeedPromo[] = [
  // ----- Reintegros (base) -----
  { id: "p-esquina-nacion", kind: "reintegro", merchant: "super-la-esquina", title: "25% de reintegro en Súper La Esquina", summary: "En todas tus compras con tarjetas de crédito de Banco Nación.", value: 25, cap: 8000, capPeriod: "mes", until: 60, pms: ["banco-nacion"], conditions: "Reintegro en el resumen de la tarjeta dentro de los 30 días. Válido en sucursales y tienda online." },
  { id: "p-esquina-mp", kind: "reintegro", merchant: "super-la-esquina", title: "20% de reintegro en Súper La Esquina", summary: "Pagando con QR de Mercado Pago.", value: 20, cap: 5000, capPeriod: "mes", until: 40, pms: ["mercado-pago"], conditions: "El reintegro se acredita en la cuenta en hasta 7 días." },
  { id: "p-esquina-santander", kind: "reintegro", merchant: "super-la-esquina", title: "15% de reintegro en Súper La Esquina", value: 15, cap: 4000, capPeriod: "mes", until: 30, days: [1, 3], pms: ["santander"], conditions: "Lunes y miércoles con tarjetas de débito y crédito." },
  { id: "p-esquina-bbva", kind: "reintegro", merchant: "super-la-esquina", title: "10% de reintegro en Súper La Esquina", value: 10, cap: 3000, capPeriod: "mes", until: 45, pms: ["bbva"] },
  { id: "p-barrio-mp", kind: "reintegro", merchant: "mercado-del-barrio", title: "20% de reintegro en alimentos", summary: "En Mercado del Barrio con Mercado Pago.", value: 20, cap: 5000, capPeriod: "mes", until: 21, pms: ["mercado-pago"] },
  { id: "p-ruta40-modo", kind: "reintegro", merchant: "estacion-ruta-40", title: "10% de reintegro en combustible", value: 10, cap: 3000, capPeriod: "semana", until: 50, days: [6], pms: ["modo"], channel: "local", conditions: "Solo sábados, pagando con MODO desde la app de tu banco." },
  { id: "p-molino-galicia", kind: "descuento", merchant: "cafe-molino", title: "30% de descuento en Café Molino", value: 30, cap: 6000, capPeriod: "compra", until: 35, days: [4, 5], pms: ["galicia"], channel: "local" },
  { id: "p-farmavida-dni", kind: "reintegro", merchant: "farmavida", title: "15% de reintegro en FarmaVida", value: 15, cap: 4000, capPeriod: "mes", until: 25, days: [1, 2, 3, 4, 5], pms: ["cuenta-dni"] },

  // ----- Cupones para vos -----
  { id: "c-farmavida", kind: "cupon", merchant: "farmavida", title: "15% en tu primera compra online", value: 15, cap: 10000, capPeriod: "compra", min: 20000, until: 5, channel: "online", requirements: ["primera_compra", "registro_previo"], coupon: { redemption: "codigo", code: "EJEMPLO15", newCustomersOnly: true, requiresExternalSignup: false, externalPlatform: null }, conditions: "Válido para cuentas nuevas en la tienda online. No acumulable con otras promociones." },
  { id: "c-rayo", kind: "cupon", merchant: "envio-rayo", title: "$3.000 de descuento en tu primer pedido", discountKind: "monto_fijo", value: 3000, min: 12000, until: 20, channel: "online", requirements: ["primera_compra", "solo_app"], coupon: { redemption: "codigo", code: "EJEMPLO3K", newCustomersOnly: true, requiresExternalSignup: true, externalPlatform: "App de Envío Rayo" }, conditions: "Hay que crear una cuenta en la app. Un uso por persona." },
  { id: "c-ceibo", kind: "cupon", merchant: "tienda-ceibo", title: "10% de bienvenida al suscribirte", value: 10, cap: 8000, capPeriod: "compra", until: 30, channel: "online", requirements: ["registro_previo"], coupon: { redemption: "link", code: null, newCustomersOnly: true, requiresExternalSignup: false, externalPlatform: null }, conditions: "El descuento llega por email al suscribirte al newsletter." },
  { id: "c-urbana", kind: "cupon", merchant: "urbana-ropa", title: "20% en tu primera compra", value: 20, cap: 15000, capPeriod: "compra", min: 30000, until: 2, channel: "ambos", requirements: ["primera_compra"], coupon: { redemption: "codigo", code: "EJEMPLO20", newCustomersOnly: true, requiresExternalSignup: false, externalPlatform: null } },
  { id: "c-tecnopunto", kind: "cupon", merchant: "tecnopunto", title: "8% al crear tu cuenta", value: 8, cap: 20000, capPeriod: "compra", until: 45, channel: "online", requirements: ["cuenta_nueva"], coupon: { redemption: "automatico", code: null, newCustomersOnly: true, requiresExternalSignup: false, externalPlatform: null }, conditions: "El descuento se aplica solo en el checkout de la primera compra." },
  { id: "c-esquina-app", kind: "cupon", merchant: "super-la-esquina", title: "$5.000 en tu primera compra por la app", discountKind: "monto_fijo", value: 5000, min: 40000, until: 3, channel: "online", requirements: ["primera_compra", "solo_app"], coupon: { redemption: "codigo", code: "EJEMPLO5K", newCustomersOnly: true, requiresExternalSignup: true, externalPlatform: "App de Súper La Esquina" } },

  // ----- Tu cumple con Pesito -----
  { id: "b-cumbre", kind: "cumple", merchant: "helados-cumbre", title: "Un cucurucho de regalo", discountKind: "regalo", value: null, until: null, channel: "local", requirements: ["presentar_dni"], birthday: { windowKind: "dia", daysBefore: 0, daysAfter: 0, benefit: "regalo", loyaltyProgram: null }, conditions: "Presentando el DNI el día del cumpleaños en cualquier local." },
  { id: "b-molino", kind: "cumple", merchant: "cafe-molino", title: "20% durante todo tu mes", value: 20, cap: 10000, capPeriod: "vigencia", until: null, channel: "local", requirements: ["registro_previo"], birthday: { windowKind: "mes", daysBefore: 0, daysAfter: 0, benefit: "descuento", loyaltyProgram: null }, conditions: "Registrate en la web con al menos 7 días de anticipación." },
  { id: "b-aurora", kind: "cumple", merchant: "cine-aurora", title: "2x1 en entradas la semana de tu cumple", discountKind: "porcentaje", value: 50, until: null, channel: "ambos", requirements: ["programa_fidelizacion", "presentar_dni"], birthday: { windowKind: "semana", daysBefore: 3, daysAfter: 3, benefit: "descuento", loyaltyProgram: "Club Aurora" } },
  { id: "b-lirio", kind: "cumple", merchant: "perfumeria-lirio", title: "Cupón de 25% para tu cumpleaños", value: 25, cap: 12000, capPeriod: "compra", until: null, channel: "ambos", requirements: ["registro_previo"], birthday: { windowKind: "mes", daysBefore: 0, daysAfter: 0, benefit: "cupon", loyaltyProgram: null }, conditions: "El cupón llega por email el primer día de tu mes." },
  { id: "b-don-tano", kind: "cumple", merchant: "pizzeria-don-tano", title: "Postre de regalo", discountKind: "regalo", value: null, until: null, channel: "local", requirements: ["presentar_dni"], birthday: { windowKind: "rango", daysBefore: 3, daysAfter: 3, benefit: "regalo", loyaltyProgram: null }, conditions: "Con una consumición mínima por mesa, de 3 días antes a 3 días después del cumpleaños." },
];

export function buildDemoPromotions(today = todayAR()): Promotion[] {
  return seeds.map((s) => {
    const merchant = M(s.merchant);
    const pms = (s.pms ?? []).map(P);
    const discountKind = s.discountKind ?? "porcentaje";
    const validUntil = s.until == null ? null : addDaysISO(today, s.until);
    return {
      id: s.id,
      kind: s.kind,
      audience: s.kind === "cupon" ? "nuevos_clientes" : s.kind === "cumple" ? (s.birthday?.loyaltyProgram ? "miembros" : "cumpleanieros") : "todos",
      merchant,
      title: s.title,
      summary: s.summary ?? null,
      discountKind,
      discountValue: s.value,
      capAmount: s.cap ?? null,
      capPeriod: s.cap ? (s.capPeriod ?? "mes") : "sin_tope",
      minPurchase: s.min ?? null,
      validFrom: addDaysISO(today, -10),
      validUntil,
      daysOfWeek: s.days ?? null,
      channel: s.channel ?? "ambos",
      conditions: s.conditions ?? null,
      requirements: s.requirements ?? [],
      sourceUrl: "https://example.com/",
      sourceName: "Ejemplo",
      sourceKind: null,
      externalId: null,
      status: "publicada",
      fingerprint: fingerprint({
        kind: s.kind,
        merchantName: merchant.name,
        discountKind,
        discountValue: s.value,
        capAmount: s.cap ?? null,
        paymentMethodSlugs: s.pms ?? [],
        daysOfWeek: s.days ?? null,
        validUntil,
        coupon: s.coupon ?? null,
        bank: null,
        wallet: null,
      }),
      paymentMethods: pms,
      coupon: s.coupon ?? null,
      birthday: s.birthday ?? null,
      lastVerifiedAt: null,
      updatedAt: new Date().toISOString(),
      isSample: true,
    } satisfies Promotion;
  });
}

export function buildDemoProfiles(): UserProfile[] {
  return [
    { id: DEMO_USER_ID, name: "Lucas", email: "lucas@ejemplo.com", role: "usuario", birthdayDay: null, birthdayMonth: null, paymentMethodIds: ["pm-mercado-pago", "pm-bbva"] },
    { id: DEMO_ADMIN_ID, name: "Equipo Pesito", email: "admin@ejemplo.com", role: "admin", birthdayDay: null, birthdayMonth: null, paymentMethodIds: [] },
  ];
}

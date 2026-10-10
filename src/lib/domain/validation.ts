import { z } from "zod";
import { isValidISODate } from "./dates";
import { parseARS } from "./money";
import { REQUIREMENTS } from "./types";
import type { PromoPayload } from "./types";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Tiempo mínimo para completar el formulario: los bots lo envían al instante. */
export const MIN_FILL_MS = 3000;

const trimmed = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(max, `Máximo ${max} caracteres.`));

const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((s) => (s ?? "").trim())
    .pipe(z.string().max(max, `Máximo ${max} caracteres.`))
    .transform((s) => (s === "" ? null : s));

/** Solo enlaces https públicos (nada de IPs, localhost ni credenciales embebidas). */
export function isSafePublicUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || !host.includes(".")) return false;
  return true;
}

const urlField = z
  .string()
  .optional()
  .transform((s) => (s ?? "").trim())
  .refine((s) => s === "" || (s.length <= 500 && isSafePublicUrl(s)), "Usá el enlace https de la página oficial.")
  .transform((s) => (s === "" ? null : s));

const moneyField = (label: string) =>
  z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s || !s.trim()) return null;
      const n = parseARS(s);
      if (n == null || n <= 0 || n > 100_000_000) {
        ctx.addIssue({ code: "custom", message: `Revisá ${label}.` });
        return z.NEVER;
      }
      return n;
    });

const dateField = z
  .string()
  .optional()
  .transform((s) => (s ?? "").trim())
  .refine((s) => s === "" || isValidISODate(s), "Fecha inválida.")
  .transform((s) => (s === "" ? null : s));

/** Formulario "Sugerí una promo". Llega como FormData (todo string). */
export const suggestionFormSchema = z
  .object({
    merchantName: trimmed(80).pipe(z.string().min(2, "Contanos en qué comercio es.")),
    bank: optionalText(60),
    wallet: optionalText(60),
    kind: z.enum(["reintegro", "descuento", "cupon", "cumple"], { error: "Elegí el tipo de beneficio." }),
    discountKind: z.enum(["porcentaje", "monto_fijo", "regalo"]).default("porcentaje"),
    discountValue: z
      .string()
      .optional()
      .transform((s, ctx) => {
        if (!s || !s.trim()) return null;
        const n = parseARS(s.replace("%", ""));
        if (n == null || n <= 0) {
          ctx.addIssue({ code: "custom", message: "Revisá el descuento." });
          return z.NEVER;
        }
        return n;
      }),
    capAmount: moneyField("el tope"),
    validUntil: dateField,
    days: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
    conditions: optionalText(2000),
    sourceUrl: urlField,
    couponCode: z
      .string()
      .optional()
      .transform((s) => (s ?? "").trim().toUpperCase())
      .refine((s) => s === "" || /^[A-Z0-9_-]{2,40}$/.test(s), "El código solo puede tener letras, números, guiones.")
      .transform((s) => (s === "" ? null : s)),
    comments: optionalText(1000),
    // Antispam
    website: z.string().optional(), // trampa: debe llegar vacío
    startedAt: z.coerce.number().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.discountKind === "porcentaje" && v.discountValue != null && v.discountValue > 100) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "El porcentaje no puede superar 100%." });
    }
    if (v.discountKind !== "regalo" && v.discountValue == null) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Indicá el porcentaje o el monto." });
    }
  });

export type SuggestionForm = z.infer<typeof suggestionFormSchema>;

export function isSpam(v: Pick<SuggestionForm, "website" | "startedAt">, now = Date.now()): boolean {
  if (v.website && v.website.trim() !== "") return true;
  if (!v.startedAt || now - v.startedAt < MIN_FILL_MS || now - v.startedAt > 6 * 60 * 60 * 1000) return true;
  return false;
}

/** Revisa los primeros bytes para no confiar en el tipo que declara el navegador. */
export function sniffImageType(bytes: Uint8Array): (typeof IMAGE_TYPES)[number] | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  )
    return "image/webp";
  return null;
}

export function formToPayload(v: SuggestionForm): PromoPayload {
  const isCoupon = v.kind === "cupon";
  const isBirthday = v.kind === "cumple";
  return {
    kind: v.kind,
    audience: isCoupon ? "nuevos_clientes" : isBirthday ? "cumpleanieros" : "todos",
    merchantName: v.merchantName,
    categorySlug: null,
    title: buildTitle(v),
    summary: null,
    bank: v.bank,
    wallet: v.wallet,
    paymentMethodSlugs: [],
    discountKind: v.discountKind,
    discountValue: v.discountValue,
    capAmount: v.capAmount,
    capPeriod: v.capAmount ? "mes" : "sin_tope",
    minPurchase: null,
    validFrom: null,
    validUntil: v.validUntil,
    daysOfWeek: v.days.length ? [...new Set(v.days)].sort() : null,
    channel: "ambos",
    conditions: v.conditions,
    requirements: [],
    sourceUrl: v.sourceUrl,
    externalId: null,
    coupon: isCoupon
      ? { redemption: v.couponCode ? "codigo" : "link", code: v.couponCode, newCustomersOnly: true, requiresExternalSignup: false, externalPlatform: null }
      : null,
    birthday: isBirthday ? { windowKind: "mes", daysBefore: 0, daysAfter: 0, benefit: v.discountKind === "regalo" ? "regalo" : "descuento", loyaltyProgram: null } : null,
  };
}

function buildTitle(v: SuggestionForm): string {
  const what =
    v.discountKind === "regalo"
      ? "Regalo de cumpleaños"
      : v.discountKind === "porcentaje"
        ? `${v.discountValue}% de ${v.kind === "reintegro" ? "reintegro" : "descuento"}`
        : `$${v.discountValue} de descuento`;
  const via = v.bank || v.wallet ? ` con ${[v.bank, v.wallet].filter(Boolean).join(" o ")}` : "";
  return `${what} en ${v.merchantName}${via}`.slice(0, 140);
}

/** Payload editable desde el panel admin (JSON del formulario de revisión). */
export const payloadSchema = z.object({
  kind: z.enum(["reintegro", "descuento", "cupon", "cumple"]),
  audience: z.enum(["todos", "nuevos_clientes", "cumpleanieros", "miembros"]),
  merchantName: z.string().trim().min(2).max(80),
  categorySlug: z.string().max(40).nullable(),
  title: z.string().trim().min(3).max(140),
  summary: z.string().trim().max(280).nullable(),
  bank: z.string().trim().max(60).nullable(),
  wallet: z.string().trim().max(60).nullable(),
  paymentMethodSlugs: z.array(z.string().max(40)).max(20),
  discountKind: z.enum(["porcentaje", "monto_fijo", "regalo"]),
  discountValue: z.number().min(0).nullable(),
  capAmount: z.number().positive().nullable(),
  capPeriod: z.enum(["compra", "dia", "semana", "mes", "vigencia", "sin_tope"]),
  minPurchase: z.number().min(0).nullable(),
  validFrom: z.string().refine(isValidISODate).nullable(),
  validUntil: z.string().refine(isValidISODate).nullable(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).nullable(),
  channel: z.enum(["online", "local", "ambos"]),
  conditions: z.string().trim().max(4000).nullable(),
  requirements: z.array(z.enum(REQUIREMENTS)),
  sourceUrl: z.string().refine(isSafePublicUrl, "El enlace oficial debe ser https.").nullable(),
  externalId: z.string().max(120).nullable(),
  coupon: z
    .object({
      redemption: z.enum(["codigo", "link", "automatico"]),
      code: z.string().regex(/^[A-Za-z0-9_-]{2,40}$/).nullable(),
      newCustomersOnly: z.boolean(),
      requiresExternalSignup: z.boolean(),
      externalPlatform: z.string().max(60).nullable(),
    })
    .refine((c) => c.redemption !== "codigo" || !!c.code, "Falta el código del cupón.")
    .refine((c) => !c.requiresExternalSignup || !!c.externalPlatform, "Indicá en qué plataforma hay que registrarse.")
    .nullable(),
  birthday: z
    .object({
      windowKind: z.enum(["dia", "semana", "mes", "rango"]),
      daysBefore: z.number().int().min(0).max(31),
      daysAfter: z.number().int().min(0).max(31),
      benefit: z.enum(["descuento", "regalo", "cupon", "experiencia"]),
      loyaltyProgram: z.string().max(80).nullable(),
    })
    .nullable(),
});

/** Antes de publicar: lo mínimo para que la promo sea útil y verificable. */
export function publishProblems(p: PromoPayload): string[] {
  const out: string[] = [];
  const parsed = payloadSchema.safeParse(p);
  if (!parsed.success) out.push(...parsed.error.issues.map((i) => `${i.path.join(".") || "datos"}: ${i.message}`));
  if (!p.sourceUrl) out.push("Falta el enlace a la fuente oficial.");
  if (p.discountKind !== "regalo" && p.discountValue == null) out.push("Falta el valor del beneficio.");
  if (p.discountKind === "porcentaje" && (p.discountValue ?? 0) > 100) out.push("El porcentaje supera 100%.");
  if (p.kind === "cupon" && !p.coupon) out.push("Faltan los datos del cupón.");
  if (p.kind === "cumple" && !p.birthday) out.push("Faltan los datos del beneficio de cumpleaños.");
  if ((p.kind === "reintegro" || p.kind === "descuento") && p.paymentMethodSlugs.length === 0 && !p.bank && !p.wallet) {
    out.push("Indicá con qué banco o billetera aplica.");
  }
  if (p.validFrom && p.validUntil && p.validUntil < p.validFrom) out.push("La vigencia termina antes de empezar.");
  return [...new Set(out)];
}

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { isValidISODate, todayAR } from "@/lib/domain/dates";
import { isSafePublicUrl } from "@/lib/domain/validation";

/** Campos que la IA puede proponer. La persona los revisa antes de enviar; nunca se publican solos. */
export const extractionSchema = z.object({
  merchantName: z.string().max(80).nullable().catch(null),
  bank: z.string().max(60).nullable().catch(null),
  wallet: z.string().max(60).nullable().catch(null),
  kind: z.enum(["reintegro", "descuento", "cupon", "cumple"]).nullable().catch(null),
  discountKind: z.enum(["porcentaje", "monto_fijo", "regalo"]).nullable().catch(null),
  discountValue: z.number().positive().max(100_000_000).nullable().catch(null),
  capAmount: z.number().positive().max(100_000_000).nullable().catch(null),
  validUntil: z
    .string()
    .nullable()
    .catch(null)
    .transform((s) => (s && isValidISODate(s) ? s : null)),
  days: z.array(z.number().int().min(0).max(6)).max(7).nullable().catch(null),
  couponCode: z
    .string()
    .nullable()
    .catch(null)
    .transform((s) => (s && /^[A-Za-z0-9_-]{2,40}$/.test(s) ? s.toUpperCase() : null)),
  conditions: z.string().max(2000).nullable().catch(null),
  sourceUrl: z
    .string()
    .nullable()
    .catch(null)
    .transform((s) => (s && isSafePublicUrl(s) ? s : null)),
  confidence: z.number().min(0).max(1).catch(0),
  notes: z.string().max(300).nullable().catch(null),
});
export type Extraction = z.infer<typeof extractionSchema>;

const PROMPT = (today: string) => `Sos un asistente que lee capturas de promociones de comercios, bancos y billeteras de Argentina.
Extraé SOLO lo que se lee claramente en la imagen. Si un dato no aparece o no estás seguro, devolvé null. No inventes códigos, fechas, topes ni enlaces.
Hoy es ${today}. Las fechas van en formato YYYY-MM-DD (si la imagen dice "hasta el 31/12" sin año, usá el próximo 31/12).
Días de la semana: 0 = domingo, 1 = lunes … 6 = sábado.
"kind": "reintegro" si devuelven dinero después; "descuento" si se descuenta al pagar; "cupon" si es un cupón o código de bienvenida/primera compra; "cumple" si es un beneficio de cumpleaños.
"discountKind": "porcentaje" (ej. 25%), "monto_fijo" (ej. $3.000) o "regalo".
Montos en pesos como número sin separadores (ej. 8000).
Respondé únicamente con un objeto JSON con estas claves:
merchantName, bank, wallet, kind, discountKind, discountValue, capAmount, validUntil, days, couponCode, conditions, sourceUrl, confidence (0 a 1, qué tan legible y completa es la promo), notes (aclaraciones breves en español o null).`;

export async function extractPromoFromImage(bytes: Uint8Array, mediaType: "image/jpeg" | "image/png" | "image/webp"): Promise<Extraction> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: Buffer.from(bytes).toString("base64") } },
          { type: "text", text: PROMPT(todayAR()) },
        ],
      },
    ],
  });
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return parseExtraction(text);
}

/** Toma la respuesta del modelo (puede venir con texto alrededor) y la valida campo por campo. */
export function parseExtraction(text: string): Extraction {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let raw: unknown = {};
  if (start >= 0 && end > start) {
    try {
      raw = JSON.parse(text.slice(start, end + 1));
    } catch {
      raw = {};
    }
  }
  return extractionSchema.parse(raw && typeof raw === "object" ? raw : {});
}

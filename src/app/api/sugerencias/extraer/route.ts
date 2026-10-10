import { NextResponse } from "next/server";
import { extractPromoFromImage } from "@/lib/ai/extract";
import { getCurrentUser } from "@/lib/data";
import { isAiExtractionEnabled } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_IMAGE_BYTES, sniffImageType } from "@/lib/domain/validation";

/** Lee una captura con IA y devuelve campos sugeridos para el formulario. No guarda nada. */
export async function POST(request: Request) {
  if (!isAiExtractionEnabled()) return NextResponse.json({ error: "La lectura con IA no está habilitada." }, { status: 501 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Ingresá para usar esta función." }, { status: 401 });
  const limit = rateLimit(`ia:${user.id}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: "Usaste la lectura con IA muchas veces. Probá en un rato." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });

  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Subí una imagen." }, { status: 400 });
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "La imagen pesa más de 5 MB." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) return NextResponse.json({ error: "Subí una imagen JPG, PNG o WEBP." }, { status: 415 });

  try {
    const fields = await extractPromoFromImage(bytes, type);
    return NextResponse.json({ fields });
  } catch (e) {
    console.error("extraer", e);
    return NextResponse.json({ error: "No pudimos leer la imagen. Completá los datos a mano." }, { status: 502 });
  }
}

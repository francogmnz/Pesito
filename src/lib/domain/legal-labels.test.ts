import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseUala } from "@/lib/ingest/sites/uala";
import { genericMerchantIcon, whereLabel } from "./labels";
import { LONG_CONDITIONS, summarizeConditions } from "./legal";

const uala = readFileSync(path.resolve(import.meta.dirname, "../../../tests/fixtures/uala.html"), "utf8");

describe("resumen de términos y condiciones", () => {
  it("se queda con mínimo, tope, acreditación y no acumulable, sin CUIT ni domicilios", () => {
    const ypf = parseUala(uala, "2026-10-11").find((c) => c.merchantName === "YPF")!;
    expect(ypf.conditions!.length).toBeGreaterThan(LONG_CONDITIONS);
    const bullets = summarizeConditions(ypf.conditions);
    expect(bullets.length).toBeGreaterThan(1);
    expect(bullets.length).toBeLessThanOrEqual(4);
    const all = bullets.join(" ");
    expect(all).toMatch(/m[ií]nimo/i);
    expect(all).toMatch(/no acumulable/i);
    expect(all).not.toMatch(/CUIT|domicilio|BCRA/i);
    for (const b of bullets) expect(b.length).toBeLessThanOrEqual(171);
  });

  it("todas las promos de la fuente dan un resumen limpio", () => {
    for (const c of parseUala(uala, "2026-10-11")) {
      for (const b of summarizeConditions(c.conditions)) expect(b).not.toMatch(/CUIT|con domicilio/i);
    }
  });

  it("no se come oraciones al sacar domicilios", () => {
    const t =
      "Válida hasta el 31/10/2026, exclusivamente para usuarios de Ualá, con domicilio en la República Argentina. Ualá S.A., CUIT 30-71234567-8, con domicilio legal en Av. Siempre Viva 123, CABA, es responsable de la promoción. La Promoción consiste en el reintegro de un 20% (veinte por ciento) del monto, con un tope de $2.000 por usuario por mes. Promoción no acumulable con otras promociones.";
    expect(summarizeConditions(t)).toEqual([
      "Válida hasta el 31/10/2026, exclusivamente para usuarios de Ualá",
      "La Promoción consiste en el reintegro de un 20% del monto, con un tope de $2.000 por usuario por mes",
      "Promoción no acumulable con otras promociones",
    ]);
  });

  it("sin texto no inventa nada", () => {
    expect(summarizeConditions(null)).toEqual([]);
    expect(summarizeConditions("Válido para clientes.")).toEqual([]);
  });
});

describe("dónde aplica y avatar", () => {
  const promo = (name: string, categorySlug: string | null, channel: "local" | "online" | "ambos") => ({ channel, merchant: { name, categorySlug } });

  it("colectivos no dice 'locales'", () => {
    expect(whereLabel(promo("Colectivos", "transporte", "local"))).toBe("En colectivos");
    expect(whereLabel(promo("SUBE", null, "ambos"))).toBe("En colectivos");
    expect(whereLabel(promo("Subte", "transporte", "local"))).toBe("En el subte");
  });

  it("usa el rubro para combustible y delivery", () => {
    expect(whereLabel(promo("YPF", "combustible", "online"))).toBe("Pagando desde la app");
    expect(whereLabel(promo("Shell", "combustible", "local"))).toBe("En estaciones de servicio");
    expect(whereLabel(promo("PedidosYa", "delivery", "online"))).toBe("En la app");
    expect(whereLabel(promo("Coto", "supermercados", "local"))).toBe("Solo en locales");
  });

  it("servicios genéricos llevan ícono en vez de iniciales", () => {
    expect(genericMerchantIcon({ name: "Colectivos", categorySlug: "transporte" })).toBe("bus");
    expect(genericMerchantIcon({ name: "Cabify", categorySlug: "transporte" })).toBe("bus");
    expect(genericMerchantIcon({ name: "Coto", categorySlug: "supermercados" })).toBeNull();
    // "Trento" no es tren
    expect(genericMerchantIcon({ name: "Trento", categorySlug: null })).toBeNull();
  });
});

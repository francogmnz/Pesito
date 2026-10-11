const ARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const ARS2 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** $ 12.450 (con centavos solo si los hay). */
export function formatARS(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const r = Math.round(n * 100) / 100;
  return (Number.isInteger(r) ? ARS : ARS2).format(r).replace(/ /g, " ");
}

/** Acepta "25.000", "25000", "25.000,50", "$ 25.000". */
export function parseARS(input: string | null | undefined): number | null {
  if (input == null) return null;
  let s = String(input).trim().replace(/[$\s]/g, "").replace(/^ARS/i, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function formatPercent(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Number.isInteger(n) ? n : n.toFixed(1).replace(".", ",")}%`;
}

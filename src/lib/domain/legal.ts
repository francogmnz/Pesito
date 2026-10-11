/**
 * Resumen de términos y condiciones: se queda con las frases que cambian la decisión
 * de la persona (mínimo, tope, cuándo devuelven, stock, no acumulable, dónde vale)
 * y descarta lo legal de forma (CUIT, domicilios, responsabilidades, leyes).
 */

const KEEP: [RegExp, number][] = [
  [/m[ií]nimo/i, 3],
  [/tope/i, 3],
  [/no acumulable/i, 3],
  [/agotar stock|redenciones|cupos?/i, 3],
  [/reintegr|devoluci/i, 2],
  [/acredit|disponibiliz|d[ií]as (corridos|h[aá]biles|posteriores)|res[uú]menes?/i, 2],
  [/exclusivamente|solo|s[oó]lamente|[uú]nicamente/i, 1],
  [/v[aá]lid|vigencia|desde .* hasta/i, 1],
  [/por (usuario|persona|cuenta|tarjeta|cliente)/i, 1],
  [/no (aplica|incluye|participa|v[aá]lid)|excluid|excepto/i, 2],
];

const DROP = /responsable|BCRA|\bLey\b|chat|ayuda|m[aá]s informaci[oó]n|fraude|sin efecto|condici[oó]n crediticia|respaldo del accionista|t[eé]rminos y condiciones —|consulte en|reclamo/i;

function clean(text: string): string {
  return text
    .replace(/\((?:[^()]*?(?:CUIT|domicilio|pesos argentinos|“[^”]*”|"[^"]*")[^()]*?)\)/gi, "")
    .replace(/,?\s*CUIT\s*[\d-]+/gi, "")
    .replace(/,?\s*con domicilio(?: legal)? en [^.;\n(]*?(?=,\s*(?:v[aá]lid|para |exclusiv|en adelante)|\.\s|\(|;|\n|$)/gi, "")
    .replace(/(\d[\d.,%]*\s*%?)\s*\((?:[a-záéíóúñ\s]+)\)/gi, "$1")
    .replace(/\s*\(\s*(?:la|el|las|los)\s*(?:\/s)?\s*“[^”]*”\s*\)/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

function shorten(s: string, max = 170): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "")}…`;
}

export function summarizeConditions(text: string | null | undefined, maxBullets = 4): string[] {
  if (!text) return [];
  const sentences = clean(text)
    .split(/(?<=[.;])\s+|\n+/)
    .map((s) => s.trim().replace(/^[-•]\s*/, ""))
    .filter((s) => s.length > 12 && !DROP.test(s));
  const scored = sentences.map((s, i) => ({ s, i, score: KEEP.reduce((acc, [re, w]) => acc + (re.test(s) ? w : 0), 0) }));
  const picked = scored
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, maxBullets)
    .sort((a, b) => a.i - b.i);
  const seen = new Set<string>();
  return picked
    .map((x) => shorten(x.s.replace(/[.;]$/, "")))
    .filter((s) => {
      const k = s.toLowerCase().slice(0, 40);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** Condiciones cortas se muestran tal cual; las largas, resumidas. */
export const LONG_CONDITIONS = 320;

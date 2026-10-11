import { isSafePublicUrl } from "@/lib/domain/validation";

export const USER_AGENT = "PesitoBot/1.0 (+https://pesito-phi.vercel.app; promos de Argentina)";
const MAX_BYTES = 6 * 1024 * 1024;

/** Reglas de robots.txt que aplican a todos los bots (User-agent: *). */
export function robotsDisallows(robotsTxt: string, path: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; pattern: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && (key === "allow" || key === "disallow") && value) current.rules.push({ allow: key === "allow", pattern: value });
    }
  }
  const rules = groups.filter((g) => g.agents.includes("pesitobot")).flatMap((g) => g.rules);
  const applicable = rules.length ? rules : groups.filter((g) => g.agents.includes("*")).flatMap((g) => g.rules);
  // La regla más específica (más larga) gana; ante empate, Allow.
  let best: { allow: boolean; len: number } | null = null;
  for (const r of applicable) {
    const re = new RegExp("^" + r.pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(path) && (!best || r.pattern.length > best.len || (r.pattern.length === best.len && r.allow))) best = { allow: r.allow, len: r.pattern.length };
  }
  return best ? !best.allow : false;
}

/**
 * Descarga una página pública respetando su robots.txt, con límite de tamaño y tiempo.
 * Si robots.txt no se puede leer, se asume permitido (es lo que indica el estándar para 4xx).
 */
export async function fetchPage(url: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (!isSafePublicUrl(url)) throw new Error(`URL no permitida: ${url}`);
  const u = new URL(url);
  const opts = { headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml", "accept-language": "es-AR,es;q=0.9" }, signal: AbortSignal.timeout(20_000) };
  try {
    const robots = await fetcher(`${u.origin}/robots.txt`, opts);
    if (robots.ok && robotsDisallows(await robots.text(), u.pathname + u.search)) {
      throw new Error(`El robots.txt de ${u.host} no permite leer ${u.pathname}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("El robots.txt")) throw e;
  }
  const res = await fetcher(url, opts);
  if (!res.ok) throw new Error(`${u.host} respondió ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error(`La página de ${u.host} es demasiado grande`);
  return text;
}

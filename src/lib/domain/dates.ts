// Fechas en hora de Argentina, trabajando con "YYYY-MM-DD" para evitar corrimientos.

export const AR_TZ = "America/Argentina/Buenos_Aires";

export function todayAR(now: Date = new Date()): string {
  // en-CA devuelve YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: AR_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function parseISODate(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

function toUTC(s: string): number {
  const { y, m, d } = parseISODate(s);
  return Date.UTC(y, m - 1, d);
}

/** Días de a hasta b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

export function addDaysISO(s: string, n: number): string {
  const t = new Date(toUTC(s) + n * 86_400_000);
  return t.toISOString().slice(0, 10);
}

export function dayOfWeek(s: string): number {
  return new Date(toUTC(s)).getUTCDay();
}

export function isValidISODate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseISODate(s);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
export const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const WEEKDAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** "31 de diciembre" (agrega el año si no es el actual). */
export function formatDate(s: string | null, today: string = todayAR()): string {
  if (!s) return "Sin fecha";
  const { y, m, d } = parseISODate(s);
  const base = `${d} de ${MONTHS[m - 1]}`;
  return y === parseISODate(today).y ? base : `${base} de ${y}`;
}

export function formatShortDate(s: string | null): string {
  if (!s) return "—";
  const { y, m, d } = parseISODate(s);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${String(y).slice(2)}`;
}

/** "Lun, Mié y Vie" · "Todos los días" */
export function formatDays(days: number[] | null): string {
  if (!days || days.length === 0 || days.length === 7) return "Todos los días";
  const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (sorted.length === 5 && sorted.every((d) => d >= 1 && d <= 5)) return "De lunes a viernes";
  if (sorted.length === 2 && sorted.includes(0) && sorted.includes(6)) return "Sábados y domingos";
  const names = sorted.map((d) => WEEKDAYS_SHORT[d]);
  return names.length === 1 ? `Solo ${WEEKDAYS[sorted[0]]}` : `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

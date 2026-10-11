import { addDaysISO, daysBetween, daysInMonth, isLeapYear, parseISODate } from "./dates";
import type { BirthdayDetails } from "./types";

/** Fecha del cumpleaños en un año dado (29/2 se festeja el 28/2 en años no bisiestos). */
export function birthdayInYear(day: number, month: number, year: number): string {
  const d = month === 2 && day === 29 && !isLeapYear(year) ? 28 : Math.min(day, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function isValidBirthday(day: unknown, month: unknown): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month)) return false;
  const d = day as number;
  const m = month as number;
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(2024, m); // 2024: bisiesto, admite 29/2
}

/** Próximo cumpleaños desde hoy (hoy incluido). */
export function nextBirthday(day: number, month: number, today: string): string {
  const { y } = parseISODate(today);
  const thisYear = birthdayInYear(day, month, y);
  return thisYear >= today ? thisYear : birthdayInYear(day, month, y + 1);
}

export function daysUntilBirthday(day: number, month: number, today: string): number {
  return daysBetween(today, nextBirthday(day, month, today));
}

/** Ventana en la que vale el beneficio para un cumpleaños dado. */
export function benefitWindow(details: BirthdayDetails, birthday: string): { start: string; end: string } {
  const { y, m } = parseISODate(birthday);
  switch (details.windowKind) {
    case "dia":
      return { start: birthday, end: birthday };
    case "mes":
      return { start: `${y}-${String(m).padStart(2, "0")}-01`, end: `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth(y, m)).padStart(2, "0")}` };
    case "semana":
      return { start: addDaysISO(birthday, -3), end: addDaysISO(birthday, 3) };
    case "rango":
      return { start: addDaysISO(birthday, -details.daysBefore), end: addDaysISO(birthday, details.daysAfter) };
  }
}

export type BirthdayStatus =
  | { state: "activo"; label: string; start: string; end: string }
  | { state: "proximo"; label: string; start: string; end: string; inDays: number };

/** ¿El beneficio está disponible hoy para esta persona? Si no, cuándo empieza. */
export function birthdayStatus(details: BirthdayDetails, day: number, month: number, today: string): BirthdayStatus {
  const { y } = parseISODate(today);
  // La ventana del cumple del año pasado puede seguir abierta (ej. cumple el 31/12, hoy 2/1).
  for (const year of [y - 1, y, y + 1]) {
    const w = benefitWindow(details, birthdayInYear(day, month, year));
    if (today >= w.start && today <= w.end) {
      const left = daysBetween(today, w.end);
      return { state: "activo", label: left === 0 ? "Disponible solo hoy" : `Disponible por ${left + 1} días más`, ...w };
    }
    if (w.start > today) {
      const inDays = daysBetween(today, w.start);
      return { state: "proximo", label: inDays === 1 ? "Empieza mañana" : `Empieza en ${inDays} días`, inDays, ...w };
    }
  }
  // Inalcanzable: la ventana del año siguiente siempre es futura.
  throw new Error("birthdayStatus: sin ventana");
}

export function windowLabel(d: BirthdayDetails): string {
  switch (d.windowKind) {
    case "dia":
      return "Solo el día del cumpleaños";
    case "semana":
      return "La semana del cumpleaños";
    case "mes":
      return "Todo el mes del cumpleaños";
    case "rango":
      return `Desde ${d.daysBefore} días antes hasta ${d.daysAfter} días después`;
  }
}

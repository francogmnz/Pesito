"use client";

import { useActionState, useState } from "react";
import { saveBirthday, type FormState } from "@/app/actions";
import { daysInMonth, MONTHS } from "@/lib/domain/dates";

function DayMonth({ day, month }: { day?: number | null; month?: number | null }) {
  const [m, setM] = useState(month ?? 0);
  const max = m ? daysInMonth(2024, m) : 31; // 2024 es bisiesto: permite 29/2
  return (
    <div className="grid grid-cols-[1fr_1.6fr] gap-2">
      <label>
        <span className="etiqueta">Día</span>
        <select name="day" defaultValue={day ?? ""} required className="campo">
          <option value="" disabled>
            Día
          </option>
          {Array.from({ length: max }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="etiqueta">Mes</span>
        <select name="month" value={m || ""} onChange={(e) => setM(Number(e.target.value))} required className="campo">
          <option value="" disabled>
            Mes
          </option>
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name[0].toUpperCase() + name.slice(1)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Persona registrada: guarda el cumpleaños en su perfil. */
export function SaveBirthdayForm({ day, month }: { day: number | null; month: number | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBirthday, null);
  return (
    <form action={action} className="grid gap-3">
      <DayMonth day={day} month={month} />
      <div className="flex gap-2">
        <button className="btn-primario flex-1" disabled={pending}>
          {pending ? "Guardando…" : day ? "Actualizar" : "Guardar mi cumpleaños"}
        </button>
        {day && (
          <button name="clear" value="1" formNoValidate className="btn-secundario" disabled={pending}>
            Borrar
          </button>
        )}
      </div>
      {state?.message && (
        <p role="status" className={`text-sm font-semibold ${state.ok ? "text-verde-oscuro" : "text-peligro"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}

/** Sin cuenta: consulta sin guardar nada (va por la URL). */
export function TryBirthdayForm({ day, month }: { day?: number | null; month?: number | null }) {
  return (
    <form action="/cumple" className="grid gap-3">
      <DayMonth day={day} month={month} />
      <button className="btn-primario">Ver mis beneficios</button>
    </form>
  );
}

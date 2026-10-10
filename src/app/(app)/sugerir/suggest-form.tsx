"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitSuggestion, type FormState } from "@/app/actions";
import { Icon } from "@/components/icon";
import { WEEKDAYS_SHORT } from "@/lib/domain/dates";

type Kind = "reintegro" | "descuento" | "cupon" | "cumple";
type DKind = "porcentaje" | "monto_fijo" | "regalo";

interface Fields {
  merchantName: string;
  bank: string;
  wallet: string;
  kind: Kind;
  discountKind: DKind;
  discountValue: string;
  capAmount: string;
  validUntil: string;
  days: number[];
  couponCode: string;
  conditions: string;
  sourceUrl: string;
  comments: string;
}

const EMPTY: Fields = {
  merchantName: "",
  bank: "",
  wallet: "",
  kind: "reintegro",
  discountKind: "porcentaje",
  discountValue: "",
  capAmount: "",
  validUntil: "",
  days: [],
  couponCode: "",
  conditions: "",
  sourceUrl: "",
  comments: "",
};

const KINDS: { value: Kind; label: string; icon: string }[] = [
  { value: "reintegro", label: "Reintegro", icon: "wallet" },
  { value: "descuento", label: "Descuento", icon: "tag" },
  { value: "cupon", label: "Cupón", icon: "ticket" },
  { value: "cumple", label: "Cumpleaños", icon: "cake" },
];

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function SuggestForm({ banks, wallets, aiEnabled }: { banks: string[]; wallets: string[]; aiEnabled: boolean }) {
  const [f, setF] = useState<Fields>(EMPTY);
  const [startedAt, setStartedAt] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [ai, setAi] = useState<{ status: "idle" | "loading" | "done" | "error"; message?: string; raw?: string }>({ status: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, data) => {
    const result = await submitSuggestion(prev, data);
    if (result && !result.ok) {
      // React limpia los campos no controlados (la imagen) al terminar la acción: lo reflejamos en la vista previa.
      setPreview(null);
      setAi({ status: "idle" });
    }
    return result;
  }, null);
  const err = state?.errors ?? {};

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  useEffect(() => {
    if (state && !state.ok) document.getElementById("form-error")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state]);

  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((p) => ({ ...p, [k]: v }));

  async function readWithAI() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setAi({ status: "loading" });
    const body = new FormData();
    body.set("image", file);
    try {
      const res = await fetch("/api/sugerencias/extraer", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) return setAi({ status: "error", message: json.error ?? "No pudimos leer la imagen." });
      const x = json.fields as Record<string, unknown>;
      setF((p) => ({
        ...p,
        merchantName: (x.merchantName as string) ?? p.merchantName,
        bank: (x.bank as string) ?? p.bank,
        wallet: (x.wallet as string) ?? p.wallet,
        kind: (x.kind as Kind) ?? p.kind,
        discountKind: (x.discountKind as DKind) ?? p.discountKind,
        discountValue: x.discountValue != null ? String(x.discountValue) : p.discountValue,
        capAmount: x.capAmount != null ? String(x.capAmount) : p.capAmount,
        validUntil: (x.validUntil as string) ?? p.validUntil,
        days: (x.days as number[]) ?? p.days,
        couponCode: (x.couponCode as string) ?? p.couponCode,
        conditions: (x.conditions as string) ?? p.conditions,
        sourceUrl: (x.sourceUrl as string) ?? p.sourceUrl,
      }));
      const conf = Number(x.confidence ?? 0);
      setAi({
        status: "done",
        raw: JSON.stringify(x),
        message: conf < 0.6 ? "Completamos lo que pudimos leer, pero la imagen no es muy clara. Revisá todo antes de enviar." : "Completamos los datos que se leen en la captura. Revisalos antes de enviar.",
      });
    } catch {
      setAi({ status: "error", message: "No pudimos leer la imagen. Completá los datos a mano." });
    }
  }

  return (
    <form action={action} className="grid gap-5" noValidate onFocusCapture={() => setStartedAt((t) => t || Date.now())}>
      <input type="hidden" name="startedAt" value={startedAt || ""} />
      <input type="hidden" name="aiExtraction" value={ai.raw ?? ""} />
      {/* Trampa para bots: invisible para personas y lectores de pantalla. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Sitio web
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      {state && !state.ok && (
        <p id="form-error" role="alert" className="rounded-2xl bg-peligro-suave p-3.5 text-sm font-semibold text-peligro">
          {state.message}
        </p>
      )}

      {/* 1. Captura */}
      <section className="tarjeta p-4">
        <h2 className="font-bold">Captura o foto</h2>
        <p className="mb-3 text-sm text-tinta-2">Opcional, pero nos ayuda a verificarla más rápido. JPG, PNG o WEBP de hasta 5 MB.</p>
        <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed p-3 ${err.image ? "border-peligro" : "border-linea"} has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lima`}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Vista previa de la captura" className="size-16 rounded-xl object-cover" />
          ) : (
            <span className="grid size-16 place-items-center rounded-xl bg-lima-suave text-verde-oscuro">
              <Icon name="camera" size={26} />
            </span>
          )}
          <span className="flex-1 text-sm">
            <b className="block">{preview ? "Cambiar imagen" : "Subir captura"}</b>
            <span className="text-tinta-2">Desde la galería o la cámara</span>
          </span>
          <input
            ref={fileRef}
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setAi({ status: "idle" });
              setPreview(file ? URL.createObjectURL(file) : null);
            }}
          />
        </label>
        {err.image && <FieldError>{err.image}</FieldError>}
        {aiEnabled && preview && (
          <button type="button" onClick={readWithAI} disabled={ai.status === "loading"} className="btn-lima mt-3 w-full">
            <Icon name="wand" size={19} />
            {ai.status === "loading" ? "Leyendo la captura…" : "Completar con IA"}
          </button>
        )}
        {ai.message && (
          <p role="status" className={`mt-2 text-sm ${ai.status === "error" ? "text-peligro" : "text-verde-oscuro"}`}>
            {ai.message}
          </p>
        )}
      </section>

      {/* 2. Qué es */}
      <section className="tarjeta grid gap-4 p-4">
        <fieldset>
          <legend className="etiqueta">Tipo de beneficio</legend>
          <div className="grid grid-cols-4 gap-1.5">
            {KINDS.map((k) => (
              <label key={k.value} className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border border-linea px-1 py-2.5 text-center text-[12px] font-semibold has-[:checked]:border-verde has-[:checked]:bg-lima-suave has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lima">
                <input
                  type="radio"
                  name="kind"
                  value={k.value}
                  checked={f.kind === k.value}
                  onChange={() => setF((p) => ({ ...p, kind: k.value, discountKind: k.value !== "cumple" && p.discountKind === "regalo" ? "porcentaje" : p.discountKind }))}
                  className="sr-only"
                />
                <Icon name={k.icon} size={20} className="text-verde" />
                {k.label}
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Comercio" required error={err.merchantName}>
          <input name="merchantName" value={f.merchantName} onChange={(e) => set("merchantName", e.target.value)} maxLength={80} autoComplete="off" className="campo" placeholder="Ej.: Supermercado, farmacia, app de delivery" />
        </Field>

        {f.kind !== "cumple" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Banco" error={err.bank}>
              <input name="bank" list="bancos" value={f.bank} onChange={(e) => set("bank", e.target.value)} maxLength={60} className="campo" placeholder="Opcional" />
              <datalist id="bancos">
                {banks.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>
            <Field label="Billetera" error={err.wallet}>
              <input name="wallet" list="billeteras" value={f.wallet} onChange={(e) => set("wallet", e.target.value)} maxLength={60} className="campo" placeholder="Opcional" />
              <datalist id="billeteras">
                {wallets.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>
          </div>
        )}
      </section>

      {/* 3. Cuánto y cuándo */}
      <section className="tarjeta grid gap-4 p-4">
        <fieldset>
          <legend className="etiqueta">Beneficio</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ["porcentaje", "Porcentaje"],
                ["monto_fijo", "Monto fijo"],
                ...(f.kind === "cumple" ? [["regalo", "Regalo"]] : []),
              ] as [DKind, string][]
            ).map(([v, l]) => (
              <label key={v} className="cursor-pointer rounded-full border border-linea py-2 text-center text-sm font-semibold has-[:checked]:border-bosque has-[:checked]:bg-bosque has-[:checked]:text-white has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lima">
                <input type="radio" name="discountKind" value={v} checked={f.discountKind === v} onChange={() => set("discountKind", v)} className="sr-only" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
        {f.discountKind !== "regalo" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={f.discountKind === "porcentaje" ? "Porcentaje" : "Descuento ($)"} required error={err.discountValue}>
              <div className="relative">
                <input name="discountValue" inputMode="decimal" value={f.discountValue} onChange={(e) => set("discountValue", e.target.value)} className="campo pr-9" placeholder={f.discountKind === "porcentaje" ? "25" : "3.000"} />
                {f.discountKind === "porcentaje" && <span className="absolute top-1/2 right-3.5 -translate-y-1/2 font-semibold text-tenue">%</span>}
              </div>
            </Field>
            <Field label="Tope ($)" error={err.capAmount}>
              <input name="capAmount" inputMode="decimal" value={f.capAmount} onChange={(e) => set("capAmount", e.target.value)} className="campo" placeholder="Sin tope" />
            </Field>
          </div>
        )}
        <Field label="Vigente hasta" error={err.validUntil}>
          <input type="date" name="validUntil" value={f.validUntil} onChange={(e) => set("validUntil", e.target.value)} className="campo" />
        </Field>
        {f.kind !== "cumple" && (
          <fieldset>
            <legend className="etiqueta">Días en que aplica</legend>
            <div className="grid grid-cols-7 gap-1">
              {DAY_ORDER.map((d) => (
                <label key={d} className="cursor-pointer rounded-xl border border-linea py-2 text-center text-xs font-semibold has-[:checked]:border-verde has-[:checked]:bg-lima has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lima">
                  <input
                    type="checkbox"
                    name="days"
                    value={d}
                    checked={f.days.includes(d)}
                    onChange={(e) => set("days", e.target.checked ? [...f.days, d] : f.days.filter((x) => x !== d))}
                    className="sr-only"
                  />
                  {WEEKDAYS_SHORT[d]}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-tenue">Si aplica todos los días, dejalo vacío.</p>
          </fieldset>
        )}
        {f.kind === "cupon" && (
          <Field label="Código promocional" error={err.couponCode}>
            <input name="couponCode" value={f.couponCode} onChange={(e) => set("couponCode", e.target.value.toUpperCase())} maxLength={40} className="campo font-mono tracking-wider" placeholder="Si tiene código" autoCapitalize="characters" />
          </Field>
        )}
      </section>

      {/* 4. Evidencia y detalle */}
      <section className="tarjeta grid gap-4 p-4">
        <Field label="Enlace oficial" error={err.sourceUrl} hint="La página del banco, billetera o comercio donde está publicada.">
          <input name="sourceUrl" type="url" inputMode="url" value={f.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} maxLength={500} className="campo" placeholder="https://" />
        </Field>
        <Field label="Condiciones" error={err.conditions}>
          <textarea name="conditions" rows={3} value={f.conditions} onChange={(e) => set("conditions", e.target.value)} maxLength={2000} className="campo" placeholder="Ej.: solo con tarjeta de crédito, compra mínima, no acumulable…" />
        </Field>
        <Field label="Comentarios" error={err.comments}>
          <textarea name="comments" rows={2} value={f.comments} onChange={(e) => set("comments", e.target.value)} maxLength={1000} className="campo" placeholder="Algo más que nos ayude a verificarla" />
        </Field>
      </section>

      <div className="grid gap-2">
        <button className="btn-primario w-full" disabled={pending}>
          {pending ? "Enviando…" : "Enviar sugerencia"}
        </button>
        <p className="text-center text-xs text-tenue">La revisamos antes de publicarla. Podés seguir su estado en tu perfil.</p>
      </div>
    </form>
  );
}

function Field({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className={error ? "[&_.campo]:border-peligro" : ""}>
      <label className="block">
        <span className="etiqueta">
          {label}
          {required && <span className="text-verde"> *</span>}
        </span>
        {children}
      </label>
      {hint && !error && <p className="mt-1 text-xs text-tenue">{hint}</p>}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-sm font-semibold text-peligro">{children}</p>;
}

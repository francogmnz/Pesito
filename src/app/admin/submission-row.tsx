import Link from "next/link";
import { Icon } from "@/components/icon";
import { KIND_LABEL } from "@/lib/domain/labels";
import { STATUS_LABEL } from "@/lib/domain/moderation";
import type { Submission } from "@/lib/domain/types";

const STATUS_TONE: Record<Submission["status"], string> = {
  pendiente: "bg-lima text-bosque",
  en_revision: "bg-alerta-suave text-alerta",
  aprobada: "bg-lima-suave text-verde-oscuro",
  rechazada: "bg-peligro-suave text-peligro",
};

const CHANGE_LABEL = { nueva: "Nueva", cambio: "Cambio", baja: "Baja" } as const;

export function SubmissionRow({ s, selectable = false }: { s: Submission; selectable?: boolean }) {
  const canSelect = selectable && !s.publishedPromotionId;
  return (
    <li className="flex items-center">
      {selectable && (
        <label className="grid self-stretch place-items-center pl-3.5">
          <span className="sr-only">Marcar {s.payload.title}</span>
          <input type="checkbox" name="ids" value={s.id} disabled={!canSelect} className="size-5 accent-[#5c8c3b]" />
        </label>
      )}
      <Link href={`/admin/revision/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3 p-3.5 hover:bg-crema/60">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full ${s.origin === "usuario" ? "bg-lima-suave text-verde-oscuro" : "bg-bosque text-lima"}`} title={s.origin === "usuario" ? "Sugerida por una persona" : "Detectada por la automatización"}>
          <Icon name={s.origin === "usuario" ? "user" : "bolt"} size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{s.payload.title || s.payload.merchantName}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-tinta-2">
            <span>{s.payload.merchantName}</span>
            <span>· {KIND_LABEL[s.payload.kind]}</span>
            {s.changeType !== "nueva" && <span className="font-semibold text-alerta">· {CHANGE_LABEL[s.changeType]}</span>}
            <span>· {s.origin === "usuario" ? (s.submitterName ?? "Usuario") : (s.sourceName ?? "Automatización")}</span>
            <span>· {new Date(s.createdAt).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </p>
          {s.flagReasons.length > 0 && (
            <p className="mt-1 flex items-center gap-1 truncate text-xs font-semibold text-alerta">
              <Icon name="alert" size={13} /> {s.flagReasons.join(" · ")}
            </p>
          )}
        </div>
        {s.imagePath && <Icon name="image" size={18} className="text-tenue" label="Tiene captura" />}
        <span className={`chip ${STATUS_TONE[s.status]}`}>{s.publishedPromotionId ? "Publicada" : STATUS_LABEL[s.status]}</span>
      </Link>
    </li>
  );
}

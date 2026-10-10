import { Logo } from "@/components/brand";
import { Icon } from "@/components/icon";
import { Notice, PageHeader } from "@/components/ui";
import { demoSignIn } from "@/app/actions";
import { getCurrentUser, getRepo } from "@/lib/data";
import { safeNext } from "@/lib/request";
import { MagicLinkForm } from "./magic-link-form";

export const metadata = { title: "Ingresar" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ volver?: string }> }) {
  const { volver } = await searchParams;
  const next = safeNext(volver);
  const [repo, user] = await Promise.all([getRepo(), getCurrentUser()]);

  return (
    <div>
      <PageHeader title="Ingresar" back="/" />
      <div className="flex justify-center py-4">
        <Logo size="md" />
      </div>
      {repo.mode === "demo" ? (
        <div className="grid gap-3">
          <Notice>
            Estás en <b>modo demo</b>: no hay base de datos conectada y todo se guarda en memoria. Elegí con qué perfil querés probar.
            {user && (
              <>
                {" "}
                Ahora estás como <b>{user.name}</b>.
              </>
            )}
          </Notice>
          {(
            [
              { who: "usuario", title: "Lucas", text: "Persona usuaria: guarda promos, usa cupones, sugiere promos.", icon: "user" },
              { who: "admin", title: "Equipo Pesito", text: "Administrador: revisa sugerencias y reportes, y publica promos.", icon: "shield" },
              { who: "anonimo", title: "Sin cuenta", text: "Navegá como alguien que todavía no se registró.", icon: "eye" },
            ] as const
          ).map((o) => (
            <form key={o.who} action={demoSignIn}>
              <input type="hidden" name="who" value={o.who} />
              <input type="hidden" name="volver" value={o.who === "admin" && next === "/" ? "/admin" : next} />
              <button className="tarjeta flex w-full items-center gap-3 p-4 text-left">
                <span className="grid size-11 place-items-center rounded-full bg-lima-suave text-verde-oscuro">
                  <Icon name={o.icon} />
                </span>
                <span className="flex-1">
                  <b className="block">{o.title}</b>
                  <span className="text-sm text-tinta-2">{o.text}</span>
                </span>
                <Icon name="chevronRight" className="text-tenue" />
              </button>
            </form>
          ))}
        </div>
      ) : (
        <MagicLinkForm next={next} />
      )}
    </div>
  );
}

import { Logo } from "@/components/brand";
import { Icon } from "@/components/icon";
import { Notice, PageHeader } from "@/components/ui";
import { demoSignIn, signInWithGoogle } from "@/app/actions";
import { getCurrentUser, getRepo } from "@/lib/data";
import { safeNext } from "@/lib/request";
import { MagicLinkForm } from "./magic-link-form";

export const metadata = { title: "Ingresar" };

const ERRORS: Record<string, string> = {
  google: "No pudimos abrir el ingreso con Google. Probá de nuevo o usá el enlace por email.",
  enlace: "No pudimos completar el ingreso. Probá de nuevo.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ volver?: string; error?: string }> }) {
  const { volver, error } = await searchParams;
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
        <div className="grid gap-3">
          {error && ERRORS[error] && <Notice tone="alerta">{ERRORS[error]}</Notice>}
          <form action={signInWithGoogle}>
            <input type="hidden" name="volver" value={next} />
            <button className="tarjeta flex w-full items-center justify-center gap-3 p-3.5 font-semibold">
              <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.6 5.9c4.4-4.1 6.7-10.1 6.7-17.4z" />
                <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.500 0 20.100 0 24s1 7.500 2.600 10.800l7.900-6.200z" />
                <path fill="#34A853" d="M24 48c6.300 0 11.700-2.100 15.600-5.700l-7.600-5.900c-2.100 1.400-4.800 2.300-8 2.300-6.300 0-11.600-4.100-13.500-9.900l-7.900 6.200C6.500 42.600 14.600 48 24 48z" />
              </svg>
              Entrar con Google
            </button>
          </form>
          <p className="text-center text-xs text-tenue">o, si preferís, con tu email</p>
          <MagicLinkForm next={next} />
        </div>
      )}
    </div>
  );
}

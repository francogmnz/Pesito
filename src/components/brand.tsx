import Image from "next/image";
import { hash53 } from "@/lib/domain/fingerprint";
import { CATEGORY_ICON, genericMerchantIcon } from "@/lib/domain/labels";
import { Icon } from "./icon";
import type { Merchant, PaymentMethod } from "@/lib/domain/types";

/** Logo: el carpincho + "Pesito" en letra redondeada. Con frase debajo si withSlogan. */
export function Logo({ size = "md", withSlogan = true, inverted = false }: { size?: "sm" | "md" | "lg"; withSlogan?: boolean; inverted?: boolean }) {
  const h = { sm: 40, md: 56, lg: 96 }[size];
  return (
    <span className="inline-flex items-center gap-1.5" aria-label="Pesito" role="img">
      <Image src="/brand/carpincho-logo.svg" alt="" width={h} height={h} style={{ width: h, height: h }} loading="eager" unoptimized />
      <span className="flex flex-col">
        <span className={`font-marca leading-[0.85] font-extrabold tracking-tight ${inverted ? "text-lima" : "text-bosque"}`} style={{ fontSize: h * 0.72 }}>
          Pesito
        </span>
        {withSlogan && size !== "sm" && <span className="mt-1 text-xs font-medium text-tinta-2">{SLOGAN}</span>}
      </span>
    </span>
  );
}

export const SLOGAN = "Todas tus promos en un solo lugar.";

const POSES = {
  logo: "/brand/carpincho-logo.svg",
  saludo: "/brand/carpincho-saludo.svg",
  celular: "/brand/carpincho-celular.svg",
  corazon: "/brand/carpincho-corazon.svg",
  buscando: "/brand/carpincho-buscando.svg",
  cumple: "/brand/carpincho-cumple.svg",
} as const;

export type Pose = keyof typeof POSES;

/** El carpincho de Pesito. Decorativo: no se lee en voz alta. */
export function Mascot({ pose = "saludo", width = 96, className = "", eager = false }: { pose?: Pose; width?: number; className?: string; eager?: boolean }) {
  return <Image src={POSES[pose]} alt="" width={240} height={240} loading={eager ? "eager" : "lazy"} unoptimized className={`h-auto select-none ${className}`} style={{ width }} />;
}

// Tonos para avatares sin logo: derivados de la paleta, legibles con texto oscuro o claro.
const AVATAR_TONES = [
  { bg: "#e9f9cf", fg: "#2f4a1d" },
  { bg: "#dbe8cf", fg: "#2f4a1d" },
  { bg: "#19271f", fg: "#c5f277" },
  { bg: "#5c8c3b", fg: "#ffffff" },
  { bg: "#fde9c8", fg: "#7a4a0c" },
  { bg: "#e4ece6", fg: "#19271f" },
];

function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

/**
 * Logo del comercio solo si su uso está autorizado. Si no: el ícono del rubro para
 * servicios genéricos (colectivos, subte…) o las iniciales con un sello del rubro.
 */
export function MerchantAvatar({
  merchant,
  size = 44,
}: {
  merchant: Pick<Merchant, "name" | "logoUrl" | "logoAuthorized"> & { categorySlug?: string | null };
  size?: number;
}) {
  if (merchant.logoAuthorized && merchant.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={merchant.logoUrl} alt={merchant.name} width={size} height={size} className="shrink-0 rounded-2xl border border-linea bg-white object-contain p-0.5" style={{ width: size, height: size }} />;
  }
  const generic = genericMerchantIcon(merchant);
  if (generic) {
    return (
      <span aria-hidden className="inline-grid shrink-0 place-items-center rounded-2xl bg-bosque text-lima" style={{ width: size, height: size }}>
        <Icon name={generic} size={Math.round(size * 0.56)} />
      </span>
    );
  }
  const tone = AVATAR_TONES[parseInt(hash53(merchant.name).slice(-4), 36) % AVATAR_TONES.length];
  const badge = size >= 34 && merchant.categorySlug ? CATEGORY_ICON[merchant.categorySlug] : null;
  return (
    <span
      aria-hidden
      className="relative inline-grid shrink-0 place-items-center rounded-2xl font-extrabold tracking-tight"
      style={{ width: size, height: size, background: tone.bg, color: tone.fg, fontSize: size * 0.36 }}
    >
      {initials(merchant.name)}
      {badge && (
        <span className="absolute -right-1 -bottom-1 grid place-items-center rounded-full border-2 border-superficie bg-lima text-bosque" style={{ width: size * 0.42, height: size * 0.42 }}>
          <Icon name={badge} size={Math.round(size * 0.26)} />
        </span>
      )}
    </span>
  );
}

export function PaymentDot({ pm, size = 28 }: { pm: Pick<PaymentMethod, "name" | "color">; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
      style={{ width: size, height: size, background: pm.color ?? "#5c8c3b", fontSize: size * 0.34 }}
    >
      {initials(pm.name)}
    </span>
  );
}

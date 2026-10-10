import Image from "next/image";
import { hash53 } from "@/lib/domain/fingerprint";
import type { Merchant, PaymentMethod } from "@/lib/domain/types";

export function Logo({ size = "md", withSlogan = true }: { size?: "sm" | "md" | "lg"; withSlogan?: boolean }) {
  const h = { sm: 34, md: 44, lg: 96 }[size];
  if (!withSlogan) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Image src="/brand/mascota.png" alt="" width={h} height={h} className="h-auto" style={{ width: h }} loading="eager" />
        <span className="text-[26px] leading-none font-black tracking-tight text-bosque">Pesito</span>
      </span>
    );
  }
  return <Image src="/brand/pesito-logo.png" alt="Pesito · Cada pesito cuenta." width={Math.round(h * 2.73)} height={h} className="h-auto" style={{ width: Math.round(h * 2.73) }} loading="eager" />;
}

const POSES = {
  saludo: { src: "/brand/mascota-saludo.png", w: 305, h: 276 },
  celular: { src: "/brand/mascota-celular.png", w: 244, h: 244 },
  corazon: { src: "/brand/mascota-corazon.png", w: 264, h: 259 },
  camina: { src: "/brand/mascota-camina.png", w: 284, h: 265 },
  changuito: { src: "/brand/mascota-changuito.png", w: 377, h: 239 },
  logo: { src: "/brand/mascota.png", w: 554, h: 558 },
} as const;

export type Pose = keyof typeof POSES;

/** La moneda de Pesito. Decorativa: no se lee en voz alta. */
export function Mascot({ pose = "saludo", width = 96, className = "", eager = false }: { pose?: Pose; width?: number; className?: string; eager?: boolean }) {
  const p = POSES[pose];
  return <Image src={p.src} alt="" width={p.w} height={p.h} loading={eager ? "eager" : "lazy"} className={`h-auto select-none ${className}`} style={{ width }} />;
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

/** Logo del comercio solo si su uso está autorizado; si no, iniciales. */
export function MerchantAvatar({ merchant, size = 44 }: { merchant: Pick<Merchant, "name" | "logoUrl" | "logoAuthorized">; size?: number }) {
  if (merchant.logoAuthorized && merchant.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={merchant.logoUrl} alt={merchant.name} width={size} height={size} className="shrink-0 rounded-2xl bg-white object-contain" />;
  }
  const tone = AVATAR_TONES[parseInt(hash53(merchant.name).slice(-4), 36) % AVATAR_TONES.length];
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-2xl font-extrabold tracking-tight"
      style={{ width: size, height: size, background: tone.bg, color: tone.fg, fontSize: size * 0.36 }}
    >
      {initials(merchant.name)}
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

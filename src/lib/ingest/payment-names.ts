/**
 * Bancos, billeteras y tarjetas tal como aparecen escritos en los textos legales de los comercios.
 * `slug` es el del catálogo de medios de pago; null = todavía no está en el catálogo (queda como texto y va con aviso).
 * `network` = marca de tarjeta (Visa, Amex): solo cuenta si no se nombra un banco o billetera.
 */
export interface NamedPayment {
  slug: string | null;
  name: string;
  network?: boolean;
}

const TABLE: (NamedPayment & { re: RegExp })[] = [
  { slug: "santander", name: "Santander", re: /\bsantander\b/ },
  { slug: "galicia", name: "Galicia", re: /\bgalicia\b/ },
  { slug: "bbva", name: "BBVA", re: /\bbbva\b/ },
  { slug: "macro", name: "Macro", re: /\bmacro\b/ },
  { slug: "banco-nacion", name: "Banco Nación", re: /\bbanco (de la )?nacion\b|\bbna\b/ },
  { slug: "provincia", name: "Banco Provincia", re: /\bbanco (de la )?provincia\b/ },
  { slug: "cuenta-dni", name: "Cuenta DNI", re: /\bcuenta dni\b/ },
  { slug: "ciudad", name: "Banco Ciudad", re: /\bbanco ciudad\b/ },
  { slug: "supervielle", name: "Supervielle", re: /\bsupervielle\b/ },
  { slug: "credicoop", name: "Credicoop", re: /\bcredicoop\b/ },
  { slug: "comafi", name: "Comafi", re: /\bcomafi\b/ },
  { slug: "icbc", name: "ICBC", re: /\bicbc\b/ },
  { slug: "hipotecario", name: "Banco Hipotecario", re: /\bhipotecario\b/ },
  { slug: "patagonia", name: "Banco Patagonia", re: /\bbanco patagonia\b/ },
  { slug: "brubank", name: "Brubank", re: /\bbrubank\b/ },
  { slug: "banco-columbia", name: "Banco Columbia", re: /\bcolumbia\b/ },
  { slug: "banco-entre-rios", name: "Banco Entre Ríos", re: /\bbanco (de )?entre rios\b/ },
  { slug: "banco-san-juan", name: "Banco San Juan", re: /\bbanco (de )?san juan\b/ },
  { slug: "banco-santa-fe", name: "Banco Santa Fe", re: /\bbanco (de )?santa fe\b/ },
  { slug: "banco-santa-cruz", name: "Banco Santa Cruz", re: /\bbanco (de )?santa cruz\b/ },
  { slug: "bancor", name: "Bancor", re: /\bbancor\b|\bbanco de cordoba\b/ },
  { slug: "reba", name: "Reba", re: /\breba\b/ },
  { slug: "banco-del-sol", name: "Banco del Sol", re: /\bbanco del sol\b/ },
  { slug: "naranja-x", name: "Naranja X", re: /\bnaranja( ?x)?\b/ },
  { slug: "mercado-pago", name: "Mercado Pago", re: /\bmercado ?pago\b/ },
  { slug: "uala", name: "Ualá", re: /\buala\b/ },
  { slug: "personal-pay", name: "Personal Pay", re: /\bpersonal pay\b/ },
  { slug: "prex", name: "Prex", re: /\bprex\b/ },
  { slug: "modo", name: "MODO", re: /\bmodo\b/ },
  { slug: "yoy", name: "YOY", re: /\byoy\b/ },
  { slug: "cabal", name: "Cabal", network: true, re: /\bcabal\b/ },
  { slug: null, name: "OSDE", re: /\bosde\b/ },
  { slug: null, name: "Clarín 365", re: /\bclarin 365\b/ },
  { slug: null, name: "Bonda", re: /\bbonda\b/ },
  { slug: "amex", name: "American Express", network: true, re: /\bamerican express\b|\bamex\b/ },
  { slug: "visa", name: "Visa", network: true, re: /\bvisa\b/ },
  { slug: "mastercard", name: "Mastercard", network: true, re: /\bmaster ?card\b/ },
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Medios de pago nombrados en un texto, en el orden en que aparecen. */
export function paymentsNamedIn(text: string): NamedPayment[] {
  const t = norm(text);
  return TABLE.map((e) => ({ e, at: t.search(e.re) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ e }) => ({ slug: e.slug, name: e.name, ...(e.network ? { network: true } : {}) }));
}

import type { RawCandidate } from "../adapters";
import { capPeriodFrom, findCouponCode, parseDays, parseMoneyIn, parsePercent, parseValidity, stripTags, truncate } from "../html";
import { paymentsNamedIn } from "../payment-names";

export const FARMAONLINE_URL = "https://www.farmaonline.com/promociones-bancarias";

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const DAY_WORD = /lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?/i;

/** Hasta dónde el texto habla de quién accede a la promo; después vienen exclusiones ("no acumulable con…", "excepto Mercado Pago"). */
const EXCLUSIONS = /no (es )?acumulable|no aplica|no participan?|no v[aá]lid[ao]|except[ou]|quedan excluid|exclu[iy]/i;

/**
 * Promos bancarias de Farmaonline (tienda VTEX): cada promo es una tarjeta ya armada en el HTML,
 * con un titular ("20% DE REINTEGRO EN COMPRAS MAYORES A $70.000 A TRAVÉS DE MODO") y el texto legal desplegable.
 * El banco no viene como dato (es un logo): se deduce del legal. Las tarjetas de solo cuotas se saltean.
 */
export function parseFarmaonline(html: string, today: string): RawCandidate[] {
  const cards = html.split(/<div class="[^"]*promocardContainer[^"]*">/).slice(1);
  if (!cards.length) throw new Error("Farmaonline: no se encontraron promociones en la página");
  const out: RawCandidate[] = [];
  const seen = new Map<string, number>();

  for (const card of cards) {
    const head = oneLine(stripTags(card.split(/<span[^>]*promocard__container_arrow_down/)[0].replace(/^[\s\S]*?promocard__container_card_text[^>]*>/, "")));
    const body = (card.split(/promocard__container_disclosure_content[^"]*">/)[1] ?? "").split(/<div class="[^"]*(?:promocardContainer|flex-layout|vtex-rich-text)/)[0];
    const legal = oneLine(stripTags(body));
    const pct = parsePercent(head);
    if (pct == null || !legal) continue; // solo cuotas

    const flags: string[] = [];
    const notes: string[] = [];
    if (/\bhasta\s+\d{1,3}\s*%/i.test(head)) flags.push("El porcentaje es «hasta»: puede ser menor según el producto.");
    if ((head.match(/\d{1,3}\s*%/g) ?? []).length > 1) flags.push("El titular tiene más de un porcentaje: revisar cuál corresponde.");

    // Medio de pago: lo que el legal nombra antes de las exclusiones.
    const scope = legal.slice(0, legal.search(EXCLUSIONS) < 0 ? legal.length : legal.search(EXCLUSIONS));
    const named = paymentsNamedIn(scope);
    const manyBanks = /(bancos|entidades) (asociad|adherid|participantes)/i.test(legal);
    const entities = named.filter((p) => !p.network && p.slug !== "modo");
    const viaModo = named.some((p) => p.slug === "modo");
    // "Tarjetas American Express emitidas por… Santander, Galicia": la promo es de Amex, los bancos son solo emisores.
    const pay = named[0]?.slug === "amex" ? [named[0]] : manyBanks ? (viaModo ? [{ slug: "modo", name: "MODO" }] : []) : entities.length ? entities : viaModo ? [{ slug: "modo", name: "MODO" }] : named.filter((p) => p.network);
    const code = findCouponCode(legal);
    if (!pay.length && !code) flags.push("No se reconoció el medio de pago en el texto legal.");
    // Varios bancos nombrados uno por uno ("emitidas por Banco Entre Ríos, San Juan…") es una promo compartida; una mezcla rara se revisa.
    if (pay.length > 1 && pay.every((p) => p.slug) && pay.length <= 5) notes.push(`Vale con varios bancos: ${pay.map((p) => p.name).join(", ")}.`);
    else if (pay.length > 1) flags.push(`Aparecen varios medios de pago (${pay.map((p) => p.name).join(", ")}): verificar.`);
    const unknown = pay.filter((p) => !p.slug);
    if (unknown.length) flags.push(`${unknown.map((p) => p.name).join(", ")} no es un medio de pago del catálogo (es un club de beneficios): revisar cómo cargarla.`);
    const firstPurchase = /primera compra/i.test(legal);
    if (firstPurchase) notes.push("Es solo para la primera compra: quedó como promo para clientes nuevos.");
    const segment = legal.match(/jubilad[oa]s?|exclusivo para (socios|usuarios)[^.,]{0,40}|exclusivo para clientes con[^.,]{0,40}|solo para socios[^.,]{0,40}|paquete de productos/i);
    if (segment) flags.push(`Puede ser solo para un grupo de clientes (“${segment[0]}”).`);

    const capText = `${head}. ${legal}`.match(/tope[^$.]{0,40}\$\s?[\d.]+[^.]{0,50}/i)?.[0] ?? null;
    const cap = parseMoneyIn(capText);
    const capHasPeriod = /seman|mensual|por mes|al mes|diari|por d[ií]a|por (viaje|compra|pedido|transacci)|por promoci/i.test(capText ?? "");
    if (cap && !capHasPeriod) notes.push("El tope no aclara el período: se cargó como tope de toda la promo.");
    if (!cap && !/sin tope/i.test(legal)) notes.push("La página no menciona tope.");
    const minText = `${head}. ${legal}`.match(/compras? (?:mayor(?:es)?|superior(?:es)?|iguales)[^$.]{0,25}\$\s?[\d.]+/i)?.[0] ?? null;

    const { from, until } = parseValidity(legal, today);
    if (!until) flags.push("No se encontró hasta cuándo vale en el texto legal.");

    // Días: el titular manda ("TODOS LOS MIÉRCOLES"); si no dice, la frase de vigencia ("Válida todos los martes…").
    const validPhrase = legal.match(/v[aá]lid[ao]s?[^.]{0,120}/i)?.[0] ?? "";
    const dayText = DAY_WORD.test(head) ? head : DAY_WORD.test(validPhrase) ? validPhrase : "";
    const days = dayText ? parseDays(dayText.replace(/todos los/gi, "").split(/,|\sy\s/)) : null;

    const reintegro = /reintegro/i.test(head);
    const who = pay.map((p) => p.name).join(" o ");
    const key = `${pay.map((p) => p.slug ?? p.name).join("+") || "x"}:${pct}:${(days ?? []).join("") || "todos"}${code ? `:${code.toUpperCase()}` : ""}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);

    out.push({
      // Sin identificador propio: medio de pago + porcentaje + días. Si cambian tope o fechas, sigue siendo la misma promo.
      externalId: `farmaonline:${key}${n > 1 ? `:${n}` : ""}`.toLowerCase().replace(/\s+/g, "-").slice(0, 120),
      ...(flags.length ? { flags } : {}),
      ...(notes.length ? { notes } : {}),
      kind: code ? "cupon" : reintegro ? "reintegro" : "descuento",
      audience: firstPurchase ? "nuevos_clientes" : "todos",
      merchantName: "Farmaonline",
      categorySlug: "farmacias",
      title: truncate(`${pct}% de ${reintegro ? "reintegro" : "descuento"} en Farmaonline${who ? ` con ${who}` : ""}`, 140) ?? undefined,
      summary: truncate(head.charAt(0) + head.slice(1).toLowerCase(), 280),
      bank: unknown[0]?.name ?? null,
      paymentMethodSlugs: pay.flatMap((p) => (p.slug ? [p.slug] : [])),
      discountKind: "porcentaje",
      discountValue: pct,
      capAmount: cap,
      capPeriod: !cap ? "sin_tope" : capHasPeriod ? capPeriodFrom(capText) : "vigencia",
      minPurchase: parseMoneyIn(minText),
      validFrom: from,
      validUntil: until,
      daysOfWeek: days,
      channel: "online",
      conditions: truncate(legal, 3800),
      requirements: [],
      sourceUrl: FARMAONLINE_URL,
      coupon: code ? { redemption: "codigo", code: code.toUpperCase(), newCustomersOnly: false, requiresExternalSignup: false, externalPlatform: null } : null,
    });
  }
  return out;
}

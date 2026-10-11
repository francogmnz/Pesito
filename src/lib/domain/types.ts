// Tipos de dominio de Pesito. Reflejan el modelo de supabase/migrations.

export type PromoKind = "reintegro" | "descuento" | "cupon" | "cumple";
export type Audience = "todos" | "nuevos_clientes" | "cumpleanieros" | "miembros";
export type PromoStatus = "borrador" | "en_revision" | "publicada" | "vencida" | "archivada";
export type DiscountKind = "porcentaje" | "monto_fijo" | "regalo";
export type CapPeriod = "compra" | "dia" | "semana" | "mes" | "vigencia" | "sin_tope";
export type SalesChannel = "online" | "local" | "ambos";
export type PaymentKind = "banco" | "billetera" | "tarjeta";
export type SourceKind = "oficial" | "autorizada" | "comunidad";
export type UserRole = "usuario" | "admin";

export const REQUIREMENTS = [
  "registro_previo",
  "presentar_dni",
  "programa_fidelizacion",
  "primera_compra",
  "solo_app",
  "cuenta_nueva",
] as const;
export type Requirement = (typeof REQUIREMENTS)[number];

export interface Category {
  id: number;
  slug: string;
  name: string;
  icon: string;
}

export interface Merchant {
  id: string;
  slug: string;
  name: string;
  categorySlug: string | null;
  logoUrl: string | null;
  logoAuthorized: boolean;
}

export interface PaymentMethod {
  id: string;
  slug: string;
  name: string;
  kind: PaymentKind;
  color: string | null;
}

export interface CouponDetails {
  redemption: "codigo" | "link" | "automatico";
  code: string | null;
  newCustomersOnly: boolean;
  requiresExternalSignup: boolean;
  externalPlatform: string | null;
}

export interface BirthdayDetails {
  windowKind: "dia" | "semana" | "mes" | "rango";
  daysBefore: number;
  daysAfter: number;
  benefit: "descuento" | "regalo" | "cupon" | "experiencia";
  loyaltyProgram: string | null;
}

export interface Promotion {
  id: string;
  kind: PromoKind;
  audience: Audience;
  merchant: Merchant;
  title: string;
  summary: string | null;
  discountKind: DiscountKind;
  discountValue: number | null;
  capAmount: number | null;
  capPeriod: CapPeriod;
  minPurchase: number | null;
  validFrom: string | null; // YYYY-MM-DD
  validUntil: string | null; // YYYY-MM-DD
  daysOfWeek: number[] | null; // 0 = domingo
  channel: SalesChannel;
  conditions: string | null;
  requirements: Requirement[];
  sourceUrl: string | null;
  sourceName: string | null;
  sourceKind: SourceKind | null;
  externalId: string | null;
  status: PromoStatus;
  fingerprint: string;
  paymentMethods: PaymentMethod[];
  coupon: CouponDetails | null;
  birthday: BirthdayDetails | null;
  lastVerifiedAt: string | null;
  updatedAt: string;
  /** Solo en modo demo: datos inventados para mostrar el diseño. */
  isSample: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  birthdayDay: number | null;
  birthdayMonth: number | null;
  paymentMethodIds: string[];
}

export interface PromoUserState {
  savedAt: string | null;
  usedAt: string | null;
}

export type ReportReason = "vencido" | "codigo_invalido" | "datos_incorrectos" | "otro";
export type ReportStatus = "abierto" | "resuelto" | "descartado";

export interface PromotionReport {
  id: string;
  promotionId: string;
  promotionTitle: string;
  merchantName: string;
  userId: string;
  reason: ReportReason;
  comment: string | null;
  status: ReportStatus;
  createdAt: string;
}

export type SubmissionOrigin = "automatizacion" | "usuario";
export type SubmissionStatus = "pendiente" | "en_revision" | "aprobada" | "rechazada";
export type SubmissionChange = "nueva" | "cambio" | "baja";

/**
 * Candidato a promoción: lo que envía una persona o detecta la automatización.
 * El admin lo corrige antes de aprobarlo; recién al publicarlo se crea la promoción.
 */
export interface PromoPayload {
  kind: PromoKind;
  audience: Audience;
  merchantName: string;
  categorySlug: string | null;
  title: string;
  summary: string | null;
  bank: string | null;
  wallet: string | null;
  paymentMethodSlugs: string[];
  discountKind: DiscountKind;
  discountValue: number | null;
  capAmount: number | null;
  capPeriod: CapPeriod;
  minPurchase: number | null;
  validFrom: string | null;
  validUntil: string | null;
  daysOfWeek: number[] | null;
  channel: SalesChannel;
  conditions: string | null;
  requirements: Requirement[];
  sourceUrl: string | null;
  externalId: string | null;
  coupon: CouponDetails | null;
  birthday: BirthdayDetails | null;
}

export interface Submission {
  id: string;
  origin: SubmissionOrigin;
  status: SubmissionStatus;
  changeType: SubmissionChange;
  sourceId: string | null;
  sourceName: string | null;
  payload: PromoPayload;
  diff: Record<string, { antes: unknown; despues: unknown }> | null;
  flagReasons: string[];
  fingerprint: string | null;
  matchedPromotionId: string | null;
  publishedPromotionId: string | null;
  duplicateOf: string | null;
  submittedBy: string | null;
  submitterName: string | null;
  imagePath: string | null;
  aiExtraction: Record<string, unknown> | null;
  comments: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface ModerationEvent {
  id: string;
  entityType: "submission" | "promotion" | "report";
  entityId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorName: string | null;
  note: string | null;
  createdAt: string;
}

export interface Source {
  id: string;
  name: string;
  url: string;
  kind: SourceKind;
  active: boolean;
  adapter: string | null;
  config: Record<string, unknown>;
  autoPublish: boolean;
  lastRunAt: string | null;
}

export type SourceRecordState = "nueva" | "vigente" | "vencida" | "omitida" | "sin_datos" | "error";

/**
 * Una página de una fuente que se lee por tandas (por ejemplo, cada promo de MODO).
 * Guarda qué pasó la última vez para no volver a leer lo que ya venció.
 */
export interface SourceRecord {
  key: string;
  state: SourceRecordState;
  externalId: string | null;
}

export interface IngestionRun {
  id: string;
  sourceId: string | null;
  sourceName: string | null;
  startedAt: string;
  finishedAt: string | null;
  found: number;
  created: number;
  updated: number;
  verified: number;
  flagged: number;
  error: string | null;
}

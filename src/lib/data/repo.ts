import type { Listing, ListingChange, ListingInput, Product, ProductSummary } from "@/lib/domain/products";
import type {
  Category,
  IngestionRun,
  Merchant,
  ModerationEvent,
  PaymentMethod,
  PromoKind,
  PromoPayload,
  PromoStatus,
  PromoUserState,
  Promotion,
  PromotionReport,
  ReportReason,
  ReportStatus,
  Source,
  SourceRecord,
  SourceRecordState,
  Submission,
  SubmissionOrigin,
  SubmissionStatus,
  UserProfile,
} from "@/lib/domain/types";

export interface PromotionFilter {
  kinds?: PromoKind[];
  statuses?: PromoStatus[]; // por defecto: ["publicada"]
  q?: string;
  categorySlug?: string;
  merchantSlug?: string;
  paymentMethodIds?: string[];
  ids?: string[];
  limit?: number;
}

export interface NewSubmission {
  origin: SubmissionOrigin;
  changeType?: "nueva" | "cambio" | "baja";
  sourceId?: string | null;
  payload: PromoPayload;
  fingerprint: string;
  flagReasons?: string[];
  diff?: Submission["diff"];
  matchedPromotionId?: string | null;
  submittedBy?: string | null;
  imagePath?: string | null;
  aiExtraction?: Record<string, unknown> | null;
  comments?: string | null;
  ipHash?: string | null;
}

export interface AdminStats {
  submissions: Record<SubmissionStatus, number>;
  openReports: number;
  published: number;
  expiringSoon: number;
  inReview: number;
}

export interface MerchantPatch {
  categorySlug?: string | null;
  logoUrl?: string | null;
  logoAuthorized?: boolean;
}

export interface SourceRecordPatch {
  state: SourceRecordState;
  externalId?: string | null;
  validUntil?: string | null;
  /** null = no volver a leerla. */
  nextCheckAt: string | null;
  error?: string | null;
}

/** Acceso a datos. Dos implementaciones: memoria (modo demo) y Supabase. */
export interface ProductSearch {
  limit?: number;
  offset?: number;
  /** Por defecto, primero los que están en más comercios. */
  sort?: "comercios" | "menor" | "mayor";
  /** Solo los que están en más de un comercio. */
  comparable?: boolean;
  minPrice?: number;
  maxPrice?: number;
  /** Solo lo que vende este comercio (el precio y el orden son los de ese comercio). */
  merchantSlug?: string;
}

/** Comercio que tiene precios cargados, con cuántos productos. */
export interface PriceMerchant {
  slug: string;
  name: string;
  products: number;
}

export interface PriceStats {
  products: number;
  listings: number;
  /** Productos que están en más de un comercio: los que se pueden comparar. */
  comparable: number;
}

export interface Repo {
  readonly mode: "demo" | "supabase";

  // Catálogos
  listCategories(): Promise<Category[]>;
  listPaymentMethods(): Promise<PaymentMethod[]>;
  listMerchants(): Promise<Merchant[]>;
  /** Admin: rubro y logo del comercio. El logo solo se muestra con logoAuthorized. */
  updateMerchant(id: string, patch: MerchantPatch): Promise<Merchant>;
  /** Admin: sube el archivo del logo y devuelve su URL pública. */
  uploadMerchantLogo(id: string, bytes: Uint8Array, contentType: string): Promise<string>;

  // Promociones (incluye cupones y cumpleaños)
  listPromotions(filter?: PromotionFilter): Promise<Promotion[]>;
  getPromotion(id: string, opts?: { includeUnpublished?: boolean }): Promise<Promotion | null>;

  // Perfil
  getProfile(userId: string): Promise<UserProfile | null>;
  updateBirthday(userId: string, day: number | null, month: number | null): Promise<void>;
  updateDisplayName(userId: string, name: string): Promise<void>;
  setUserPaymentMethods(userId: string, paymentMethodIds: string[]): Promise<void>;

  // Guardados y utilizados
  getUserStates(userId: string): Promise<Map<string, PromoUserState>>;
  setSaved(userId: string, promotionId: string, saved: boolean): Promise<void>;
  setUsed(userId: string, promotionId: string, used: boolean): Promise<void>;

  // Reportes
  createReport(userId: string, promotionId: string, reason: ReportReason, comment: string | null): Promise<void>;
  listReports(status?: ReportStatus): Promise<PromotionReport[]>;
  resolveReport(id: string, status: Exclude<ReportStatus, "abierto">, actorId: string, note?: string | null): Promise<void>;

  // Cola de revisión (sugerencias + automatización)
  createSubmission(s: NewSubmission): Promise<Submission>;
  listSubmissions(filter?: { status?: SubmissionStatus; origin?: SubmissionOrigin; submittedBy?: string }): Promise<Submission[]>;
  getSubmission(id: string): Promise<Submission | null>;
  updateSubmission(
    id: string,
    patch: Partial<Pick<Submission, "status" | "payload" | "reviewNote" | "duplicateOf" | "publishedPromotionId" | "fingerprint">>,
    actorId: string | null,
    action: string,
  ): Promise<Submission>;
  getSubmissionImage(path: string): Promise<{ url: string } | null>;
  saveSubmissionImage(userId: string, bytes: Uint8Array, contentType: string): Promise<string>;
  listModerationEvents(entityType: ModerationEvent["entityType"], entityId: string): Promise<ModerationEvent[]>;

  // Publicación y mantenimiento (solo servidor con permisos de admin)
  publishPayload(payload: PromoPayload, opts: { fingerprint: string; sourceId?: string | null; actorId: string | null }): Promise<Promotion>;
  updatePromotionFromPayload(id: string, payload: PromoPayload, fingerprint: string): Promise<void>;
  setPromotionStatus(id: string, status: PromoStatus, actorId: string | null, note?: string | null): Promise<void>;
  markVerified(id: string): Promise<void>;
  /** Marca que la promo fue corregida a mano: los cambios de la fuente vuelven a pasar por revisión. */
  markManualEdit(id: string): Promise<void>;
  expirePromotions(today: string): Promise<number>;

  // Fuentes y automatización
  listSources(): Promise<Source[]>;
  listIngestionRuns(limit?: number): Promise<IngestionRun[]>;
  recordIngestionRun(run: Omit<IngestionRun, "id" | "sourceName">): Promise<void>;
  findPromotionByExternalId(sourceId: string, externalId: string): Promise<Promotion | null>;
  /** Huellas de lo que la automatización ya mandó a la cola (pendiente o rechazado): no se vuelve a encolar. */
  listQueuedFingerprints(): Promise<string[]>;
  /** Cierra lo que esperaba revisión de esa fuente con esa huella: la promo ya se publicó o actualizó sola. Devuelve cuántas cerró. */
  closeQueued(sourceId: string, fingerprint: string, promotionId: string): Promise<number>;
  updateSourceConfig(sourceId: string, patch: Record<string, unknown>): Promise<void>;

  // Fuentes que se leen por tandas (una página por promo)
  /** Agrega las páginas que todavía no se conocían. Las existentes no se tocan. */
  addSourceRecords(sourceId: string, items: { key: string; priority: number }[]): Promise<void>;
  /** Páginas que toca leer ahora: primero las de más prioridad. */
  dueSourceRecords(sourceId: string, nowISO: string, limit: number): Promise<SourceRecord[]>;
  saveSourceRecord(sourceId: string, key: string, patch: SourceRecordPatch): Promise<void>;
  sourceRecordStats(sourceId: string): Promise<Partial<Record<SourceRecordState, number>>>;

  // «Comparar precios»: productos y precios por comercio
  /** Guarda lo leído en la página de un comercio; el historial suma una fila solo si cambió precio o stock. */
  upsertListing(input: ListingInput): Promise<ListingChange>;
  /** Busca por marca o nombre. Sin texto, devuelve los que están en más comercios. */
  searchProducts(q: string, opts?: ProductSearch): Promise<ProductSummary[]>;
  getProduct(id: string): Promise<{ product: Product; listings: Listing[] } | null>;
  priceStats(): Promise<PriceStats>;
  priceMerchants(): Promise<PriceMerchant[]>;

  // Límites
  countRecentSubmissions(userId: string, ipHash: string | null, sinceISO: string): Promise<{ byUser: number; byIp: number }>;

  adminStats(today: string): Promise<AdminStats>;
}

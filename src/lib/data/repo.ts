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

/** Acceso a datos. Dos implementaciones: memoria (modo demo) y Supabase. */
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
  expirePromotions(today: string): Promise<number>;

  // Fuentes y automatización
  listSources(): Promise<Source[]>;
  listIngestionRuns(limit?: number): Promise<IngestionRun[]>;
  recordIngestionRun(run: Omit<IngestionRun, "id" | "sourceName">): Promise<void>;
  findPromotionByExternalId(sourceId: string, externalId: string): Promise<Promotion | null>;

  // Límites
  countRecentSubmissions(userId: string, ipHash: string | null, sinceISO: string): Promise<{ byUser: number; byIp: number }>;

  adminStats(today: string): Promise<AdminStats>;
}

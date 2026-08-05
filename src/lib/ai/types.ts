// ============================================================
// DeepSeek Text Provider — Type Definitions
// Owner: ai-deepseek-engineer
// Contract: docs/contracts/ai-contract.md v2.0 §2, §19
// ============================================================

// --- Provider Error ---

export type DeepSeekProviderErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "AI_UPSTREAM_ERROR"
  | "AI_INVALID_RESPONSE"
  | "AI_REQUEST_ABORTED";

export interface DeepSeekProviderErrorShape {
  code: DeepSeekProviderErrorCode;
  message: string;
  requestId: string;
  retryable: boolean;
  suggestedHttpStatus?: number;
  upstreamStatus?: number;
}

export class DeepSeekProviderError extends Error {
  public readonly code: DeepSeekProviderErrorCode;
  public readonly requestId: string;
  public readonly retryable: boolean;
  public readonly suggestedHttpStatus?: number;
  public readonly upstreamStatus?: number;

  constructor(opts: DeepSeekProviderErrorShape) {
    super(opts.message);
    this.name = "DeepSeekProviderError";
    this.code = opts.code;
    this.requestId = opts.requestId;
    this.retryable = opts.retryable;
    this.suggestedHttpStatus = opts.suggestedHttpStatus;
    this.upstreamStatus = opts.upstreamStatus;
  }

  toJSON(): DeepSeekProviderErrorShape {
    return {
      code: this.code,
      message: this.message,
      requestId: this.requestId,
      retryable: this.retryable,
      suggestedHttpStatus: this.suggestedHttpStatus,
      upstreamStatus: this.upstreamStatus,
    };
  }
}

// --- Shared AI Request Context ---

export interface AIRequestContext {
  requestId: string;
  promptVersion: string;
  modelName: string;
  idempotencyKey?: string;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

// --- Privacy-safe Redacted Types (safe to send to DeepSeek) ---

export interface RedactedPropertyFacts {
  title?: string;
  city?: string;
  district?: string;
  businessArea?: string;
  communityName?: string;
  addressText?: string;
  rentalType?: string;
  monthlyRent?: number;
  depositTerms?: string;
  bedrooms?: number;
  livingRooms?: number;
  bathrooms?: number;
  areaSqm?: number;
  hasElevator?: boolean;
  orientation?: string;
  decoration?: string;
  availableFrom?: string;
  minimumLeaseMonths?: number;
  petsAllowed?: boolean;
  cookingAllowed?: boolean;
  subwayText?: string;
  facilities?: unknown;
  tags?: string[];
  sellingPoints?: string[];
  drawbacks?: string[];
  description?: string;
  visualSummary?: string;
}

export interface RedactedClientFacts {
  name?: string;
  sourcePlatform?: string;
  budgetMin?: number;
  budgetMax?: number;
  preferredDistricts?: string[];
  preferredCommunities?: string[];
  bedrooms?: number;
  rentalType?: string;
  availableFrom?: string;
  minimumLeaseMonths?: number;
  petsRequired?: boolean;
  cookingRequired?: boolean;
  commuteDestination?: string;
  hardRequirements?: unknown;
  softPreferences?: unknown;
  dealBreakers?: string[];
}

// --- extractProperty ---

export interface PropertyExtractionInput {
  text: string;
  sourceType: "text" | "speech" | "wechat";
  requestId: string;
}

export interface PropertyExtractionResult {
  data: RedactedPropertyFacts;
  missingFields: string[];
  uncertainFields: Array<{ field: string; reason: string }>;
  rawText: string;
  usage: AIUsage;
}

// --- extractClient ---

export interface ClientExtractionInput {
  text: string;
  sourcePlatform: "wechat" | "text" | "other";
  requestId: string;
}

export interface ClientExtractionResult {
  data: RedactedClientFacts;
  missingFields: string[];
  uncertainFields: Array<{ field: string; reason: string }>;
  rawText: string;
  usage: AIUsage;
}

// --- parsePropertySearch ---

export interface SearchParseInput extends AIRequestContext {
  query: string;
}

export interface PropertySearchFilters {
  districts?: string[];
  communities?: string[];
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  bedrooms?: number;
  livingRooms?: number;
  rentalType?: "whole_unit" | "shared";
  petsAllowed?: boolean;
  cookingAllowed?: boolean;
  hasElevator?: boolean;
  availableBefore?: string;
  features?: string[];
  subwayLines?: string[];
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  parsedQuery: string;
  unrecognizedTerms: string[];
}

// --- generateContent ---

export type ContentPlatform = "xiaohongshu" | "douyin" | "wechat_moments";

export interface ContentGenerationInput extends AIRequestContext {
  platform: ContentPlatform;
  propertyFacts: RedactedPropertyFacts;
  visualSummary?: string;
  confirmedAiLabels?: PropertyMediaAiLabel[];
  targetAudience?: string;
  contentAngle?: string;
  contentGoal?: string;
  tone?: string;
  videoDurationSeconds?: number;
  isOnCamera?: boolean;
  showDrawbacks?: boolean;
  privateMessageKeyword?: string;
  userPreferences?: UserPreferenceHint[];
  unresolvedVisualConflicts?: VisualFactCheck[];
}

// --- Visual / Media types (used by generateContent) ---

export interface PropertyMediaAiLabel {
  sceneType: string;
  styles: string[];
  visibleFeatures: string[];
  condition: string[];
  lighting: string[];
  appliances: string[];
  confidence: number;
  evidence: string[];
  uncertainLabels: string[];
}

export interface VisualFactCheck {
  textClaim: string;
  fieldName: string;
  visualResult: VisualFactLevel;
  confidence: number;
  suggestion: string;
}

export type VisualFactLevel =
  | "not_verified_by_images"
  | "insufficient_evidence"
  | "weak_visual_support"
  | "confirmed_visual_support"
  | "possible_conflict";

export interface UserPreferenceHint {
  key: string;
  value: string;
  confidence: number;
}

// --- Platform-specific outputs ---

export interface FactReference {
  field: string;
  value: string;
}

export interface VisualFactReference {
  mediaId: string;
  claim: string;
}

export interface RiskFlag {
  field: string;
  severity: "high" | "medium" | "low";
  description: string;
}

export interface ComplianceFlag {
  term: string;
  category: string;
  severity: "block" | "warn";
  suggestion: string;
}

export interface ImageSequenceItem {
  order: number;
  description: string;
  suggestedMediaType: string;
}

export interface ShotItem {
  order: number;
  durationSeconds: number;
  description: string;
  visualSuggestion: string;
}

export interface XiaohongshuOutput {
  platform: "xiaohongshu";
  titleOptions: string[];
  coverText: string;
  hook: string;
  body: string;
  imageSequence: ImageSequenceItem[];
  imageCaptions: string[];
  factualSummary: string;
  drawbacks?: string;
  interactionQuestion: string;
  privateMessageKeyword: string;
  hashtags: string[];
  factsUsed: FactReference[];
  visualFactsUsed: VisualFactReference[];
  missingInformation: string[];
  riskFlags: RiskFlag[];
  complianceFlags: ComplianceFlag[];
  requiresFactReview: boolean;
}

export interface DouyinOutput {
  platform: "douyin";
  hookOptions: string[];
  coverText: string;
  fullVoiceover: string;
  shots: ShotItem[];
  subtitles: string;
  caption: string;
  commentCta: string;
  privateMessageKeyword: string;
  hashtags: string[];
  missingShots: string[];
  factsUsed: FactReference[];
  visualFactsUsed: VisualFactReference[];
  missingInformation: string[];
  riskFlags: RiskFlag[];
  complianceFlags: ComplianceFlag[];
  requiresFactReview: boolean;
}

export interface WechatMomentsOutput {
  platform: "wechat_moments";
  copyOptions: string[];
  nineGridSuggestion: string;
  shortCta: string;
  privateMessageKeyword: string;
  factsUsed: FactReference[];
  visualFactsUsed: VisualFactReference[];
  riskFlags: RiskFlag[];
  complianceFlags: ComplianceFlag[];
  requiresFactReview: boolean;
}

export type GeneratedContent =
  | XiaohongshuOutput
  | DouyinOutput
  | WechatMomentsOutput;

// --- Structured Log Context (for internal logging only) ---

export interface StructuredLogContext {
  requestId: string;
  provider: string;
  modelName: string;
  durationMs: number;
  retryCount: number;
  errorCode?: string;
  inputTokens?: number;
  outputTokens?: number;
}

// --- DeepSeekTextProvider Interface ---

export interface DeepSeekTextProvider {
  extractProperty(
    input: PropertyExtractionInput,
    signal?: AbortSignal
  ): Promise<PropertyExtractionResult>;
  extractClient(
    input: ClientExtractionInput,
    signal?: AbortSignal
  ): Promise<ClientExtractionResult>;
  parsePropertySearch(
    input: SearchParseInput,
    signal?: AbortSignal
  ): Promise<PropertySearchFilters>;
  generateContent(
    input: ContentGenerationInput,
    signal?: AbortSignal
  ): Promise<GeneratedContent>;
}

// --- Fetch injection type ---

export type FetchFn = typeof globalThis.fetch;

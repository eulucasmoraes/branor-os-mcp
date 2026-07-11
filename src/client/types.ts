/**
 * Hand-written types for the slice of the branor-os OpenAPI contract that
 * the MCP tools touch. Keep these in sync with the actual Zod response DTOs
 * in branor-os/backend/src/modules/**\/dto/*-response.dto.ts.
 */

export interface Paginated<T> {
  items: T[];
  total?: number;
  page?: number;
  limit: number;
  hasMore?: boolean;
}

export type CreativeAssetType = 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'HTML' | 'TEXT';
export type CreativeAssetStatus = 'DRAFT' | 'READY' | 'ARCHIVED';
export type CreativeAssetPlatform = 'META' | 'GOOGLE' | 'TIKTOK' | 'PINTEREST';

export interface CreativeAsset {
  id: string;
  publicId: string;
  name: string;
  type: CreativeAssetType;
  status: CreativeAssetStatus;
  [key: string]: unknown;
}

/** Envelope returned by the API on any 4xx/5xx. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  /**
   * Machine-readable error identifier, distinct from `error` (the generic
   * HTTP status name, e.g. 'Forbidden'). Preferred over `error` by
   * ApiError.errorCode when present.
   */
  errorCode?: string;
  message: string | string[];
  timestamp: string;
  path: string;
  requestId?: string;
}

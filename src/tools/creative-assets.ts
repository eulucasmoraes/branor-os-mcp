import { z } from 'zod';
import { defineTool } from './types.js';

const styleEnum = z.enum([
  'PROVADOR',
  'ARRUME_SE_COMIGO',
  'TREND_MODELO_MUSICA',
  'UGC_DEPOIMENTO',
  'ESTUDIO_PRODUTO',
  'UNBOXING',
  'CATALOGO',
  'OUTRO',
]);

const sourceEnum = z.enum(['AGENCY', 'CLIENT_UPLOAD', 'PLATFORM_IMPORT']);

export const listCreativeAssets = defineTool({
  name: 'list_creative_assets',
  description:
    "List the creative asset library for the workspace (GET /workspaces/{workspace_public_id}/creative-assets), optionally filtered by type, status, and a free-text search, with pagination. Use this to browse or find creative assets before referencing one by publicId in another tool. Example: list_creative_assets({ workspace_public_id: 'ws_pub_1', type: 'VIDEO', status: 'READY' }) -> { items: [{ publicId: 'ca_1', name: 'Unboxing verão', type: 'VIDEO', status: 'READY' }], limit: 20, page: 1 }",
  inputSchema: {
    type: z
      .enum(['IMAGE', 'VIDEO', 'CAROUSEL', 'HTML', 'TEXT'])
      .optional()
      .describe('Filter by asset type.'),
    status: z
      .enum(['DRAFT', 'READY', 'ARCHIVED'])
      .optional()
      .describe('Filter by lifecycle status.'),
    search: z.string().optional().describe('Free-text search over the asset name/description.'),
    page: z.number().int().positive().optional().describe('Page number (1-based). Default: 1.'),
    limit: z.number().int().positive().optional().describe('Page size. Default: server default.'),
  },
  handler: async (input, endpoints) =>
    endpoints.listCreativeAssets({
      type: input.type,
      status: input.status,
      search: input.search,
      page: input.page,
      limit: input.limit,
    }),
});

export const getCreativeAsset = defineTool({
  name: 'get_creative_asset',
  description:
    'Get full details of a creative asset including all media URLs, description, transcript, and platform link (externalId, platformExtraData).',
  inputSchema: {
    id: z.string().describe('Creative asset UUID or publicId'),
  },
  handler: async (input, endpoints) => endpoints.getCreativeAsset(input.id),
});

export const createCreativeAsset = defineTool({
  name: 'create_creative_asset',
  description:
    'Register a creative asset in the workspace library. Provide media URLs and copy context. Asset starts as DRAFT. After uploading to a platform, call update_creative_asset to set status=READY and fill externalId.',
  inputSchema: {
    name: z.string().min(1).max(255),
    type: z.enum(['IMAGE', 'VIDEO', 'CAROUSEL', 'HTML', 'TEXT']).describe('Asset type'),
    description: z
      .string()
      .max(5000)
      .optional()
      .describe('Context, goal, or brief for this creative'),
    transcript: z.string().max(20000).optional().describe('Video transcript or script'),
    tags: z
      .array(z.string().max(100))
      .max(20)
      .optional()
      .describe('Free-form tags for search and organization'),
    mediaItems: z
      .array(
        z.object({
          url: z.string().url().describe('Public URL of the media file'),
          order: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe('Position (0-based). Use for carousel ordering'),
          mimeType: z.string().optional().describe('e.g. image/jpeg, video/mp4'),
        }),
      )
      .optional()
      .describe('One item for image/video, multiple for carousel'),
  },
  handler: async (input, endpoints) =>
    endpoints.createCreativeAsset({
      name: input.name,
      type: input.type,
      description: input.description,
      transcript: input.transcript,
      tags: input.tags,
      mediaItems: input.mediaItems,
    }),
});

export const updateCreativeAsset = defineTool({
  name: 'update_creative_asset',
  description:
    'Update a creative asset. Use to set status=READY after upload, update copy, or link to a platform (platform + externalId + platformExtraData). Providing mediaItems replaces all existing media.',
  inputSchema: {
    id: z.string().uuid().describe('Creative asset UUID'),
    name: z.string().min(1).max(255).optional(),
    status: z.enum(['DRAFT', 'READY', 'ARCHIVED']).optional(),
    description: z.string().max(5000).optional(),
    transcript: z.string().max(20000).optional(),
    tags: z.array(z.string().max(100)).max(20).optional(),
    analysis: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Structured creative analysis output'),
    style: styleEnum.optional().describe('Creative style classification'),
    source: sourceEnum.optional().describe('Where this creative asset came from'),
  },
  handler: async (input, endpoints) =>
    endpoints.updateCreativeAsset(input.id, {
      name: input.name,
      status: input.status,
      description: input.description,
      transcript: input.transcript,
      tags: input.tags,
      analysis: input.analysis,
      style: input.style,
      source: input.source,
    }),
});

export const uploadCreativeMedia = defineTool({
  name: 'upload_creative_media',
  description:
    'Ingest the ORIGINAL media file by URL: the backend downloads it, uploads to storage (content-addressed, dedup by sha256) and creates the creative asset (DRAFT). Does NOT push to any platform — use push_asset_to_meta afterwards if needed. Optionally records platform_refs right away.',
  inputSchema: {
    fileUrl: z.string().url().describe('Public URL of the source file'),
    name: z.string().min(1).max(255),
    type: z.enum(['IMAGE', 'VIDEO', 'CAROUSEL', 'HTML', 'TEXT']).describe('Asset type'),
    mimeType: z.string().optional(),
    description: z.string().max(5000).optional(),
    tags: z.array(z.string()).optional(),
    style: styleEnum.optional(),
    source: sourceEnum.optional(),
    platformRefs: z
      .array(
        z.object({
          platform: z.string().min(1),
          externalId: z
            .string()
            .min(1)
            .describe('External media id on the platform (video_id/image_hash/etc.)'),
          resourceId: z.string().optional(),
        }),
      )
      .optional()
      .describe('Platform refs to record right away, if already known'),
  },
  handler: async (input, endpoints) =>
    endpoints.uploadCreativeMedia({
      fileUrl: input.fileUrl,
      name: input.name,
      type: input.type,
      mimeType: input.mimeType,
      description: input.description,
      tags: input.tags,
      style: input.style,
      source: input.source,
      platformRefs: input.platformRefs,
    }),
});

export const linkPlatformRef = defineTool({
  name: 'link_platform_ref',
  description:
    'Attach a platform_ref to an existing creative asset (any platform), without pushing anything. Use when the media already exists on the platform and only the local reference is missing.',
  inputSchema: {
    id: z.string().uuid().describe('Creative asset UUID'),
    platform: z.string().min(1),
    externalId: z
      .string()
      .min(1)
      .describe('External media id on the platform (video_id/image_hash/etc.)'),
    resourceId: z.string().optional(),
    mediaItemId: z.string().uuid().optional(),
  },
  handler: async (input, endpoints) =>
    endpoints.linkPlatformRef(input.id, {
      platform: input.platform,
      externalId: input.externalId,
      resourceId: input.resourceId,
      mediaItemId: input.mediaItemId,
    }),
});

export const pushAssetToMeta = defineTool({
  name: 'push_asset_to_meta',
  description:
    "Upload a creative asset's media to the Meta ad account library (does NOT create an ad). Records platform_refs (image_hash/video_id) and marks the asset READY. Use before creating a creative when the asset was not yet uploaded to Meta.",
  inputSchema: {
    id: z.string().uuid().describe('Creative asset UUID'),
    resourceId: z
      .string()
      .optional()
      .describe(
        'ConnectedResource UUID or external ID. Required if multiple Meta accounts are connected.',
      ),
  },
  handler: async (input, endpoints) =>
    endpoints.pushAssetToMeta(input.id, { resourceId: input.resourceId }),
});

export const reconcileCreativeAssets = defineTool({
  name: 'reconcile_creative_assets',
  description:
    'Reconcile synced ads with the creative asset library (ad_asset_link) for the whole workspace.',
  inputSchema: {},
  handler: async (_input, endpoints) => endpoints.reconcileCreativeAssets(),
});

export const getAssetAds = defineTool({
  name: 'get_asset_ads',
  description:
    'List ads linked to this creative asset (reconciliation), with campaign/adset context and ad-level metrics for the period.',
  inputSchema: {
    id: z.string().describe('Creative asset UUID or publicId'),
    startDate: z.string().optional().describe('YYYY-MM-DD. Default: 30 days ago'),
    endDate: z.string().optional().describe('YYYY-MM-DD. Default: today'),
  },
  handler: async (input, endpoints) =>
    endpoints.getAssetAds(input.id, { startDate: input.startDate, endDate: input.endDate }),
});

export const getAssetMetrics = defineTool({
  name: 'get_asset_metrics',
  description:
    'Aggregated (Meta) metrics for the creative asset: sum across ads using this media, via the canonical analytics engine (same as /analytics/query).',
  inputSchema: {
    id: z.string().describe('Creative asset UUID or publicId'),
    startDate: z.string().optional().describe('YYYY-MM-DD. Default: 30 days ago'),
    endDate: z.string().optional().describe('YYYY-MM-DD. Default: today'),
  },
  handler: async (input, endpoints) =>
    endpoints.getAssetMetrics(input.id, { startDate: input.startDate, endDate: input.endDate }),
});

export const searchCreativeAssets = defineTool({
  name: 'search_creative_assets',
  description:
    'Semantic search over creative assets in the workspace library (embedding bge-m3 + pgvector cosine similarity). Searches over the asset description/transcript. Returns assets ordered by similarity score. Only assets with a description or transcript are indexed.',
  inputSchema: {
    query: z.string().min(1).describe('Free-text search query'),
    limit: z.number().int().positive().max(100).optional().describe('Default: 20'),
  },
  handler: async (input, endpoints) =>
    endpoints.searchCreativeAssets({ q: input.query, limit: input.limit }),
});

export const analyzeCreativeAsset = defineTool({
  name: 'analyze_creative_asset',
  description:
    'Analyze a creative asset media via AI (transcript + short description + structured analysis: hook, on-screen text, CTA, music, pacing, people, products, language, summary). Persists the result on the asset (description, transcript, analysis). Synchronous — may take a while for large videos.',
  inputSchema: {
    id: z.string().uuid().describe('Creative asset UUID'),
  },
  handler: async (input, endpoints) => endpoints.analyzeCreativeAsset(input.id),
});

export const creativeAssetTools = [
  listCreativeAssets,
  getCreativeAsset,
  createCreativeAsset,
  updateCreativeAsset,
  uploadCreativeMedia,
  linkPlatformRef,
  pushAssetToMeta,
  reconcileCreativeAssets,
  getAssetAds,
  getAssetMetrics,
  searchCreativeAssets,
  analyzeCreativeAsset,
];

// Meta Ads domain: read (account snapshot, deep-dive, live metrics,
// changelog, live campaign/adset/video, local creatives) + write (campaign,
// adset, ad, creative, media upload) tools. Input schemas are ported
// FIELD-FOR-FIELD from branor-os/backend/src/modules/mcp/mcp.service.ts —
// that file is the source of truth for what each tool accepts. The only
// change: `workspaceId` is dropped (workspace_public_id is injected
// centrally by src/server.ts) and `resourceId` stays optional even though a
// couple of underlying REST endpoints require it — this thin client cannot
// auto-resolve the single connected Meta account the way mcp.service.ts does
// (that requires a direct DB query), so a missing resourceId surfaces as an
// API error instead of being silently resolved.
//
// NOT ported (out of scope v1, per instructions): search_targeting,
// suggest_targeting, validate_targeting, find_entity, list_product_catalogs,
// list_product_sets, create_product_set, update_product_set.
//
// fetch_account_creatives was NOT ported either: mcp.service.ts calls
// metaAgentWrite.listCreativesLive() directly (bypassing any controller) and
// no REST route exposes it (meta-agent-write.controller.ts only exposes
// GET/POST creatives against the local DB) — there is no HTTP endpoint for
// this thin client to call.

import { z } from 'zod';
import { defineTool } from './types.js';

const RESOURCE_ID_DESC =
  'ConnectedResource UUID or Meta external ID (act_xxx). Optional if the workspace has a single Meta ad account; required when it has multiple.';

const VALIDATE_ONLY_DESC =
  'Dry-run: when true, Meta validates the full payload and returns errors WITHOUT creating/changing anything. Strongly recommended before the real call to catch bid/targeting/objective errors safely.';

const TARGETING_DESC = [
  'Meta targeting spec. Minimum: { geo_locations: { countries: ["BR"] } }.',
  'PLACEMENTS are set here (omit all for Advantage+ placements = automatic):',
  'publisher_platforms: ["facebook","instagram","audience_network","messenger"],',
  'facebook_positions: ["feed","story","video_feeds","marketplace","search","facebook_reels","right_hand_column","instream_video"],',
  'instagram_positions: ["stream","story","explore","explore_home","reels","profile_feed","ig_search"],',
  'audience_network_positions: ["classic","rewarded_video"],',
  'messenger_positions: ["messenger_home","story"],',
  'device_platforms: ["mobile","desktop"].',
  'Also: age_min/age_max, genders [1=male,2=female], interests/behaviors/custom_audiences ([{id}]), flexible_spec, excluded_custom_audiences, locales.',
  'FIXED AUDIENCE (locked genders/age): Meta REQUIRES targeting_automation, else it rejects with 422.',
  'Either targeting_automation:{advantage_audience:0} (turns Advantage+ audience OFF → fully fixed),',
  'or targeting_automation:{advantage_audience:1, individual_setting:{...}} (declares which of age/gender/geo stay fixed vs. expand).',
  'The literal 0 is meaningful — send it as-is; it is forwarded verbatim.',
].join(' ');

// Converts the tool's validate_only flag into the execution_options array
// the backend DTOs expect.
const execOpts = (validateOnly?: boolean): string[] | undefined =>
  validateOnly ? ['validate_only'] : undefined;

// promoted_object — used on campaign (catalog) and adset (pixel/catalog/app)
const promotedObjectSchema = z
  .object({
    pixel_id: z.string().optional().describe('Required for OFFSITE_CONVERSIONS optimization'),
    custom_event_type: z
      .string()
      .optional()
      .describe('e.g. PURCHASE, LEAD, COMPLETE_REGISTRATION, ADD_TO_CART'),
    page_id: z.string().optional(),
    application_id: z.string().optional(),
    object_store_url: z.string().optional(),
    product_catalog_id: z
      .string()
      .optional()
      .describe('Catalog ID — set at CAMPAIGN level to enable Advantage+ catalog ads'),
    product_set_id: z
      .string()
      .optional()
      .describe('Product set ID — set at AD SET level for catalog ads (which products to promote)'),
    custom_conversion_id: z.string().optional(),
    event_id: z.string().optional(),
  })
  .optional();

const attributionSpecSchema = z
  .array(
    z.object({
      event_type: z.enum(['CLICK_THROUGH', 'VIEW_THROUGH', 'ENGAGED_VIDEO_VIEW']),
      window_days: z.union([z.literal(1), z.literal(7), z.literal(28)]),
    }),
  )
  .optional();

const bidStrategyEnum = z.enum([
  'LOWEST_COST_WITHOUT_CAP',
  'LOWEST_COST_WITH_BID_CAP',
  'COST_CAP',
  'LOWEST_COST_WITH_MIN_ROAS',
]);

const destinationTypeEnum = z.enum([
  'WEBSITE',
  'APP',
  'MESSENGER',
  'INSTAGRAM_DIRECT',
  'WHATSAPP',
  'INSTAGRAM_PROFILE',
]);

// ─── Read tools ───────────────────────────────────────────────────────────

export const getAccountSnapshot = defineTool({
  name: 'get_account_snapshot',
  description:
    'Start here every session. Full account tree (campaigns→adsets→ads) with config, targeting summaries, period metrics vs previous period, computed flags and recent changes. Data is synced daily (d-1) — check data_freshness. Use includeToday=true only when intraday pacing matters. If workspace has a single Meta account resourceId is optional.',
  inputSchema: {
    resourceId: z.string().optional().describe(RESOURCE_ID_DESC),
    period: z
      .enum(['last_7d', 'last_14d', 'last_30d', 'custom'])
      .default('last_7d')
      .describe('Analysis period. Default: last_7d.'),
    dateStart: z.string().optional().describe('YYYY-MM-DD start (required when period=custom)'),
    dateEnd: z.string().optional().describe('YYYY-MM-DD end (required when period=custom)'),
    compare: z
      .enum(['previous_period', 'none'])
      .default('previous_period')
      .describe('Comparison baseline. Default: previous_period.'),
    includeToday: z
      .boolean()
      .default(false)
      .describe('Merge today live data (cached 5 min). Only when intraday pacing matters.'),
    scope: z
      .enum(['with_delivery', 'active', 'all'])
      .default('with_delivery')
      .describe('Entity scope: with_delivery = active + paused-with-spend.'),
    depth: z.enum(['adsets', 'ads']).default('ads').describe('Tree depth. Default: ads.'),
  },
  handler: async (input, endpoints) => endpoints.getAccountSnapshot(input),
});

export const deepDiveCampaign = defineTool({
  name: 'deep_dive_campaign',
  description:
    'Full config + complete ad copy + daily time series + age/gender/platform/device breakdowns (live, cached 15 min) + change history for one campaign. Use after get_account_snapshot flags a campaign for investigation. Accepts internal UUID, Meta external ID, or the campaign NAME (exact or partial — errors with candidate list if ambiguous).',
  inputSchema: {
    campaignId: z
      .string()
      .describe('Internal UUID, Meta external campaign ID, or campaign name (partial match supported)'),
    resourceId: z.string().optional().describe(RESOURCE_ID_DESC),
    period: z.enum(['last_7d', 'last_14d', 'last_30d', 'custom']).default('last_7d'),
    dateStart: z.string().optional(),
    dateEnd: z.string().optional(),
  },
  handler: async ({ campaignId, ...query }, endpoints) =>
    endpoints.getCampaignDeepDive(campaignId, query),
});

export const getLiveMetrics = defineTool({
  name: 'get_live_metrics',
  description:
    "Today's partial metrics, live from Meta (cached 5 min). Use for intraday pacing decisions after budget/status changes. NOT for structural analysis — use get_account_snapshot for that. Always check the as_of timestamp before drawing conclusions.",
  inputSchema: {
    resourceId: z.string().optional().describe(RESOURCE_ID_DESC),
    level: z.enum(['campaign', 'adset', 'ad']).describe('Entity level'),
    ids: z.string().describe('Comma-separated Meta external IDs'),
    hourly: z.boolean().default(false).describe('Include hourly breakdown'),
  },
  handler: async (input, endpoints) => endpoints.getLiveMetrics(input),
});

export const getChangelog = defineTool({
  name: 'get_changelog',
  description:
    'History of changes detected by sync (source=sync) and written via API (source=api). Filter by entity, date range, or API key actor. Ordered by date descending.',
  inputSchema: {
    resourceId: z.string().optional(),
    since: z.string().optional().describe('ISO 8601 or YYYY-MM-DD'),
    until: z.string().optional(),
    entityType: z.enum(['campaign', 'adset', 'ad', 'creative']).optional(),
    externalId: z.string().optional().describe('Meta external entity ID'),
    source: z.enum(['sync', 'api']).optional(),
    apiKeyId: z.string().optional().describe('Filter by API key actor UUID'),
    page: z.number().int().positive().default(1),
    limit: z.number().int().positive().max(100).default(50),
  },
  handler: async (input, endpoints) => endpoints.getChangelog(input),
});

export const getCampaign = defineTool({
  name: 'get_campaign',
  description:
    'Read a single campaign LIVE from Meta (current config, not synced data). Returns objective, status, effective_status, bid_strategy, daily/lifetime budget (budget at campaign level = CBO), spend_cap, buying_type, special_ad_categories, promoted_object. Use to confirm a campaign real state before creating ad sets — e.g. its bid_strategy decides whether ad sets need a bid_amount.',
  inputSchema: {
    resourceId: z.string().optional().describe(RESOURCE_ID_DESC),
    campaignId: z.string().describe('Meta external campaign ID'),
  },
  handler: async ({ campaignId, resourceId }, endpoints) =>
    endpoints.getCampaignLive(campaignId, { resourceId }),
});

export const getAdset = defineTool({
  name: 'get_adset',
  description:
    'Read a single ad set LIVE from Meta (current config). Returns the FULL targeting spec, optimization_goal, billing_event, bid_strategy/bid_amount, promoted_object, attribution_spec, destination_type, learning_stage_info. ALWAYS call this before update_adset (targeting is REPLACED, not merged — you must send the complete spec). Also use it to mirror/clone a known-good ad set into a new one.',
  inputSchema: {
    resourceId: z.string().optional().describe(RESOURCE_ID_DESC),
    adSetId: z.string().describe('Meta external ad set ID'),
  },
  handler: async ({ adSetId, resourceId }, endpoints) =>
    endpoints.getAdSetLive(adSetId, { resourceId }),
});

export const getVideoStatus = defineTool({
  name: 'get_video_status',
  description: "Check a video's processing status. Wait until status=ready before using video_id in create_creative.",
  inputSchema: {
    videoId: z.string().describe('Meta video ID returned by upload_video'),
    resourceId: z.string().optional().describe(RESOURCE_ID_DESC),
  },
  handler: async ({ videoId, resourceId }, endpoints) =>
    endpoints.getVideoStatus(videoId, { resourceId }),
});

export const listCreatives = defineTool({
  name: 'list_creatives',
  description:
    'List ad creatives stored locally. Returns externalId (use this as creative_id in create_ad), page_id, instagram_user_id, image_hash, video_id, title, body, CTA and link_url. Always call this before create_ad to find the correct creative_id — do NOT use the ad external_id as creative_id.',
  inputSchema: {
    resourceId: z.string().optional(),
    search: z.string().optional().describe('Search in name, title, or body'),
    page: z.number().int().positive().default(1),
    limit: z.number().int().positive().max(100).default(50),
  },
  handler: async (input, endpoints) => endpoints.listCreatives(input),
});

// ─── Write tools ──────────────────────────────────────────────────────────

export const createCampaign = defineTool({
  name: 'create_campaign',
  description:
    'Create a Meta Ads campaign. Always born PAUSED — activate with update_campaign. reason must describe the hypothesis/goal of the campaign (becomes auditable history). IDs use Meta external IDs. For Advantage+ CATALOG campaigns: objective=OUTCOME_SALES + promoted_object.product_catalog_id.',
  inputSchema: {
    resourceId: z.string().optional().describe(RESOURCE_ID_DESC),
    name: z.string().min(1),
    objective: z.enum([
      'OUTCOME_SALES',
      'OUTCOME_LEADS',
      'OUTCOME_TRAFFIC',
      'OUTCOME_AWARENESS',
      'OUTCOME_ENGAGEMENT',
      'OUTCOME_APP_PROMOTION',
    ]),
    special_ad_categories: z
      .array(
        z.enum([
          'NONE',
          'EMPLOYMENT',
          'HOUSING',
          'CREDIT',
          'ISSUES_ELECTIONS_POLITICS',
          'ONLINE_GAMBLING_AND_GAMING',
          'FINANCIAL_PRODUCTS_SERVICES',
        ]),
      )
      .min(1),
    status: z.enum(['ACTIVE', 'PAUSED']).default('PAUSED'),
    daily_budget: z.number().int().positive().optional().describe('In cents. Activates CBO.'),
    lifetime_budget: z.number().int().positive().optional(),
    spend_cap: z.number().int().positive().optional().describe('Max total spend for the campaign, in cents'),
    bid_strategy: bidStrategyEnum.optional(),
    promoted_object: promotedObjectSchema.describe(
      'Campaign-level: set product_catalog_id here to create an Advantage+ CATALOG campaign (enables catalog at campaign level)',
    ),
    start_time: z.string().optional().describe('ISO 8601 start. Mainly for lifetime_budget campaigns.'),
    stop_time: z
      .string()
      .optional()
      .describe('ISO 8601 end. REQUIRED when lifetime_budget is set (CBO lifetime).'),
    is_skadnetwork_attribution: z
      .boolean()
      .optional()
      .describe('iOS 14.5+ SKAdNetwork attribution (iOS web sales).'),
    validate_only: z.boolean().optional().describe(VALIDATE_ONLY_DESC),
    reason: z.string().min(1).describe('Required: describe the goal/hypothesis. Becomes change log history.'),
  },
  handler: async ({ validate_only, ...params }, endpoints) =>
    endpoints.createCampaign({ ...params, execution_options: execOpts(validate_only) }),
});

export const updateCampaign = defineTool({
  name: 'update_campaign',
  description:
    'Update a Meta Ads campaign. To activate: set status=ACTIVE. reason must describe the hypothesis (e.g. "Increasing budget to capture weekend demand"). Uses Meta external campaign ID.',
  inputSchema: {
    campaignId: z.string().describe('Meta external campaign ID'),
    resourceId: z.string().optional().describe(RESOURCE_ID_DESC),
    name: z.string().optional(),
    status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
    daily_budget: z.number().int().positive().optional().describe('In cents'),
    lifetime_budget: z.number().int().positive().optional(),
    spend_cap: z.number().int().positive().optional().describe('Max total spend, in cents'),
    bid_strategy: bidStrategyEnum.optional(),
    promoted_object: promotedObjectSchema.describe(
      'Set/change product_catalog_id to enable/adjust catalog at campaign level',
    ),
    validate_only: z.boolean().optional().describe(VALIDATE_ONLY_DESC),
    reason: z.string().min(1).describe('Required: describe why this change is being made.'),
  },
  handler: async ({ campaignId, resourceId, reason, validate_only, ...params }, endpoints) =>
    endpoints.updateCampaign(campaignId, {
      ...params,
      resourceId,
      reason,
      execution_options: execOpts(validate_only),
    }),
});

export const createAdset = defineTool({
  name: 'create_adset',
  description: [
    'Create a Meta Ads ad set. Always born PAUSED. reason is required.',
    'campaign_id and other IDs are Meta EXTERNAL IDs (numbers, not UUIDs).',
    'Targeting minimum: { geo_locations: { countries: ["BR"] } }.',
    'IMPORTANT — optimization_goal must match the campaign objective:',
    '  OUTCOME_SALES     → OFFSITE_CONVERSIONS (requires promoted_object.pixel_id)',
    '  OUTCOME_LEADS     → LEAD_GENERATION or QUALITY_LEAD',
    '  OUTCOME_TRAFFIC   → LINK_CLICKS or LANDING_PAGE_VIEWS',
    '  OUTCOME_AWARENESS → REACH or IMPRESSIONS or AD_RECALL_LIFT',
    '  OUTCOME_ENGAGEMENT → POST_ENGAGEMENT or VIDEO_VIEWS or MESSAGES',
    'budget: omit daily_budget if campaign is CBO (budget set at campaign level).',
    'CATALOG ads: campaign must have promoted_object.product_catalog_id; here set promoted_object.product_set_id (+ pixel_id/custom_event_type for sales).',
    'PLACEMENTS: set inside targeting (see targeting description). Omit for Advantage+ automatic placements.',
  ].join(' '),
  inputSchema: {
    resourceId: z.string().optional().describe(RESOURCE_ID_DESC),
    name: z.string().min(1),
    campaign_id: z.string().describe('Meta external campaign ID (number string)'),
    optimization_goal: z
      .enum([
        'OFFSITE_CONVERSIONS',
        'LEAD_GENERATION',
        'QUALITY_LEAD',
        'LINK_CLICKS',
        'LANDING_PAGE_VIEWS',
        'REACH',
        'IMPRESSIONS',
        'AD_RECALL_LIFT',
        'POST_ENGAGEMENT',
        'VIDEO_VIEWS',
        'THRUPLAY',
        'MESSAGES',
        'CONVERSATIONS',
        'APP_INSTALLS',
        'VALUE',
      ])
      .describe('Must match the campaign objective — see tool description'),
    billing_event: z.enum(['IMPRESSIONS', 'LINK_CLICKS', 'THRUPLAY']).default('IMPRESSIONS'),
    targeting: z.record(z.string(), z.unknown()).describe(TARGETING_DESC),
    promoted_object: promotedObjectSchema.describe(
      'Required for OFFSITE_CONVERSIONS (pixel_id + custom_event_type). For catalog ads: product_set_id.',
    ),
    destination_type: destinationTypeEnum.optional().describe('Where ads in this ad set lead to'),
    is_dynamic_creative: z
      .boolean()
      .optional()
      .describe('Enable Dynamic Creative (required when ads use asset_feed_spec with multiple assets)'),
    attribution_spec: attributionSpecSchema.describe(
      'Attribution windows. Ex: [{event_type:"CLICK_THROUGH",window_days:7},{event_type:"VIEW_THROUGH",window_days:1}]. event_type must be CLICK_THROUGH | VIEW_THROUGH | ENGAGED_VIDEO_VIEW (Meta enum — never ENGAGED_VIEW_THROUGH).',
    ),
    frequency_control_specs: z
      .array(
        z.object({
          event: z.string().describe('e.g. IMPRESSIONS'),
          interval_days: z.number().int().min(1).max(90),
          max_frequency: z.number().int().min(1),
        }),
      )
      .optional()
      .describe('Frequency caps (REACH campaigns)'),
    status: z.enum(['ACTIVE', 'PAUSED']).default('PAUSED'),
    daily_budget: z.number().int().positive().optional().describe('In cents. Omit if campaign uses CBO.'),
    lifetime_budget: z.number().int().positive().optional(),
    bid_strategy: bidStrategyEnum.optional(),
    bid_amount: z.number().int().positive().optional().describe('In cents'),
    bid_constraints: z
      .object({
        roas_average_floor: z
          .number()
          .int()
          .positive()
          .describe('Min ROAS × 10000 (e.g. ROAS 1.5 → 15000)'),
      })
      .optional()
      .describe('Required for bid_strategy LOWEST_COST_WITH_MIN_ROAS: sets the minimum ROAS floor.'),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    dsa_beneficiary: z
      .string()
      .max(512)
      .optional()
      .describe('EU DSA: who benefits from the ad (required in EU).'),
    dsa_payor: z.string().max(512).optional().describe('EU DSA: who pays for the ad (required in EU).'),
    validate_only: z.boolean().optional().describe(VALIDATE_ONLY_DESC),
    reason: z.string().min(1).describe('Required: describe goal of this ad set.'),
  },
  handler: async ({ validate_only, ...params }, endpoints) =>
    endpoints.createAdSet({ ...params, execution_options: execOpts(validate_only) }),
});

export const updateAdset = defineTool({
  name: 'update_adset',
  description:
    'Update a Meta Ads ad set. reason is required. Uses Meta external ad set ID. Supports changing targeting (placements), promoted_object (pixel/catalog product set), destination_type, dynamic creative toggle and attribution_spec (attribution window — use to fix an attribution_mismatch flag; note it resets the ad set learning phase).',
  inputSchema: {
    adSetId: z.string().describe('Meta external ad set ID'),
    resourceId: z.string().optional().describe(RESOURCE_ID_DESC),
    name: z.string().optional(),
    status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
    daily_budget: z.number().int().positive().optional().describe('In cents'),
    lifetime_budget: z.number().int().positive().optional(),
    bid_amount: z.number().int().positive().optional().describe('In cents'),
    bid_strategy: bidStrategyEnum.optional(),
    targeting: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'REPLACES the full targeting spec (not a merge — read current targeting first via get_adset, modify, send complete). ' +
          TARGETING_DESC,
      ),
    promoted_object: promotedObjectSchema.describe('Change pixel/event or catalog product_set_id'),
    destination_type: destinationTypeEnum.optional(),
    is_dynamic_creative: z.boolean().optional(),
    attribution_spec: attributionSpecSchema.describe(
      'Attribution windows to set on this existing ad set. Editing it RESETS the learning phase — prefer paused/non-delivering ad sets. Use to normalize an attribution_mismatch flag: read each ad set via get_adset, then align every ad set of the campaign to the same spec (usually [{event_type:"CLICK_THROUGH",window_days:7}]). event_type must be CLICK_THROUGH | VIEW_THROUGH | ENGAGED_VIDEO_VIEW (never ENGAGED_VIEW_THROUGH).',
    ),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    validate_only: z.boolean().optional().describe(VALIDATE_ONLY_DESC),
    reason: z.string().min(1),
  },
  handler: async ({ adSetId, resourceId, reason, validate_only, ...params }, endpoints) =>
    endpoints.updateAdSet(adSetId, {
      ...params,
      resourceId,
      reason,
      execution_options: execOpts(validate_only),
    }),
});

export const createAd = defineTool({
  name: 'create_ad',
  description:
    'Create a Meta Ads ad. Born PAUSED (or PENDING_REVIEW). Provide creative_id (existing creative external ID — from list_creatives/create_creative, NOT an ad ID) OR creative_spec (inline, same format as create_creative). reason is required.',
  inputSchema: {
    resourceId: z.string().optional().describe(RESOURCE_ID_DESC),
    name: z.string().min(1),
    adset_id: z.string().describe('Meta external ad set ID'),
    creative_id: z.string().optional().describe('Existing creative external ID'),
    creative_spec: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Inline creative spec (alternative to creative_id): { name?, object_story_spec, asset_feed_spec?, degrees_of_freedom_spec?, url_tags?, product_set_id? } — same structure as create_creative',
      ),
    status: z.enum(['ACTIVE', 'PAUSED']).default('PAUSED'),
    conversion_domain: z
      .string()
      .optional()
      .describe(
        'Domain where the conversion happens (e.g. "loja.com.br" — no subdomain/path). Required by Meta for web-conversion ads (AEM/iOS14).',
      ),
    tracking_specs: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Custom conversion tracking specs. Ex: [{ "action.type": ["offsite_conversion"], "fb_pixel": ["123456"] }]'),
    validate_only: z.boolean().optional().describe(VALIDATE_ONLY_DESC),
    reason: z.string().min(1),
  },
  handler: async ({ validate_only, ...params }, endpoints) =>
    endpoints.createAd({ ...params, execution_options: execOpts(validate_only) }),
});

export const updateAd = defineTool({
  name: 'update_ad',
  description: 'Update a Meta Ads ad. To activate: status=ACTIVE. Changing creative puts ad back to PENDING_REVIEW. reason is required.',
  inputSchema: {
    adId: z.string().describe('Meta external ad ID'),
    resourceId: z.string().optional().describe(RESOURCE_ID_DESC),
    name: z.string().optional(),
    status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
    creative_id: z.string().optional().describe('New creative external ID'),
    validate_only: z.boolean().optional().describe(VALIDATE_ONLY_DESC),
    reason: z.string().min(1),
  },
  handler: async ({ adId, validate_only, ...body }, endpoints) =>
    endpoints.updateAd(adId, { ...body, execution_options: execOpts(validate_only) }),
});

export const uploadImage = defineTool({
  name: 'upload_image',
  description:
    'Upload an image to the Meta ad account from a URL. Returns image_hash for use in creatives. Meta downloads the image server-side.',
  inputSchema: {
    resourceId: z.string().optional().describe(RESOURCE_ID_DESC),
    url: z.string().url().describe('Public URL of the image to upload'),
    name: z.string().optional().describe('Optional label for the image'),
  },
  handler: async (input, endpoints) => endpoints.uploadImage(input),
});

export const uploadVideo = defineTool({
  name: 'upload_video',
  description:
    'Upload a video to the Meta ad account from a file URL. Returns video_id. Check processing status with get_video_status before using in creatives.',
  inputSchema: {
    resourceId: z.string().optional().describe(RESOURCE_ID_DESC),
    fileUrl: z.string().url().describe('Direct URL to the video file'),
    name: z.string().optional(),
  },
  handler: async (input, endpoints) => endpoints.uploadVideo(input),
});

export const createCreative = defineTool({
  name: 'create_creative',
  description: [
    'Create an ad creative with full copy (headline, body, CTA, link). Stored locally + created on Meta. reason is required.',
    'STANDARD: object_story_spec { page_id, instagram_user_id?, link_data | video_data } with image_hash from upload_image / video_id from upload_video.',
    'CATALOG (Advantage+ catalog / dynamic ads): object_story_spec { page_id, template_data: { link, message, name, description, call_to_action } } + product_set_id. Supports template tags {{product.name}}, {{product.price}}, {{product.description}}.',
    'DYNAMIC CREATIVE (multi-asset): asset_feed_spec + object_story_spec with page_id only; ad set must have is_dynamic_creative=true.',
    'ADVANTAGE+ ENHANCEMENTS: control individually via degrees_of_freedom_spec (v22+ — each feature opt-in/opt-out).',
    'UTM: use url_tags — applied to all links of the creative.',
  ].join(' '),
  inputSchema: {
    resourceId: z.string().optional().describe(RESOURCE_ID_DESC),
    name: z.string().min(1),
    object_story_id: z
      .string()
      .optional()
      .describe(
        'Boost an EXISTING published Page post: "{page_id}_{post_id}". Use instead of object_story_spec when promoting an organic post/dark post already published.',
      ),
    object_story_spec: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'page_id (+ instagram_user_id) + link_data | video_data | photo_data | template_data (catalog). ' +
          'link_data: { link, message, name, description, image_hash, call_to_action: { type, value: { link } } }',
      ),
    asset_feed_spec: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Dynamic creative with multiple assets: images[{hash}], videos[{video_id}], bodies[{text}], titles[{text}], descriptions[{text}], link_urls[{website_url}], call_to_action_types[]. Requires object_story_spec with page_id and ad set with is_dynamic_creative=true.',
      ),
    degrees_of_freedom_spec: z
      .object({
        creative_features_spec: z
          .record(z.string(), z.object({ enroll_status: z.enum(['OPT_IN', 'OPT_OUT']) }))
          .describe(
            'Individual Advantage+ enhancement features (v22+). Common: image_templates (overlays), image_touchups (visual touch-ups), text_optimizations (text improvements), inline_comment (relevant comments), image_animation, image_background_gen, video_auto_crop, adapt_to_placement, media_type_automation, music_generation, add_text_overlay, product_extensions, site_extensions, standard_enhancements_catalog (catalog ads). Each: { enroll_status: "OPT_IN" | "OPT_OUT" }',
          ),
      })
      .optional()
      .describe(
        'Granular control of Advantage+ creative enhancements. Ex to DISABLE overlays and enable text improvements: { creative_features_spec: { image_templates: { enroll_status: "OPT_OUT" }, text_optimizations: { enroll_status: "OPT_IN" } } }',
      ),
    url_tags: z
      .string()
      .max(2000)
      .optional()
      .describe(
        'URL parameters (UTMs) appended to every link. Supports dynamic tags: "utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}"',
      ),
    product_set_id: z
      .string()
      .optional()
      .describe('Catalog product set — REQUIRED for catalog creatives (template_data)'),
    reason: z.string().min(1).describe('Required: describe what this creative is for.'),
  },
  handler: async (params, endpoints) => endpoints.createCreative(params),
});

export const metaTools = [
  getAccountSnapshot,
  deepDiveCampaign,
  getLiveMetrics,
  getChangelog,
  getCampaign,
  getAdset,
  getVideoStatus,
  listCreatives,
  createCampaign,
  updateCampaign,
  createAdset,
  updateAdset,
  createAd,
  updateAd,
  uploadImage,
  uploadVideo,
  createCreative,
];

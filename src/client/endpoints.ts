import type { BranorOsClient } from './http.js';
import type { CreativeAsset, Paginated } from './types.js';

/**
 * Per-call identity: which workspace this call is scoped to. Built fresh
 * for every tools/call — NEVER stored on the session/server — because a
 * session can interleave concurrent calls scoped to different workspaces
 * (see src/server.ts).
 */
export interface CallContext {
  /** publicId of the workspace this call is scoped to. */
  workspaceId: string;
}

/**
 * One thin function per real endpoint this MCP server calls. No business
 * logic here — that lives in src/tools/*. Kept separate from BranorOsClient
 * so request-shaping (path/query/body) can be unit tested against a mocked
 * client without a live server.
 *
 * Every function below closes over `ctx` (built per-call in src/server.ts)
 * so tool handlers keep calling `endpoints.listCreativeAssets(...)` exactly
 * as-is — the workspace threading is invisible to them.
 */
export function createEndpoints(client: BranorOsClient, ctx: CallContext) {
  const wp = (suffix: string) => client.workspacePath(ctx.workspaceId, suffix);

  return {
    // ── Workspaces ──────────────────────────────────────────────────────

    /**
     * GET /workspaces — workspaces acessíveis pela API key (com key de
     * organização, todos os workspaces da org). NÃO scoped a workspace —
     * path direto, sem passar por wp(). Backing tool: workspace_list.
     */
    listWorkspaces: () => client.get<unknown>('/workspaces'),

    /**
     * GET /workspaces/{workspaceId}/members — membros do workspace (papel +
     * usuário). Backing tool: workspace_members.
     */
    listWorkspaceMembers: () => client.get<unknown>(wp('/members')),

    /**
     * GET /workspaces/{workspaceId}/creative-assets — the creative asset
     * library for this workspace, with optional type/status/search
     * filtering and pagination. Backing tool: list_creative_assets.
     */
    listCreativeAssets: (opts?: {
      type?: string;
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
    }) =>
      client.get<Paginated<CreativeAsset>>(wp('/creative-assets'), {
        type: opts?.type,
        status: opts?.status,
        search: opts?.search,
        page: opts?.page,
        limit: opts?.limit,
      }),

    /**
     * GET /workspaces/{workspaceId}/creative-assets/search?q=... — semantic
     * search (embedding + pgvector). Backing tool: search_creative_assets.
     */
    searchCreativeAssets: (opts: { q: string; limit?: number }) =>
      client.get<unknown>(wp('/creative-assets/search'), {
        q: opts.q,
        limit: opts.limit,
      }),

    /**
     * GET /workspaces/{workspaceId}/creative-assets/{id} — full asset
     * details. Backing tool: get_creative_asset.
     */
    getCreativeAsset: (id: string) => client.get<CreativeAsset>(wp(`/creative-assets/${id}`)),

    /**
     * POST /workspaces/{workspaceId}/creative-assets — register a new
     * asset. Backing tool: create_creative_asset.
     */
    createCreativeAsset: (body: {
      name: string;
      type: string;
      description?: string;
      transcript?: string;
      tags?: string[];
      mediaItems?: Array<{ url: string; order?: number; mimeType?: string }>;
    }) => client.post<CreativeAsset>(wp('/creative-assets'), body),

    /**
     * PATCH /workspaces/{workspaceId}/creative-assets/{id} — update fields
     * on an existing asset. Backing tool: update_creative_asset.
     */
    updateCreativeAsset: (
      id: string,
      body: {
        name?: string;
        status?: string;
        description?: string | null;
        transcript?: string | null;
        tags?: string[];
        mediaItems?: Array<{ url: string; order?: number; mimeType?: string | null }>;
        analysis?: Record<string, unknown> | null;
        style?: string | null;
        source?: string | null;
      },
    ) => client.patch<CreativeAsset>(wp(`/creative-assets/${id}`), body),

    /**
     * POST /workspaces/{workspaceId}/creative-assets/upload-media — ingest
     * an original media file by URL. Backing tool: upload_creative_media.
     */
    uploadCreativeMedia: (body: {
      fileUrl: string;
      name: string;
      type: string;
      mimeType?: string;
      description?: string;
      tags?: string[];
      style?: string;
      source?: string;
      platformRefs?: Array<{ platform: string; externalId: string; resourceId?: string }>;
    }) => client.post<CreativeAsset>(wp('/creative-assets/upload-media'), body),

    /**
     * POST /workspaces/{workspaceId}/creative-assets/{id}/platform-refs —
     * attach a platform_ref without pushing to the platform. Backing tool:
     * link_platform_ref.
     */
    linkPlatformRef: (
      id: string,
      body: {
        platform: string;
        externalId: string;
        resourceId?: string;
        mediaItemId?: string;
      },
    ) => client.post<CreativeAsset>(wp(`/creative-assets/${id}/platform-refs`), body),

    /**
     * POST /workspaces/{workspaceId}/creative-assets/{id}/push-to-meta —
     * upload the asset's media to the Meta ad account library. Backing
     * tool: push_asset_to_meta.
     */
    pushAssetToMeta: (id: string, body: { resourceId?: string }) =>
      client.post<unknown>(wp(`/creative-assets/${id}/push-to-meta`), body),

    /**
     * POST /workspaces/{workspaceId}/creative-assets/reconcile-ads —
     * reconcile synced ads with the creative asset library. Backing tool:
     * reconcile_creative_assets.
     */
    reconcileCreativeAssets: () => client.post<unknown>(wp('/creative-assets/reconcile-ads')),

    /**
     * GET /workspaces/{workspaceId}/creative-assets/{id}/ads — ads linked
     * to this creative asset. Backing tool: get_asset_ads.
     */
    getAssetAds: (id: string, opts?: { startDate?: string; endDate?: string }) =>
      client.get<unknown>(wp(`/creative-assets/${id}/ads`), {
        startDate: opts?.startDate,
        endDate: opts?.endDate,
      }),

    /**
     * GET /workspaces/{workspaceId}/creative-assets/{id}/metrics —
     * aggregated metrics for this creative asset. Backing tool:
     * get_asset_metrics.
     */
    getAssetMetrics: (id: string, opts?: { startDate?: string; endDate?: string }) =>
      client.get<unknown>(wp(`/creative-assets/${id}/metrics`), {
        startDate: opts?.startDate,
        endDate: opts?.endDate,
      }),

    /**
     * POST /workspaces/{workspaceId}/creative-assets/{id}/analyze —
     * analyze the asset's media via AI. Backing tool:
     * analyze_creative_asset.
     */
    analyzeCreativeAsset: (id: string) =>
      client.post<unknown>(wp(`/creative-assets/${id}/analyze`)),

    // ── Meta Ads: read ──────────────────────────────────────────────────

    /**
     * GET /workspaces/{workspaceId}/meta/agent/account-snapshot — full
     * campaigns→adsets→ads tree with d-1 synced metrics, deltas vs a
     * comparison period, flags and recent changelog. Backing tool:
     * get_account_snapshot.
     */
    getAccountSnapshot: (query: {
      resourceId?: string;
      period?: string;
      dateStart?: string;
      dateEnd?: string;
      compare?: string;
      includeToday?: boolean;
      scope?: string;
      depth?: string;
    }) => client.get<unknown>(wp('/meta/agent/account-snapshot'), query),

    /**
     * GET /workspaces/{workspaceId}/meta/agent/campaigns/{campaignId}/deep-dive
     * — full config + copy + daily time series + breakdowns (live, cached
     * 15 min) + change history for one campaign. Backing tool:
     * deep_dive_campaign.
     */
    getCampaignDeepDive: (
      campaignId: string,
      query: { resourceId?: string; period?: string; dateStart?: string; dateEnd?: string },
    ) => client.get<unknown>(wp(`/meta/agent/campaigns/${campaignId}/deep-dive`), query),

    /**
     * GET /workspaces/{workspaceId}/meta/agent/live-metrics — today's
     * partial metrics straight from the Graph API (cached 5 min). Backing
     * tool: get_live_metrics.
     */
    getLiveMetrics: (query: {
      resourceId?: string;
      level: string;
      ids: string;
      hourly?: boolean;
    }) => client.get<unknown>(wp('/meta/agent/live-metrics'), query),

    /**
     * GET /workspaces/{workspaceId}/meta/agent/changelog — history of
     * changes detected by sync (source=sync) and written via API
     * (source=api). Backing tool: get_changelog.
     */
    getChangelog: (query: {
      resourceId?: string;
      since?: string;
      until?: string;
      entityType?: string;
      externalId?: string;
      source?: string;
      apiKeyId?: string;
      page?: number;
      limit?: number;
    }) => client.get<unknown>(wp('/meta/agent/changelog'), query),

    /**
     * GET /workspaces/{workspaceId}/meta/live/campaigns/{campaignId} — read
     * a single campaign LIVE from the Meta Graph API (current config, not
     * synced data). Backing tool: get_campaign.
     */
    getCampaignLive: (campaignId: string, opts?: { resourceId?: string }) =>
      client.get<unknown>(wp(`/meta/live/campaigns/${campaignId}`), {
        resourceId: opts?.resourceId,
      }),

    /**
     * GET /workspaces/{workspaceId}/meta/live/adsets/{adSetId} — read a
     * single ad set LIVE from the Meta Graph API (full targeting spec,
     * optimization_goal, bid strategy, etc). Backing tool: get_adset.
     */
    getAdSetLive: (adSetId: string, opts?: { resourceId?: string }) =>
      client.get<unknown>(wp(`/meta/live/adsets/${adSetId}`), {
        resourceId: opts?.resourceId,
      }),

    /**
     * GET /workspaces/{workspaceId}/meta/agent/media/videos/{videoId}/status
     * — check a video's Meta processing status. Backing tool:
     * get_video_status.
     */
    getVideoStatus: (videoId: string, opts?: { resourceId?: string }) =>
      client.get<unknown>(wp(`/meta/agent/media/videos/${videoId}/status`), {
        resourceId: opts?.resourceId,
      }),

    /**
     * GET /workspaces/{workspaceId}/meta/agent/creatives — ad creatives
     * stored locally (DB), with copy (title/body/CTA/link) and Meta
     * externalId to use as creative_id in create_ad. Backing tool:
     * list_creatives.
     */
    listCreatives: (opts?: {
      resourceId?: string;
      search?: string;
      page?: number;
      limit?: number;
    }) =>
      client.get<unknown>(wp('/meta/agent/creatives'), {
        resourceId: opts?.resourceId,
        search: opts?.search,
        page: opts?.page,
        limit: opts?.limit,
      }),

    // ── Meta Ads: write ─────────────────────────────────────────────────

    /**
     * POST /workspaces/{workspaceId}/meta/campaigns — create a Meta Ads
     * campaign (born PAUSED). Backing tool: create_campaign.
     */
    createCampaign: (body: Record<string, unknown>) =>
      client.post<unknown>(wp('/meta/campaigns'), body),

    /**
     * PATCH /workspaces/{workspaceId}/meta/campaigns/{campaignId} — update
     * a Meta Ads campaign. Backing tool: update_campaign.
     */
    updateCampaign: (campaignId: string, body: Record<string, unknown>) =>
      client.patch<unknown>(wp(`/meta/campaigns/${campaignId}`), body),

    /**
     * POST /workspaces/{workspaceId}/meta/adsets — create a Meta Ads ad set
     * (born PAUSED). Backing tool: create_adset.
     */
    createAdSet: (body: Record<string, unknown>) =>
      client.post<unknown>(wp('/meta/adsets'), body),

    /**
     * PATCH /workspaces/{workspaceId}/meta/adsets/{adSetId} — update a Meta
     * Ads ad set. Backing tool: update_adset.
     */
    updateAdSet: (adSetId: string, body: Record<string, unknown>) =>
      client.patch<unknown>(wp(`/meta/adsets/${adSetId}`), body),

    /**
     * POST /workspaces/{workspaceId}/meta/ads — create a Meta Ads ad (born
     * PAUSED/PENDING_REVIEW). Backing tool: create_ad.
     */
    createAd: (body: Record<string, unknown>) => client.post<unknown>(wp('/meta/ads'), body),

    /**
     * PATCH /workspaces/{workspaceId}/meta/ads/{adId} — update a Meta Ads
     * ad. Backing tool: update_ad.
     */
    updateAd: (adId: string, body: Record<string, unknown>) =>
      client.patch<unknown>(wp(`/meta/ads/${adId}`), body),

    /**
     * POST /workspaces/{workspaceId}/meta/agent/media/images — upload an
     * image to the Meta ad account library from a URL. Backing tool:
     * upload_image.
     */
    uploadImage: (body: { resourceId?: string; url: string; name?: string }) =>
      client.post<unknown>(wp('/meta/agent/media/images'), body),

    /**
     * POST /workspaces/{workspaceId}/meta/agent/media/videos — upload a
     * video to the Meta ad account library from a file URL. Backing tool:
     * upload_video.
     */
    uploadVideo: (body: { resourceId?: string; fileUrl: string; name?: string }) =>
      client.post<unknown>(wp('/meta/agent/media/videos'), body),

    /**
     * POST /workspaces/{workspaceId}/meta/agent/creatives — create an ad
     * creative (full copy, catalog, dynamic creative, or object_story_id
     * boost). Backing tool: create_creative.
     */
    createCreative: (body: Record<string, unknown>) =>
      client.post<unknown>(wp('/meta/agent/creatives'), body),

    // ── Tasks ───────────────────────────────────────────────────────────

    /**
     * GET /workspaces/{workspaceId}/spaces/{spaceId}/lists/{listId}/tasks —
     * list all tasks in a list. Backing tool: list_tasks.
     */
    listTasks: (spaceId: string, listId: string) =>
      client.get<unknown>(wp(`/spaces/${spaceId}/lists/${listId}/tasks`)),

    /**
     * GET /workspaces/{workspaceId}/spaces/{spaceId}/lists/{listId}/tasks/{id}
     * — full details of a single task. Backing tool: get_task.
     */
    getTask: (spaceId: string, listId: string, taskId: string) =>
      client.get<unknown>(wp(`/spaces/${spaceId}/lists/${listId}/tasks/${taskId}`)),

    /**
     * POST /workspaces/{workspaceId}/spaces/{spaceId}/lists/{listId}/tasks —
     * create a task in the list. Backing tool: create_task.
     */
    createTask: (
      spaceId: string,
      listId: string,
      body: {
        title: string;
        description?: string;
        statusItemId?: string;
        priority?: number;
        dueAt?: string;
        assigneeIds?: string[];
      },
    ) => client.post<unknown>(wp(`/spaces/${spaceId}/lists/${listId}/tasks`), body),

    /**
     * PATCH /workspaces/{workspaceId}/spaces/{spaceId}/lists/{listId}/tasks/{id}
     * — update a task. Backing tool: update_task.
     */
    updateTask: (
      spaceId: string,
      listId: string,
      taskId: string,
      body: {
        title?: string;
        description?: string | null;
        statusItemId?: string;
        priority?: number | null;
        dueAt?: string | null;
      },
    ) => client.patch<unknown>(wp(`/spaces/${spaceId}/lists/${listId}/tasks/${taskId}`), body),

    // ── Memory ──────────────────────────────────────────────────────────

    /**
     * POST /workspaces/{workspaceId}/memories — create a memory (atomic
     * fact/record for future agent recall). Backing tool: memory_add.
     */
    createMemory: (body: {
      scope: string;
      memoryType: string;
      content: string;
      summary?: string;
      sourceType: string;
      clientSlug?: string;
      agentId?: string;
      sessionId?: string;
      projectSlug?: string;
      visibility?: string;
      importance?: number;
      confidence?: string;
      sourceRef?: string;
      slug?: string;
      retrieval?: {
        exactSearchKeys?: string[];
        fuzzySearchKeys?: string[];
        loadWhen?: Record<string, unknown>;
        priority?: 'high' | 'medium' | 'low';
        aliases?: string[];
      };
      wikiId?: string;
      wikiNodeId?: string;
      sourceChunkId?: string;
      eventDate?: string;
      metadata?: Record<string, unknown>;
    }) => client.post<unknown>(wp('/memories'), body),

    /**
     * GET /workspaces/{workspaceId}/memories — simple, non-semantic listing
     * of memories in scope (no importance ordering; see bootstrapMemory for
     * that). Backing tool: memory_list.
     */
    listMemories: (query?: {
      clientSlug?: string;
      agentId?: string;
      sessionId?: string;
      projectSlug?: string;
      memoryType?: string[];
      scope?: string;
      visibility?: string;
      limit?: number;
      cursor?: string;
    }) =>
      client.get<unknown>(wp('/memories'), {
        clientSlug: query?.clientSlug,
        agentId: query?.agentId,
        sessionId: query?.sessionId,
        projectSlug: query?.projectSlug,
        memoryType: query?.memoryType?.length
          ? query.memoryType.join(',')
          : undefined,
        scope: query?.scope,
        visibility: query?.visibility,
        limit: query?.limit,
        cursor: query?.cursor,
      }),

    /**
     * POST /workspaces/{workspaceId}/memories/consolidate — enqueues a job
     * that consolidates raw material (e.g. a conversation transcript) into
     * one or more memories. Backing tool: memory_consolidate.
     */
    consolidateMemory: (body: {
      material: string;
      sessionId: string;
      agentId?: string;
      clientSlug?: string;
    }) => client.post<unknown>(wp('/memories/consolidate'), body),

    /**
     * POST /workspaces/{workspaceId}/memories/{id}/links — link a memory to
     * another memory or wiki node in the memory graph (DEPENDS_ON,
     * SUPERSEDES, RELATES_TO, ...). Backing tool: memory_link_add.
     */
    createMemoryLink: (
      id: string,
      body: {
        targetType: string;
        targetMemoryId?: string;
        targetNodeId?: string;
        targetRef?: string;
        linkType: string;
        reason?: string;
      },
    ) => client.post<unknown>(wp(`/memories/${id}/links`), body),

    /**
     * GET /workspaces/{workspaceId}/memories/{id}/links — list the links
     * from a memory in the memory graph. Backing tool: memory_links_list.
     */
    listMemoryLinks: (id: string) => client.get<unknown>(wp(`/memories/${id}/links`)),

    /**
     * DELETE /workspaces/{workspaceId}/memories/links/{linkId} — remove a
     * link from the memory graph. Backing tool: memory_link_delete.
     */
    deleteMemoryLink: (linkId: string) =>
      client.delete<unknown>(wp(`/memories/links/${linkId}`)),

    /**
     * POST /workspaces/{workspaceId}/memories/search — semantic search over
     * the workspace's memories. Backing tool: memory_search.
     */
    searchMemory: (body: {
      query: string;
      clientSlug?: string;
      agentId?: string;
      sessionId?: string;
      projectSlug?: string;
      topK?: number;
      memoryType?: string[];
      minImportance?: number;
    }) => client.post<unknown>(wp('/memories/search'), body),

    /**
     * PATCH /workspaces/{workspaceId}/memories/{id} — edit a memory
     * (content/summary/slug/memoryType/scope/importance/visibility). Never
     * used to soft-delete. Backing tool: memory_update.
     */
    updateMemory: (
      id: string,
      body: {
        content?: string;
        summary?: string;
        slug?: string;
        memoryType?: string;
        scope?: string;
        importance?: number;
        visibility?: string;
        confidence?: string;
        retrieval?: {
          exactSearchKeys?: string[];
          fuzzySearchKeys?: string[];
          loadWhen?: Record<string, unknown>;
          priority?: 'high' | 'medium' | 'low';
          aliases?: string[];
        };
        metadata?: Record<string, unknown>;
        isActive?: boolean;
      },
      filters?: { clientSlug?: string; agentId?: string },
    ) =>
      client.request<unknown>(wp(`/memories/${id}`), {
        method: 'PATCH',
        body,
        query: {
          clientSlug: filters?.clientSlug,
          agentId: filters?.agentId,
        },
      }),

    /**
     * GET /workspaces/{workspaceId}/memories/{id} — fetch a single memory
     * (id or publicId). Backing tool: memory_get.
     */
    getMemory: (id: string, filters?: { clientSlug?: string; agentId?: string }) =>
      client.request<unknown>(wp(`/memories/${id}`), {
        method: 'GET',
        query: {
          clientSlug: filters?.clientSlug,
          agentId: filters?.agentId,
        },
      }),

    /**
     * DELETE /workspaces/{workspaceId}/memories/{id} — soft-delete a memory
     * (isActive=false + deletedAt; never a physical delete). Backing tool:
     * memory_deactivate.
     */
    deactivateMemory: (id: string, filters?: { clientSlug?: string; agentId?: string }) =>
      client.request<unknown>(wp(`/memories/${id}`), {
        method: 'DELETE',
        query: {
          clientSlug: filters?.clientSlug,
          agentId: filters?.agentId,
        },
      }),

    /**
     * GET /workspaces/{workspaceId}/memories/gc-candidates — read-only
     * suggestions of cold memories (downgrade or soft-delete), never
     * mutates. Backing tool: memory_gc_candidates.
     */
    gcCandidatesMemory: (query?: {
      maxImportance?: number;
      maxAccessCount?: number;
      inactiveDays?: number;
      limit?: number;
      clientSlug?: string;
      agentId?: string;
    }) =>
      client.get<unknown>(wp('/memories/gc-candidates'), {
        maxImportance: query?.maxImportance,
        maxAccessCount: query?.maxAccessCount,
        inactiveDays: query?.inactiveDays,
        limit: query?.limit,
        clientSlug: query?.clientSlug,
        agentId: query?.agentId,
      }),

    /**
     * GET /workspaces/{workspaceId}/memories/bootstrap — non-semantic
     * listing of memories in scope, ordered by importance desc (then
     * recency). Meant to preload an agent's session context. Backing tool:
     * memory_bootstrap.
     */
    bootstrapMemory: (query: {
      clientSlug?: string;
      agentId?: string;
      sessionId?: string;
      projectSlug?: string;
      memoryType?: string[];
      minImportance?: number;
      limit?: number;
    }) =>
      client.get<unknown>(wp('/memories/bootstrap'), {
        clientSlug: query.clientSlug,
        agentId: query.agentId,
        sessionId: query.sessionId,
        projectSlug: query.projectSlug,
        memoryType: query.memoryType?.length
          ? query.memoryType.join(',')
          : undefined,
        minImportance: query.minImportance,
        limit: query.limit,
      }),

    // ── Wiki (Biblioteca) ───────────────────────────────────────────────

    /**
     * POST /workspaces/{workspaceId}/wikis/{wikiId}/search — hybrid
     * (semantic + lexical) search over an indexed wiki. Backing tool:
     * wiki_search.
     */
    searchWiki: (
      wikiId: string,
      body: {
        query: string;
        tags?: string[];
        pathPrefix?: string;
        kind?: string;
        topK?: number;
      },
    ) => client.post<unknown>(wp(`/wikis/${wikiId}/search`), body),

    /**
     * GET /workspaces/{workspaceId}/wikis/{wikiId}/nodes/{nodeId} — read a
     * wiki node (full rawContent/tags/metadata). Backing tool:
     * wiki_node_read.
     */
    getWikiNode: (wikiId: string, nodeId: string) =>
      client.get<unknown>(wp(`/wikis/${wikiId}/nodes/${nodeId}`)),

    /**
     * POST /workspaces/{workspaceId}/wikis/{wikiId}/nodes — create a new
     * wiki node (FILE or FOLDER). Backing tool: wiki_node_write (when
     * nodeId is omitted).
     */
    createWikiNode: (
      wikiId: string,
      body: {
        type: string;
        name: string;
        parentId?: string;
        extension?: string;
        kind?: string;
        rawContent?: string;
        sortOrder?: number;
        tags?: string[];
      },
    ) => client.post<unknown>(wp(`/wikis/${wikiId}/nodes`), body),

    /**
     * PATCH /workspaces/{workspaceId}/wikis/{wikiId}/nodes/{nodeId} —
     * update an existing wiki node (rename/move/reorder/content/tags).
     * Backing tool: wiki_node_write (when nodeId is provided).
     */
    updateWikiNode: (
      wikiId: string,
      nodeId: string,
      body: {
        name?: string;
        parentId?: string | null;
        rawContent?: string;
        sortOrder?: number;
        tags?: string[];
      },
    ) => client.patch<unknown>(wp(`/wikis/${wikiId}/nodes/${nodeId}`), body),

    /**
     * DELETE /workspaces/{workspaceId}/wikis/{wikiId}/nodes/{nodeId} —
     * soft-delete a node and its descendants recursively. Backing tool:
     * wiki_node_delete.
     */
    deleteWikiNode: (wikiId: string, nodeId: string) =>
      client.delete<unknown>(wp(`/wikis/${wikiId}/nodes/${nodeId}`)),

    /**
     * GET /workspaces/{workspaceId}/wikis — list the wikis (Bibliotecas)
     * available in the workspace. Backing tool: wiki_list.
     */
    listWikis: () => client.get<unknown>(wp('/wikis')),

    /**
     * GET /workspaces/{workspaceId}/wikis/{wikiId}/tree — hierarchical
     * tree of nodes (folders/files) for navigation without semantic
     * search. Backing tool: wiki_tree.
     */
    getWikiTree: (wikiId: string) =>
      client.get<unknown>(wp(`/wikis/${wikiId}/tree`)),

    /**
     * GET /workspaces/{workspaceId}/wikis/{wikiId}/graph — graph of nodes
     * + resolved edges (links between notes). Backing tool: wiki_graph.
     */
    getWikiGraph: (wikiId: string) =>
      client.get<unknown>(wp(`/wikis/${wikiId}/graph`)),

    /**
     * POST /workspaces/{workspaceId}/wikis/{wikiId}/git/push — força
     * commit+push (DB→git) de uma wiki git-backed. Requer WikiGitLink
     * conectado. Backing tool: wiki_push.
     */
    pushWikiGit: (wikiId: string) =>
      client.post<unknown>(wp(`/wikis/${wikiId}/git/push`)),

    /**
     * GET /workspaces/{workspaceId}/wikis/{wikiId}/git — estado git da
     * wiki (conectada, últimos sync/push, nós pendentes de push). Backing
     * tool: wiki_git_status.
     */
    getWikiGitStatus: (wikiId: string) =>
      client.get<unknown>(wp(`/wikis/${wikiId}/git`)),
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;

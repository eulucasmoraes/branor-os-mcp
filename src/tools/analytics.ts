// TODO: portar tools do domínio Analytics (semantic layer / branor-metrics-api
// — POST /analytics/query): gasto, ROAS, CPA, CTR, séries temporais,
// comparação de períodos, breakdowns por campanha/conjunto/anúncio/
// plataforma/origem-mídia/região/produto (Meta/Google/TikTok/LinkedIn +
// GA4 + UNIFIED). Ver trilho-b-metrics-api.md no vault.

import type { ToolDef } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const analyticsTools: ToolDef<any>[] = [];

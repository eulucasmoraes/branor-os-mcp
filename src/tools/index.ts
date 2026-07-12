import { creativeAssetTools } from './creative-assets.js';
import { metaTools } from './meta.js';
import { analyticsTools } from './analytics.js';
import { taskTools } from './tasks.js';
import { memoryTools } from './memory.js';
import { wikiTools } from './wiki.js';
import { workspaceTools } from './workspaces.js';
import type { ToolDef } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const allTools: ToolDef<any>[] = [
  ...creativeAssetTools,
  ...metaTools,
  ...analyticsTools,
  ...taskTools,
  ...memoryTools,
  ...wikiTools,
  ...workspaceTools,
];

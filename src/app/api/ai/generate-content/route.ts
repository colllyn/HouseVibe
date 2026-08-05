/**
 * POST /api/ai/generate-content
 *
 * Generates platform-specific marketing content (xiaohongshu, douyin, wechat_moments)
 * from safe property facts. Requires: content_factory entitlement.
 *
 * Contract: docs/contracts/ai-contract.md v2.0
 *           docs/contracts/api-contract.md §10.6
 */

import { createGenerateContentHandler } from "@/lib/ai/routes/generate-content-handler";

const handler = createGenerateContentHandler();
export const POST = handler;

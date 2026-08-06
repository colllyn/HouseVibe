/**
 * POST /api/ai/analyze-property-images
 *
 * Analyzes property images using DeepSeek-VL, saves AI labels,
 * visual summary, and fact flags. Requires workspace membership
 * and property ownership verification.
 *
 * Contract: docs/contracts/api-contract.md
 *           docs/contracts/ai-contract.md v2.0 §2.3
 */

import { createAnalyzeImagesHandler } from "@/lib/ai/routes/analyze-property-images-handler";

const handler = createAnalyzeImagesHandler();
export const POST = handler;

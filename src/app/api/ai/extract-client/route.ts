/**
 * POST /api/ai/extract-client
 *
 * Extracts structured client facts from unstructured text (chat records, voice transcripts, etc.).
 * Requires: ai_data_extraction entitlement, valid workspace membership.
 *
 * Contract: docs/contracts/ai-contract.md v2.0
 *           docs/contracts/api-contract.md §10.3
 */

import { createExtractClientHandler } from "@/lib/ai/routes/extract-client-handler";

const handler = createExtractClientHandler();
export const POST = handler;

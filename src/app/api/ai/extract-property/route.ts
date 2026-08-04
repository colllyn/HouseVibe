/**
 * POST /api/ai/extract-property
 *
 * Extracts structured property facts from unstructured text (chat records, voice transcripts, etc.).
 * Requires: ai_data_extraction entitlement, valid workspace membership.
 *
 * Contract: docs/contracts/ai-contract.md v2.0
 *           docs/contracts/api-contract.md §10.2
 */

import { createExtractPropertyHandler } from "@/lib/ai/routes/extract-property-handler";

const handler = createExtractPropertyHandler();
export const POST = handler;

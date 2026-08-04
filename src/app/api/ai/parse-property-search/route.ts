/**
 * POST /api/ai/parse-property-search
 *
 * Parses a natural-language property search query into structured filters.
 * Requires: semantic_search entitlement, valid workspace membership.
 *
 * Contract: docs/contracts/ai-contract.md v2.0
 *           docs/contracts/api-contract.md §10.5
 */

import { createParsePropertySearchHandler } from "@/lib/ai/routes/parse-property-search-handler";

const handler = createParsePropertySearchHandler();
export const POST = handler;

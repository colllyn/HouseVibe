/**
 * POST /api/ai/transcribe
 *
 * Receives an audio file, validates it server-side, and returns
 * the transcribed text via a configured STT provider.
 *
 * Contract: docs/contracts/ai-contract.md v2.0 §2.1
 *           docs/contracts/api-contract.md §10.1
 */

import { createTranscribeHandler } from "@/lib/ai/routes/transcribe-handler";

const handler = createTranscribeHandler();
export const POST = handler;

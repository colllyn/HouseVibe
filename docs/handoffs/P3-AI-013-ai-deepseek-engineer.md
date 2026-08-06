# P3-AI-013 — User Preference Learning

## Status: COMPLETE

## Summary

Implemented AI user preference learning system (P3-AI-013). The system analyzes `ai_correction_logs` for consistent correction patterns and automatically learns user preferences when the same field is corrected in the same direction ≥ `AI_PREFERENCE_MIN_EVIDENCE` (default 3) times.

## Key Deliverables

### Database
- `supabase/migrations/20260806000007_ai_user_preferences.sql`: New `ai_user_preferences` table with:
  - RLS: users read/delete own, admins read all, no direct INSERT
  - BEFORE UPDATE trigger restricting modifications to `status` and `updated_at` only
  - `upsert_ai_preference` RPC with auth, workspace, and fact field guards
  - `learn_preferences` RPC for pattern detection from correction logs
  - `get_active_preferences` RPC for prompt injection
  - Defense-in-depth fact field blocklist at DB level

### Feature Logic (`src/features/ai-preferences/`)
- `schemas.ts`: Zod schemas with comprehensive fact field blocklist (camelCase + snake_case)
- `preference-engine.ts`: Core logic for learning, prompt hint formatting, and preference management

### API Routes
- `GET /api/me/ai-preferences`: List user preferences (auth + workspace required)
- `DELETE /api/me/ai-preferences/[id]`: Delete preference (ownership verified)
- `PATCH /api/me/ai-preferences/[id]`: Toggle preference active/disabled (Zod validated)

### Prompt Hint Integration
- `UserPreferenceHint` type added to `PropertyExtractionInput`, `ClientExtractionInput`, `SearchParseInput`
- `formatPreferenceHints()` helper in `DeepSeekTextProvider`
- `generate-content-handler.ts` fetches and injects preferences before model call

### Settings UI
- `/settings/ai-preferences` page with loading/empty/error/loaded states
- Preference cards with confidence indicators, toggle, and delete controls
- Added "AI 偏好" to settings navigation

## Security
- Auth + workspace checks on all API endpoints
- RLS policies with column-level trigger guard
- Fact field blocklist prevents learning of price, area, contacts, address
- Hint text uses type-level descriptions (never raw values that may contain PII)
- `originalPattern`/`preferredPattern` truncated to 50 chars max
- All RPCs use SECURITY DEFINER + `search_path = ''`

## Quality Gates
- TypeScript strict: PASS
- ESLint: PASS (no errors)
- Vitest: 41 files, 1037 tests PASS
- Build: PASS

## Reviewer Notes
- ai-deepseek-engineer review: P0=0, P1=4 (all 4 P1 issues fixed)
- P1-1: RLS UPDATE column restriction → fixed with BEFORE UPDATE trigger
- P1-2: Missing DB-level fact fields → added `clientIdNumber`/`client_id_number`
- P1-3: Raw values in hints → changed to type-level descriptions, truncated stored values
- P1-4: upsert_ai_preference lacking fact guard → added comprehensive fact field check

## Files Changed
- `supabase/migrations/20260806000007_ai_user_preferences.sql` (new)
- `src/features/ai-preferences/schemas.ts` (new)
- `src/features/ai-preferences/preference-engine.ts` (new)
- `src/features/ai-preferences/__tests__/schemas.test.ts` (new)
- `src/features/ai-preferences/__tests__/preference-engine.test.ts` (new)
- `src/app/api/me/ai-preferences/route.ts` (new)
- `src/app/api/me/ai-preferences/[id]/route.ts` (new)
- `src/app/api/me/ai-preferences/__tests__/route.test.ts` (new)
- `src/app/(dashboard)/settings/ai-preferences/page.tsx` (new)
- `src/lib/ai/types.ts` (modified — added userPreferences to input types)
- `src/lib/ai/providers/deepseek-text-provider.ts` (modified — prompt hint integration)
- `src/lib/ai/routes/generate-content-handler.ts` (modified — preference injection)
- `src/components/ui/settings-layout.tsx` (modified — added AI preferences nav item)

-- ============================================================
-- P3-AI-021: Add CHECK constraints on publishing_records metrics
-- Prevents negative metric values at the database layer (defense-in-depth).
-- ============================================================

alter table public.publishing_records
  add constraint chk_pr_views_nonnegative check (views >= 0),
  add constraint chk_pr_likes_nonnegative check (likes >= 0),
  add constraint chk_pr_favorites_nonnegative check (favorites >= 0),
  add constraint chk_pr_comments_nonnegative check (comments >= 0),
  add constraint chk_pr_direct_messages_nonnegative check (direct_messages >= 0),
  add constraint chk_pr_qualified_leads_nonnegative check (qualified_leads >= 0),
  add constraint chk_pr_viewings_nonnegative check (viewings >= 0),
  add constraint chk_pr_deals_nonnegative check (deals >= 0);

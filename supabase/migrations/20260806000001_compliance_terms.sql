-- Migration: compliance_terms table + RLS
-- Task: P3-AI-020
-- Owner: ai-deepseek-engineer
-- Contract: docs/contracts/domain-model.md §2.25

-- 1. Create compliance severity enum
DO $$ BEGIN
  CREATE TYPE compliance_severity AS ENUM ('blocked', 'review', 'highlight');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create compliance_terms table
CREATE TABLE IF NOT EXISTS compliance_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term TEXT NOT NULL,
  category TEXT NOT NULL,
  severity compliance_severity NOT NULL DEFAULT 'review',
  match_type TEXT NOT NULL DEFAULT 'exact',
  replacement_suggestion TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes per domain model §2.25
CREATE INDEX IF NOT EXISTS idx_compliance_terms_status_severity_term
  ON compliance_terms (status, severity, term);

CREATE INDEX IF NOT EXISTS idx_compliance_terms_category
  ON compliance_terms (category);

CREATE INDEX IF NOT EXISTS idx_compliance_terms_created_by
  ON compliance_terms (created_by);

-- 4. Enable RLS
ALTER TABLE compliance_terms ENABLE ROW LEVEL SECURITY;

-- 4a. Grant table-level permissions
GRANT SELECT ON public.compliance_terms TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.compliance_terms TO authenticated;
GRANT ALL ON public.compliance_terms TO service_role;

-- 5. RLS Policies
-- All authenticated users can read active terms (needed for compliance checks)
CREATE POLICY "Anyone can read active compliance terms"
  ON compliance_terms
  FOR SELECT
  USING (status = 'active');

-- Only system admins can insert
CREATE POLICY "Only system admins can insert compliance terms"
  ON compliance_terms
  FOR INSERT
  WITH CHECK (private.is_system_admin());

-- Only system admins can update
CREATE POLICY "Only system admins can update compliance terms"
  ON compliance_terms
  FOR UPDATE
  USING (private.is_system_admin())
  WITH CHECK (private.is_system_admin());

-- Only system admins can delete (soft-delete via status update)
CREATE POLICY "Only system admins can delete compliance terms"
  ON compliance_terms
  FOR DELETE
  USING (private.is_system_admin());

-- 6. Audit trigger for compliance term changes
CREATE OR REPLACE FUNCTION audit_compliance_term_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    workspace_id,
    user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data
  ) VALUES (
    '00000000-0000-0000-0000-000000000000'::UUID, -- system-level, no workspace
    auth.uid(),
    TG_OP,
    'compliance_terms',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_compliance_term ON compliance_terms;
CREATE TRIGGER trg_audit_compliance_term
  AFTER INSERT OR UPDATE OR DELETE ON compliance_terms
  FOR EACH ROW EXECUTE FUNCTION audit_compliance_term_change();

-- Migration: Fix broken audit trigger on compliance_terms
-- P3-AI-020 follow-up: the original trigger used wrong column names
-- (user_id instead of actor_user_id, table_name instead of entity_type, etc.)
-- and a zero UUID for workspace_id that would cause FK violations.
--
-- This migration drops the broken trigger and replaces it with a
-- corrected version matching the actual audit_logs column contract.

-- 1. Drop the broken trigger and function
DROP TRIGGER IF EXISTS trg_audit_compliance_term ON compliance_terms;
DROP FUNCTION IF EXISTS audit_compliance_term_change();

-- 2. Create corrected trigger function
CREATE OR REPLACE FUNCTION audit_compliance_term_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    workspace_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data
  ) VALUES (
    null,  -- system-level operation, no workspace context
    auth.uid(),
    'compliance_terms',
    COALESCE(NEW.id, OLD.id),
    'compliance_term_' || lower(TG_OP),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 3. Re-create the trigger
CREATE TRIGGER trg_audit_compliance_term
  AFTER INSERT OR UPDATE OR DELETE ON compliance_terms
  FOR EACH ROW EXECUTE FUNCTION audit_compliance_term_change();

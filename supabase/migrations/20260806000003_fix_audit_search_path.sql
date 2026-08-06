-- Migration: Fix audit trigger search_path issue
-- The original trigger in 20260806000001 used unqualified table names
-- with SET search_path = '', causing "relation does not exist" errors.
-- This replaces the function using fully-qualified public.audit_logs.

-- Drop and recreate with public.audit_logs reference
DROP TRIGGER IF EXISTS trg_audit_compliance_term ON compliance_terms;
DROP FUNCTION IF EXISTS audit_compliance_term_change();

CREATE OR REPLACE FUNCTION audit_compliance_term_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (
    workspace_id, actor_user_id, entity_type, entity_id,
    action, before_data, after_data
  ) VALUES (
    null,
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

CREATE TRIGGER trg_audit_compliance_term
  AFTER INSERT OR UPDATE OR DELETE ON compliance_terms
  FOR EACH ROW EXECUTE FUNCTION audit_compliance_term_change();

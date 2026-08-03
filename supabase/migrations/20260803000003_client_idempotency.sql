-- Migration: Add idempotency_key column to clients for server-side deduplication.
-- Per api-contract v1.0 §1.4 and P2-CLIENT-001 security requirements.
-- Ensures concurrent duplicate POST requests produce exactly 1 client record + 1 audit entry.

begin;

-- Add idempotency_key column (nullable, unique within workspace when present)
alter table public.clients
  add column if not exists idempotency_key text;

-- Create partial unique index: only enforces uniqueness when key is not null.
-- This allows clients without idempotency keys (normal creation) to coexist.
create unique index if not exists idx_clients_workspace_idempotency
  on public.clients(workspace_id, idempotency_key)
  where idempotency_key is not null;

-- Add index for fast lookup by idempotency key
create index if not exists idx_clients_idempotency_lookup
  on public.clients(workspace_id, idempotency_key, deleted_at);

commit;

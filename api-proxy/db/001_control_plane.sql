create table if not exists meterflow_control_records (
  namespace text not null,
  id text not null,
  api_key text,
  owner_wallet text,
  route text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb not null,
  primary key (namespace, id)
);

create index if not exists meterflow_control_records_namespace_created_idx
  on meterflow_control_records (namespace, created_at desc);

create index if not exists meterflow_control_records_api_key_idx
  on meterflow_control_records (api_key)
  where api_key is not null;

create index if not exists meterflow_control_records_owner_wallet_idx
  on meterflow_control_records (owner_wallet)
  where owner_wallet is not null;

create index if not exists meterflow_control_records_status_idx
  on meterflow_control_records (status)
  where status is not null;

create index if not exists meterflow_control_records_route_idx
  on meterflow_control_records (route)
  where route is not null;

create table if not exists meterflow_idempotency (
  scope_key text primary key,
  receipt_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists meterflow_idempotency_expires_at_idx
  on meterflow_idempotency (expires_at);

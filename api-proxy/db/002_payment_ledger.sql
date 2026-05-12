-- Payment ledger foundation for hosted Meterflow providers.
-- The existing JSONB control-plane records remain the source of truth for this PR.
-- These tables are additive so quotes, attempts, settlements, webhook deliveries,
-- and provider balances can be normalized incrementally.

create table if not exists meterflow_payment_quotes (
  id text primary key,
  meter_id text not null,
  api_key text,
  payer_wallet text,
  pay_to text,
  asset text not null default 'USDC',
  network text not null,
  amount_usd numeric(20, 8) not null default 0,
  amount_atomic text,
  status text not null default 'created',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create index if not exists meterflow_payment_quotes_meter_idx
  on meterflow_payment_quotes (meter_id, created_at desc);

create table if not exists meterflow_payment_attempts (
  id text primary key,
  quote_id text references meterflow_payment_quotes(id) on delete set null,
  receipt_id text,
  meter_id text,
  payer_wallet text,
  status text not null,
  error text,
  created_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create index if not exists meterflow_payment_attempts_receipt_idx
  on meterflow_payment_attempts (receipt_id);

create table if not exists meterflow_settlements (
  id text primary key,
  quote_id text references meterflow_payment_quotes(id) on delete set null,
  receipt_id text,
  meter_id text,
  provider_wallet text,
  payer_wallet text,
  tx_signature text,
  asset text not null default 'USDC',
  network text not null,
  gross_usd numeric(20, 8) not null default 0,
  protocol_fee_usd numeric(20, 8) not null default 0,
  net_usd numeric(20, 8) not null default 0,
  status text not null default 'pending',
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create unique index if not exists meterflow_settlements_tx_signature_idx
  on meterflow_settlements (tx_signature)
  where tx_signature is not null;

create table if not exists meterflow_webhook_deliveries (
  id text primary key,
  webhook_id text not null,
  event text not null,
  receipt_id text,
  status text not null default 'pending',
  response_status integer,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create index if not exists meterflow_webhook_deliveries_webhook_idx
  on meterflow_webhook_deliveries (webhook_id, created_at desc);

create table if not exists meterflow_provider_balances (
  provider_wallet text primary key,
  asset text not null default 'USDC',
  pending_usd numeric(20, 8) not null default 0,
  settled_usd numeric(20, 8) not null default 0,
  withdrawn_usd numeric(20, 8) not null default 0,
  updated_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

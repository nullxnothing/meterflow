-- Track protocol-level payment details across x402, MPP, and future HTTP 402 rails.
-- Receipt rows remain stored in meterflow_control_records JSONB today; these
-- ledger columns prepare normalized quote/attempt/settlement tables for the
-- same metadata.

alter table if exists meterflow_payment_quotes
  add column if not exists protocol text not null default 'x402',
  add column if not exists intent text,
  add column if not exists payment_method text;

alter table if exists meterflow_payment_attempts
  add column if not exists protocol text not null default 'x402',
  add column if not exists intent text,
  add column if not exists payment_method text,
  add column if not exists payment_reference text;

alter table if exists meterflow_settlements
  add column if not exists protocol text not null default 'x402',
  add column if not exists intent text,
  add column if not exists payment_method text,
  add column if not exists payment_reference text;

create index if not exists meterflow_payment_attempts_protocol_idx
  on meterflow_payment_attempts (protocol, created_at desc);

create index if not exists meterflow_settlements_protocol_idx
  on meterflow_settlements (protocol, created_at desc);

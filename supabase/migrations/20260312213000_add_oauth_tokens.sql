create table if not exists public.oauth_tokens (
  id text primary key,
  access_token text not null default '',
  refresh_token text not null default '',
  expires_at bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.oauth_tokens enable row level security;

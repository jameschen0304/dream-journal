-- Dream Journal schema for Supabase
-- Run this in Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.dream_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  title text not null default '', -- 保留列兼容旧库；应用不再使用标题，始终写入空字符串
  content text not null,
  life_context text not null default '',
  mood_tags jsonb not null default '[]'::jsonb,
  ai_interpretation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dream_entries_user_date_idx
  on public.dream_entries (user_id, date desc, created_at desc);

alter table public.dream_entries enable row level security;

drop policy if exists "dream_entries_select_own" on public.dream_entries;
create policy "dream_entries_select_own"
on public.dream_entries
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "dream_entries_insert_own" on public.dream_entries;
create policy "dream_entries_insert_own"
on public.dream_entries
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "dream_entries_update_own" on public.dream_entries;
create policy "dream_entries_update_own"
on public.dream_entries
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "dream_entries_delete_own" on public.dream_entries;
create policy "dream_entries_delete_own"
on public.dream_entries
for delete
to authenticated
using (auth.uid() = user_id);

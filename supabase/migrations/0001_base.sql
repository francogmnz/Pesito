-- =====================================================================
-- Pesito · 0001 · Base
-- Buscador de promociones, calculadora de reintegros, comparador,
-- perfiles de usuario, favoritos, panel administrativo y automatización.
-- =====================================================================

-- ---------- Tipos ----------
create type public.promo_kind      as enum ('reintegro', 'descuento');
create type public.promo_audience  as enum ('todos');
create type public.promo_status    as enum ('borrador', 'en_revision', 'publicada', 'vencida', 'archivada');
create type public.discount_kind   as enum ('porcentaje', 'monto_fijo');
create type public.cap_period      as enum ('compra', 'dia', 'semana', 'mes', 'vigencia', 'sin_tope');
create type public.sales_channel   as enum ('online', 'local', 'ambos');
create type public.payment_kind    as enum ('banco', 'billetera', 'tarjeta');
create type public.source_kind     as enum ('oficial', 'autorizada', 'comunidad');
create type public.user_role       as enum ('usuario', 'admin');
create type public.submission_origin as enum ('automatizacion');
create type public.submission_status as enum ('pendiente', 'aprobada', 'rechazada');
create type public.submission_change as enum ('nueva', 'cambio', 'baja');

-- ---------- Catálogos ----------
create table public.categories (
  id    smallint generated always as identity primary key,
  slug  text not null unique,
  name  text not null,
  icon  text not null,
  sort  smallint not null default 0
);

create table public.merchants (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  category_id     smallint references public.categories (id),
  -- El logo solo se muestra si su uso está autorizado.
  logo_url        text,
  logo_authorized boolean not null default false,
  website         text,
  created_at      timestamptz not null default now()
);

create table public.payment_methods (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  kind            public.payment_kind not null,
  logo_url        text,
  logo_authorized boolean not null default false,
  color           text
);

-- ---------- Perfiles ----------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  role         public.user_role not null default 'usuario',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.user_payment_methods (
  user_id           uuid not null references public.profiles (id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods (id) on delete cascade,
  primary key (user_id, payment_method_id)
);

-- ---------- Fuentes y automatización ----------
create table public.sources (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  url          text not null check (url ~ '^https://'),
  kind         public.source_kind not null,
  active       boolean not null default true,
  -- Adaptador de ingesta (null = carga manual). La configuración no guarda secretos.
  adapter      text,
  config       jsonb not null default '{}'::jsonb,
  -- Solo las fuentes oficiales pueden publicar sin revisión, y solo si se habilita.
  auto_publish boolean not null default false,
  last_run_at  timestamptz,
  created_at   timestamptz not null default now(),
  check (not auto_publish or kind = 'oficial')
);

create table public.ingestion_runs (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid references public.sources (id) on delete set null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  found       int not null default 0,
  created     int not null default 0,
  updated     int not null default 0,
  verified    int not null default 0,
  flagged     int not null default 0,
  error       text
);

-- ---------- Promociones (entidad única para todos los tipos) ----------
create table public.promotions (
  id               uuid primary key default gen_random_uuid(),
  kind             public.promo_kind not null,
  audience         public.promo_audience not null default 'todos',
  merchant_id      uuid not null references public.merchants (id),
  title            text not null check (char_length(title) between 3 and 140),
  summary          text check (char_length(summary) <= 280),
  discount_kind    public.discount_kind not null,
  discount_value   numeric(12, 2) check (discount_value >= 0),
  cap_amount       numeric(12, 2) check (cap_amount > 0),
  cap_period       public.cap_period not null default 'sin_tope',
  min_purchase     numeric(12, 2) check (min_purchase >= 0),
  valid_from       date,
  valid_until      date,
  -- 0 = domingo … 6 = sábado. null = todos los días.
  days_of_week     smallint[] check (days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  channel          public.sales_channel not null default 'ambos',
  conditions       text check (char_length(conditions) <= 4000),
  requirements     text[] not null default '{}',
  source_id        uuid references public.sources (id) on delete set null,
  source_url       text check (source_url ~ '^https://'),
  -- Identificador de la promo en la fuente, para detectar cambios.
  external_id      text,
  status           public.promo_status not null default 'borrador',
  -- Huella normalizada para evitar duplicados.
  fingerprint      text not null,
  last_verified_at timestamptz,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  check (discount_kind <> 'porcentaje' or discount_value <= 100),
  check (status <> 'publicada' or source_url is not null)
);

create unique index promotions_fingerprint_active_uq
  on public.promotions (fingerprint)
  where status in ('borrador', 'en_revision', 'publicada');
create unique index promotions_source_external_uq
  on public.promotions (source_id, external_id)
  where external_id is not null;
create index promotions_status_kind_idx on public.promotions (status, kind);
create index promotions_valid_until_idx on public.promotions (valid_until) where status = 'publicada';
create index promotions_merchant_idx on public.promotions (merchant_id);

create table public.promotion_payment_methods (
  promotion_id      uuid not null references public.promotions (id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods (id) on delete cascade,
  primary key (promotion_id, payment_method_id)
);

-- Favoritos (guardados)
create table public.user_promotion_states (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  saved_at     timestamptz,
  primary key (user_id, promotion_id)
);

-- Cola de revisión: candidatos detectados por la automatización.
-- payload guarda el candidato normalizado (mismos campos que una promoción).
create table public.promo_submissions (
  id                     uuid primary key default gen_random_uuid(),
  origin                 public.submission_origin not null,
  status                 public.submission_status not null default 'pendiente',
  change_type            public.submission_change not null default 'nueva',
  source_id              uuid references public.sources (id) on delete set null,
  payload                jsonb not null,
  diff                   jsonb,
  flag_reasons           text[] not null default '{}',
  fingerprint            text,
  matched_promotion_id   uuid references public.promotions (id) on delete set null,
  published_promotion_id uuid references public.promotions (id) on delete set null,
  reviewed_by            uuid references public.profiles (id) on delete set null,
  reviewed_at            timestamptz,
  created_at             timestamptz not null default now()
);
create index promo_submissions_status_idx on public.promo_submissions (status, created_at desc);

-- ---------- Funciones auxiliares ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger promotions_touch before update on public.promotions
  for each row execute function public.touch_updated_at();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Crea el perfil al registrarse.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(split_part(coalesce(new.email, ''), '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Marca como vencidas las promos cuya vigencia terminó (fecha de Argentina).
create or replace function public.expire_promotions() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.promotions
     set status = 'vencida'
   where status = 'publicada'
     and valid_until < (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- Seguridad (RLS) ----------
alter table public.categories                enable row level security;
alter table public.merchants                 enable row level security;
alter table public.payment_methods           enable row level security;
alter table public.profiles                  enable row level security;
alter table public.user_payment_methods      enable row level security;
alter table public.sources                   enable row level security;
alter table public.ingestion_runs            enable row level security;
alter table public.promotions                enable row level security;
alter table public.promotion_payment_methods enable row level security;
alter table public.user_promotion_states     enable row level security;
alter table public.promo_submissions         enable row level security;

-- Catálogos: lectura pública, escritura admin.
create policy categories_read on public.categories for select using (true);
create policy categories_admin on public.categories for all using (public.is_admin()) with check (public.is_admin());
create policy merchants_read on public.merchants for select using (true);
create policy merchants_admin on public.merchants for all using (public.is_admin()) with check (public.is_admin());
create policy payment_methods_read on public.payment_methods for select using (true);
create policy payment_methods_admin on public.payment_methods for all using (public.is_admin()) with check (public.is_admin());

-- Perfiles: cada uno ve y edita el suyo (el rol no se puede cambiar desde el cliente).
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy upm_self on public.user_payment_methods for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Promociones: el público solo ve las publicadas; el admin ve y edita todo.
create policy promotions_public_read on public.promotions for select
  using (status = 'publicada' or public.is_admin());
create policy promotions_admin on public.promotions for all
  using (public.is_admin()) with check (public.is_admin());
create policy ppm_public_read on public.promotion_payment_methods for select
  using (exists (select 1 from public.promotions p where p.id = promotion_id and (p.status = 'publicada' or public.is_admin())));
create policy ppm_admin on public.promotion_payment_methods for all
  using (public.is_admin()) with check (public.is_admin());

create policy ups_self on public.user_promotion_states for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Fuentes, corridas y cola de revisión: solo admin (la automatización usa service role).
create policy sources_admin on public.sources for all using (public.is_admin()) with check (public.is_admin());
create policy runs_admin on public.ingestion_runs for all using (public.is_admin()) with check (public.is_admin());
create policy submissions_admin on public.promo_submissions for all using (public.is_admin()) with check (public.is_admin());

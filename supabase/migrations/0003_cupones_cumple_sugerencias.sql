-- =====================================================================
-- Pesito · 0003 · Cupones para vos, Tu cumple con Pesito y Sugerí una promo
-- Extiende las estructuras existentes en lugar de duplicarlas:
--   · cupones y cumpleaños  → promotions + tabla de detalle 1:1
--   · guardados y utilizados → user_promotion_states
--   · sugerencias            → promo_submissions (misma cola que la automatización)
-- =====================================================================

-- ---------- Requisitos válidos (compartidos por todos los tipos) ----------
alter table public.promotions
  add constraint promotions_requirements_valid check (
    requirements <@ array[
      'registro_previo', 'presentar_dni', 'programa_fidelizacion',
      'primera_compra', 'solo_app', 'cuenta_nueva'
    ]::text[]
  );

-- ---------- Cumpleaños en el perfil (sin año de nacimiento) ----------
alter table public.profiles
  add column birthday_day   smallint check (birthday_day between 1 and 31),
  add column birthday_month smallint check (birthday_month between 1 and 12),
  add constraint profiles_birthday_pair check ((birthday_day is null) = (birthday_month is null)),
  add constraint profiles_birthday_valid check (
    birthday_day is null
    or birthday_day <= case birthday_month when 2 then 29 when 4 then 30 when 6 then 30
                                           when 9 then 30 when 11 then 30 else 31 end
  );
grant update (birthday_day, birthday_month) on public.profiles to authenticated;

-- ---------- Detalle de cupones ----------
create table public.coupon_details (
  promotion_id             uuid primary key references public.promotions (id) on delete cascade,
  -- codigo: hay que ingresar un código · link: se activa desde un enlace · automatico: se aplica solo
  redemption               text not null check (redemption in ('codigo', 'link', 'automatico')),
  code                     text check (char_length(code) between 2 and 40 and code ~ '^[A-Za-z0-9_\-]+$'),
  new_customers_only       boolean not null default true,
  requires_external_signup boolean not null default false,
  external_platform        text check (char_length(external_platform) <= 60),
  check (redemption <> 'codigo' or code is not null),
  check (not requires_external_signup or external_platform is not null)
);

-- ---------- Detalle de beneficios de cumpleaños ----------
create table public.birthday_details (
  promotion_id    uuid primary key references public.promotions (id) on delete cascade,
  -- dia: solo el día · semana: la semana del cumple · mes: todo el mes · rango: días antes/después
  window_kind     text not null check (window_kind in ('dia', 'semana', 'mes', 'rango')),
  days_before     smallint not null default 0 check (days_before between 0 and 31),
  days_after      smallint not null default 0 check (days_after between 0 and 31),
  benefit         text not null check (benefit in ('descuento', 'regalo', 'cupon', 'experiencia')),
  loyalty_program text check (char_length(loyalty_program) <= 80)
);

-- Lectura pública si la promo está publicada; escritura admin.
alter table public.coupon_details   enable row level security;
alter table public.birthday_details enable row level security;
create policy coupon_details_read on public.coupon_details for select
  using (exists (select 1 from public.promotions p where p.id = promotion_id and (p.status = 'publicada' or public.is_admin())));
create policy coupon_details_admin on public.coupon_details for all using (public.is_admin()) with check (public.is_admin());
create policy birthday_details_read on public.birthday_details for select
  using (exists (select 1 from public.promotions p where p.id = promotion_id and (p.status = 'publicada' or public.is_admin())));
create policy birthday_details_admin on public.birthday_details for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Guardados y utilizados (misma tabla que favoritos) ----------
alter table public.user_promotion_states
  add column used_at timestamptz,
  add constraint ups_not_empty check (saved_at is not null or used_at is not null);

-- ---------- Reportes de cupones ----------
create table public.promotion_reports (
  id           uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  reason       text not null check (reason in ('vencido', 'codigo_invalido', 'datos_incorrectos', 'otro')),
  comment      text check (char_length(comment) <= 500),
  status       text not null default 'abierto' check (status in ('abierto', 'resuelto', 'descartado')),
  resolved_by  uuid references public.profiles (id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
-- Un reporte abierto por persona y promo.
create unique index promotion_reports_open_uq on public.promotion_reports (promotion_id, user_id) where status = 'abierto';
create index promotion_reports_status_idx on public.promotion_reports (status, created_at desc);

alter table public.promotion_reports enable row level security;
create policy reports_insert_own on public.promotion_reports for insert
  with check (user_id = auth.uid() and status = 'abierto');
create policy reports_read_own on public.promotion_reports for select
  using (user_id = auth.uid() or public.is_admin());
create policy reports_admin on public.promotion_reports for update
  using (public.is_admin()) with check (public.is_admin());

-- Límite: 10 reportes por persona cada 24 h.
-- Con 3 o más reportes abiertos de personas distintas, la promo vuelve a revisión.
create or replace function public.on_report_inserted() returns trigger
language plpgsql security definer set search_path = public as $$
declare recent int; open_reports int;
begin
  select count(*) into recent from public.promotion_reports
   where user_id = new.user_id and created_at > now() - interval '24 hours';
  if recent > 10 then
    raise exception 'Llegaste al límite de reportes por hoy' using errcode = 'P0001';
  end if;

  select count(distinct user_id) into open_reports from public.promotion_reports
   where promotion_id = new.promotion_id and status = 'abierto';
  if open_reports >= 3 then
    update public.promotions set status = 'en_revision'
     where id = new.promotion_id and status = 'publicada';
  end if;
  return new;
end $$;
create trigger promotion_reports_after_insert after insert on public.promotion_reports
  for each row execute function public.on_report_inserted();

-- ---------- Sugerencias de usuarios (cola de revisión compartida) ----------
alter table public.promo_submissions
  add column submitted_by  uuid references public.profiles (id) on delete set null,
  add column image_path    text check (char_length(image_path) <= 300),
  add column ai_extraction jsonb,
  add column comments      text check (char_length(comments) <= 1000),
  add column ip_hash       text,
  add column review_note   text check (char_length(review_note) <= 1000),
  add column duplicate_of  uuid references public.promotions (id) on delete set null,
  add constraint submissions_user_has_author check (origin <> 'usuario' or submitted_by is not null);

-- Una misma persona no puede enviar dos veces la misma promo mientras está en revisión.
create unique index promo_submissions_user_dup_uq on public.promo_submissions (submitted_by, fingerprint)
  where submitted_by is not null and status in ('pendiente', 'en_revision');
create index promo_submissions_author_idx on public.promo_submissions (submitted_by, created_at desc);

-- Las personas pueden enviar y ver sus propias sugerencias (nunca publicarlas).
create policy submissions_insert_own on public.promo_submissions for insert
  with check (
    origin = 'usuario' and status = 'pendiente' and submitted_by = auth.uid()
    and published_promotion_id is null and reviewed_by is null
  );
create policy submissions_read_own on public.promo_submissions for select
  using (submitted_by = auth.uid() or public.is_admin());

-- Límite: 5 sugerencias por persona cada 24 h y 20 por IP.
create or replace function public.enforce_submission_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare by_user int; by_ip int;
begin
  if new.origin = 'usuario' then
    select count(*) into by_user from public.promo_submissions
     where submitted_by = new.submitted_by and created_at > now() - interval '24 hours';
    if by_user >= 5 then
      raise exception 'Llegaste al límite de sugerencias por hoy' using errcode = 'P0001';
    end if;
    if new.ip_hash is not null then
      select count(*) into by_ip from public.promo_submissions
       where ip_hash = new.ip_hash and created_at > now() - interval '24 hours';
      if by_ip >= 20 then
        raise exception 'Demasiadas sugerencias desde esta conexión' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger promo_submissions_limits before insert on public.promo_submissions
  for each row execute function public.enforce_submission_limits();

-- ---------- Historial de moderación ----------
create table public.moderation_events (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('submission', 'promotion', 'report')),
  entity_id   uuid not null,
  action      text not null,
  from_status text,
  to_status   text,
  actor_id    uuid references public.profiles (id) on delete set null,
  note        text check (char_length(note) <= 1000),
  created_at  timestamptz not null default now()
);
create index moderation_events_entity_idx on public.moderation_events (entity_type, entity_id, created_at desc);
alter table public.moderation_events enable row level security;
create policy moderation_events_admin on public.moderation_events for all
  using (public.is_admin()) with check (public.is_admin());

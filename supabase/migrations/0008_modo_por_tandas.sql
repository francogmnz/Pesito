-- =====================================================================
-- Pesito · 0008 · Fuentes que se leen por tandas (MODO)
-- MODO publica una página por promo (miles). Se lee una tanda por corrida
-- y acá se guarda qué pasó con cada página, para no releer lo vencido.
-- No se usa la API de MODO: su robots.txt la prohíbe. Todo va a revisión.
-- =====================================================================

create table public.source_records (
  source_id       uuid not null references public.sources (id) on delete cascade,
  -- Identificador de la página dentro de la fuente (en MODO, el slug de la promo).
  key             text not null check (char_length(key) <= 200),
  external_id     text,
  state           text not null default 'nueva'
                  check (state in ('nueva', 'vigente', 'vencida', 'omitida', 'sin_datos', 'error')),
  valid_until     date,
  -- Más alto = se lee antes.
  priority        smallint not null default 0,
  -- null = no volver a leerla.
  next_check_at   timestamptz default now(),
  last_checked_at timestamptz,
  error           text check (char_length(error) <= 300),
  first_seen_at   timestamptz not null default now(),
  primary key (source_id, key)
);
create index source_records_due_idx
  on public.source_records (source_id, priority desc, next_check_at)
  where next_check_at is not null;
create index source_records_state_idx on public.source_records (source_id, state);

alter table public.source_records enable row level security;
create policy source_records_admin on public.source_records for all
  using (public.is_admin()) with check (public.is_admin());

-- Bancos que operan con MODO y todavía no estaban en el catálogo.
insert into public.payment_methods (slug, name, kind, color) values
  ('banco-santa-fe',         'Banco Santa Fe',               'banco', null),
  ('banco-entre-rios',       'Banco Entre Ríos',             'banco', null),
  ('banco-san-juan',         'Banco San Juan',               'banco', null),
  ('banco-santa-cruz',       'Banco Santa Cruz',             'banco', null),
  ('banco-corrientes',       'Banco de Corrientes',          'banco', null),
  ('bancor',                 'Bancor',                       'banco', null),
  ('bpn',                    'Banco Provincia del Neuquén',  'banco', null),
  ('banco-chubut',           'Banco del Chubut',             'banco', null),
  ('banco-la-pampa',         'Banco de La Pampa',            'banco', null),
  ('nbch',                   'Nuevo Banco del Chaco',        'banco', null),
  ('banco-tierra-del-fuego', 'Banco de Tierra del Fuego',    'banco', null),
  ('banco-columbia',         'Banco Columbia',               'banco', null),
  ('banco-del-sol',          'Banco del Sol',                'banco', null)
on conflict (slug) do nothing;

-- MODO: páginas públicas de cada promo. Oficial, pero sin publicación automática.
insert into public.sources (name, url, kind, active, adapter, auto_publish, config)
select 'MODO · Promociones', 'https://www.modo.com.ar/promos', 'oficial'::public.source_kind, true, 'modo', false,
       '{"batchSize": 250, "delayMs": 300, "recheckDays": 7}'::jsonb
where not exists (select 1 from public.sources s where s.adapter = 'modo');

-- Pesito · Cuánta gente manda Pesito a cada comercio.
-- Es la base para negociar con las tiendas (afiliados, espacios patrocinados): un contador por día,
-- comercio y tipo de enlace. No guarda quién hizo clic ni desde dónde.

create table public.outbound_clicks (
  day         date not null default current_date,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  -- 'producto' = desde Comparar precios; 'promo' = el enlace a la fuente de una promo.
  kind        text not null check (kind in ('producto', 'promo')),
  clicks      integer not null default 0 check (clicks >= 0),
  primary key (day, merchant_id, kind)
);

alter table public.outbound_clicks enable row level security;
create policy outbound_clicks_admin on public.outbound_clicks for all using (public.is_admin()) with check (public.is_admin());

-- Parámetros que se agregan al enlace de un comercio cuando hay un acuerdo de afiliado ("aff=123").
alter table public.merchants add column if not exists affiliate_query text
  check (affiliate_query is null or (char_length(affiliate_query) <= 200 and affiliate_query ~ '^[A-Za-z0-9_.~%=&-]+$'));

-- Suma un clic. La puede llamar cualquiera (también sin sesión): solo incrementa un contador de un comercio que existe.
create or replace function public.count_outbound_click(p_merchant uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('producto', 'promo') then return; end if;
  insert into public.outbound_clicks (day, merchant_id, kind, clicks)
  select current_date, m.id, p_kind, 1 from public.merchants m where m.id = p_merchant
  on conflict (day, merchant_id, kind) do update set clicks = public.outbound_clicks.clicks + 1;
end $$;

grant execute on function public.count_outbound_click(uuid, text) to anon, authenticated;

-- Resumen para el panel: clics de los últimos 30 días por comercio.
create view public.outbound_click_summary with (security_invoker = true) as
select m.slug, m.name,
       coalesce(sum(c.clicks) filter (where c.kind = 'producto'), 0)::int as product_clicks,
       coalesce(sum(c.clicks) filter (where c.kind = 'promo'), 0)::int as promo_clicks,
       coalesce(sum(c.clicks) filter (where c.day >= current_date - 6), 0)::int as last_7_days
from public.outbound_clicks c
join public.merchants m on m.id = c.merchant_id
where c.day >= current_date - 29
group by m.id;

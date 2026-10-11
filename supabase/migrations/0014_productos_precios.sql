-- Pesito · «¿Dónde conviene?»: productos y precios por comercio.
-- Un producto se identifica por su código de barras (EAN/GTIN). Cada comercio que lo vende tiene su publicación
-- con el precio vigente en la misma fila; el historial guarda una fila solo cuando el precio o el stock cambian.
-- De las imágenes se guarda el enlace, nunca el archivo.

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  ean         text not null unique check (ean ~ '^[0-9]{8,14}$'),
  brand       text check (char_length(brand) <= 80),
  name        text not null check (char_length(name) between 1 and 200),
  -- Rubro tal como lo nombra el comercio donde se vio primero.
  category    text check (char_length(category) <= 200),
  image_url   text check (image_url ~ '^https://' and char_length(image_url) <= 500),
  -- Marca + nombre en minúsculas y sin tildes, para buscar.
  search      text not null default '',
  created_at  timestamptz not null default now()
);

create table public.merchant_products (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products (id) on delete cascade,
  merchant_id      uuid not null references public.merchants (id) on delete cascade,
  source_id        uuid references public.sources (id) on delete set null,
  -- Identificador de la página dentro del comercio.
  external_key     text not null check (char_length(external_key) <= 200),
  url              text not null check (url ~ '^https://' and char_length(url) <= 500),
  title            text not null check (char_length(title) <= 200),
  price            numeric(12, 2) not null check (price > 0),
  -- Precio de lista, solo si el comercio lo informa y es mayor al precio.
  list_price       numeric(12, 2) check (list_price is null or list_price > price),
  in_stock         boolean not null,
  price_changed_at timestamptz not null default now(),
  -- Última lectura correcta de la página: con esto se avisa cuando un precio puede estar viejo.
  last_ok_at       timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (merchant_id, external_key)
);
create index merchant_products_product_idx on public.merchant_products (product_id);

create table public.price_history (
  id                  bigint generated always as identity primary key,
  merchant_product_id uuid not null references public.merchant_products (id) on delete cascade,
  price               numeric(12, 2) not null,
  list_price          numeric(12, 2),
  in_stock            boolean not null,
  at                  timestamptz not null default now()
);
create index price_history_listing_idx on public.price_history (merchant_product_id, at desc);

alter table public.products enable row level security;
alter table public.merchant_products enable row level security;
alter table public.price_history enable row level security;
create policy products_read on public.products for select using (true);
create policy products_admin on public.products for all using (public.is_admin()) with check (public.is_admin());
create policy merchant_products_read on public.merchant_products for select using (true);
create policy merchant_products_admin on public.merchant_products for all using (public.is_admin()) with check (public.is_admin());
create policy price_history_read on public.price_history for select using (true);
create policy price_history_admin on public.price_history for all using (public.is_admin()) with check (public.is_admin());

-- Resumen por producto para el buscador: en cuántos comercios está (con stock) y entre qué precios.
create view public.product_summaries with (security_invoker = true) as
select p.id, p.ean, p.brand, p.name, p.category, p.image_url, p.search,
       count(mp.id) filter (where mp.in_stock)::int as stores,
       min(mp.price) filter (where mp.in_stock) as min_price,
       max(mp.price) filter (where mp.in_stock) as max_price
from public.products p
join public.merchant_products mp on mp.product_id = p.id
group by p.id;

-- Guarda lo leído en la página de un comercio. Devuelve 'nuevo', 'cambio' o 'igual'.
create or replace function public.upsert_listing(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_product  uuid;
  v_price    numeric(12, 2) := (p ->> 'price')::numeric;
  v_list     numeric(12, 2) := nullif(p ->> 'listPrice', '')::numeric;
  v_stock    boolean := coalesce((p ->> 'inStock')::boolean, false);
  l          record;
begin
  if not public.can_publish() then
    raise exception 'No tenés permiso para cargar precios' using errcode = '42501';
  end if;
  if v_list is not null and v_list <= v_price then v_list := null; end if;

  select id into v_merchant from public.merchants where slug = p ->> 'merchantSlug';
  if v_merchant is null then
    insert into public.merchants (slug, name, category_id)
    values (p ->> 'merchantSlug', p ->> 'merchantName', (select id from public.categories where slug = 'farmacias'))
    returning id into v_merchant;
  end if;

  insert into public.products (ean, brand, name, category, image_url, search)
  values (p ->> 'ean', nullif(p ->> 'brand', ''), p ->> 'title', nullif(p ->> 'category', ''), nullif(p ->> 'imageUrl', ''), coalesce(p ->> 'search', ''))
  on conflict (ean) do update set
    brand = coalesce(public.products.brand, excluded.brand),
    category = coalesce(public.products.category, excluded.category),
    image_url = coalesce(public.products.image_url, excluded.image_url)
  returning id into v_product;

  select id, price, list_price, in_stock, product_id into l
  from public.merchant_products where merchant_id = v_merchant and external_key = p ->> 'externalKey';

  if not found then
    insert into public.merchant_products (product_id, merchant_id, source_id, external_key, url, title, price, list_price, in_stock)
    values (v_product, v_merchant, nullif(p ->> 'sourceId', '')::uuid, p ->> 'externalKey', p ->> 'url', p ->> 'title', v_price, v_list, v_stock)
    returning id into l;
    insert into public.price_history (merchant_product_id, price, list_price, in_stock) values (l.id, v_price, v_list, v_stock);
    return 'nuevo';
  end if;

  if l.price is distinct from v_price or l.list_price is distinct from v_list or l.in_stock is distinct from v_stock then
    update public.merchant_products set
      product_id = v_product, url = p ->> 'url', title = p ->> 'title', price = v_price, list_price = v_list, in_stock = v_stock,
      price_changed_at = case when l.price is distinct from v_price then now() else price_changed_at end,
      last_ok_at = now()
    where id = l.id;
    insert into public.price_history (merchant_product_id, price, list_price, in_stock) values (l.id, v_price, v_list, v_stock);
    return 'cambio';
  end if;

  update public.merchant_products set last_ok_at = now(), product_id = v_product, url = p ->> 'url', title = p ->> 'title' where id = l.id;
  return 'igual';
end $$;

revoke execute on function public.upsert_listing(jsonb) from public, anon;
grant execute on function public.upsert_listing(jsonb) to authenticated;

-- Fuentes de precios: páginas públicas de producto de cada tienda, por tandas.
-- No participan de la actualización de promos (otro adaptador) ni publican promociones.
insert into public.sources (name, url, kind, active, adapter, auto_publish, config)
select v.name, v.url, 'oficial'::public.source_kind, true, 'vtex-precios', false, v.config::jsonb
from (values
  ('Farmaonline · Precios', 'https://www.farmaonline.com/', '{"merchantSlug": "farmaonline", "merchantName": "Farmaonline", "batchSize": 200, "delayMs": 300, "concurrency": 3, "recheckHours": 72}'),
  ('Farmacity · Precios',   'https://www.farmacity.com/',   '{"merchantSlug": "farmacity", "merchantName": "Farmacity", "batchSize": 200, "delayMs": 300, "concurrency": 3, "recheckHours": 72}')
) as v(name, url, config)
where not exists (select 1 from public.sources s where s.adapter = 'vtex-precios' and s.url = v.url);

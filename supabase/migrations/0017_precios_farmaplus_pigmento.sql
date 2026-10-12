-- Pesito · Más tiendas en «Comparar precios»: Farmaplus y Pigmento (tiendas VTEX, mismo lector).
-- Farmaplus: solo los rubros de perfumería y cuidado personal. Pigmento: todo su catálogo.

insert into public.sources (name, url, kind, active, adapter, auto_publish, config)
select v.name, v.url, 'oficial'::public.source_kind, true, 'vtex-precios', false, v.config::jsonb
from (values
  ('Farmaplus · Precios', 'https://www.farmaplus.com.ar/',           '{"merchantSlug": "farmaplus", "merchantName": "Farmaplus", "batchSize": 200, "delayMs": 300, "concurrency": 3, "recheckHours": 72}'),
  ('Pigmento · Precios',  'https://www.perfumeriaspigmento.com.ar/', '{"merchantSlug": "pigmento", "merchantName": "Pigmento", "batchSize": 200, "delayMs": 300, "concurrency": 3, "recheckHours": 72, "scope": "."}')
) as v(name, url, config)
where not exists (select 1 from public.sources s where s.adapter = 'vtex-precios' and s.url = v.url);

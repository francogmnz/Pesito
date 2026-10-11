-- Pesito · Get The Look como fuente de precios (tienda VTEX, perfumería y maquillaje).
-- Todo su catálogo entra en el alcance de «¿Dónde conviene?» ("scope": ".").

insert into public.sources (name, url, kind, active, adapter, auto_publish, config)
select 'Get The Look · Precios', 'https://www.getthelook.com.ar/', 'oficial'::public.source_kind, true, 'vtex-precios', false,
       '{"merchantSlug": "get-the-look", "merchantName": "Get The Look", "batchSize": 200, "delayMs": 300, "concurrency": 3, "recheckHours": 72, "scope": "."}'::jsonb
where not exists (select 1 from public.sources s where s.adapter = 'vtex-precios' and s.url = 'https://www.getthelook.com.ar/');

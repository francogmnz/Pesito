-- Pesito · Prex como fuente: listado público + página de cada promo.
-- Oficial, sin publicación automática: todo lo que lee va a revisión.

insert into public.sources (name, url, kind, active, adapter, auto_publish, config)
select 'Prex · Promociones', 'https://www.prexcard.com.ar/promociones', 'oficial'::public.source_kind, true, 'prex', false,
       '{"delayMs": 500}'::jsonb
where not exists (select 1 from public.sources s where s.adapter = 'prex');

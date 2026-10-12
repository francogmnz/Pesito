-- Pesito · Belo como fuente de promos: su listado de beneficios y la página de cada uno.
-- Oficial y con publicación automática (lo dudoso sigue yendo a revisión). Se lee cada 12 horas.

insert into public.sources (name, url, kind, active, adapter, auto_publish, config)
select 'Belo · Beneficios', 'https://www.belo.app/ar/beneficios', 'oficial'::public.source_kind, true, 'belo', true,
       '{"delayMs": 800, "everyHours": 12}'::jsonb
where not exists (select 1 from public.sources s where s.adapter = 'belo');

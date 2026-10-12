-- Pesito · Promos bancarias de Get The Look: la tabla de su página de medios de pago.
-- Oficial y con publicación automática (lo dudoso sigue yendo a revisión). Se lee cada 12 horas.

insert into public.sources (name, url, kind, active, adapter, auto_publish, config)
select 'Get The Look · Promos bancarias', 'https://www.getthelook.com.ar/getthelook/medios-de-pago', 'oficial'::public.source_kind, true, 'getthelook', true,
       '{"everyHours": 12}'::jsonb
where not exists (select 1 from public.sources s where s.adapter = 'getthelook');

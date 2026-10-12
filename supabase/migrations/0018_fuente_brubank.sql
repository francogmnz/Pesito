-- Pesito · Brubank como fuente de promos: su página de beneficios y el artículo de ayuda de cada promo.
-- Oficial y con publicación automática (lo dudoso sigue yendo a revisión).

insert into public.sources (name, url, kind, active, adapter, auto_publish, config)
select 'Brubank · Beneficios', 'https://www.brubank.com/beneficios', 'oficial'::public.source_kind, true, 'brubank', true,
       '{"delayMs": 1100, "everyHours": 12}'::jsonb
where not exists (select 1 from public.sources s where s.adapter = 'brubank');

-- Con el programador cada media hora, las páginas que cambian poco se leen cada 6 horas (MODO sigue en cada corrida).
update public.sources set config = config || '{"everyHours": 6}'::jsonb
where adapter in ('prex', 'uala', 'mercadopago', 'farmaonline') and not (config ? 'everyHours');

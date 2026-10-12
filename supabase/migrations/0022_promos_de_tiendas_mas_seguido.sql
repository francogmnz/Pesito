-- Pesito · Las promos de las tiendas (Farmaonline, Get The Look) se leen cada 2 horas en vez de cada 6 o 12,
-- para alcanzar las promos relámpago que duran un día o menos. Es una sola página por tienda.

update public.sources set config = config || '{"everyHours": 2}'::jsonb
where adapter in ('farmaonline', 'getthelook');

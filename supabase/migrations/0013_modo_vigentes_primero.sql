-- Pesito · MODO: mantener al día las promos vigentes va antes que leer páginas nuevas.
-- (Las páginas sin leer tienen prioridad hasta 1000.)

update public.source_records set priority = 1100 where state = 'vigente';

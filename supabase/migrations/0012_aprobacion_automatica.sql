-- Pesito · Aprobación automática.
-- Las fuentes oficiales publican solas lo que el lector pudo leer sin dudas; lo dudoso sigue yendo a revisión.

-- Marca de "corregida a mano desde el panel": la automatización no pisa esos cambios, los manda a revisión.
alter table public.promotions add column if not exists manual_edit_at timestamptz;

update public.sources set auto_publish = true
where kind = 'oficial' and adapter in ('modo', 'prex', 'uala', 'mercadopago', 'farmaonline');

-- MODO: releer en las próximas corridas las promos vigentes ya cargadas, para que tomen
-- los títulos nuevos ("30% de reintegro en … con Macro · Selecta") sin esperar la semana.
update public.source_records r set next_check_at = now()
from public.sources s
where s.id = r.source_id and s.adapter = 'modo' and r.state = 'vigente';

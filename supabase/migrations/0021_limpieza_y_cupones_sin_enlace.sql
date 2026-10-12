-- Pesito · Limpieza automática, cupones sin enlace y relectura de productos con varias presentaciones.

-- 1. Un cupón visto en redes puede no tener página propia: se puede publicar sin enlace.
--    El resto de las promos lo sigue necesitando.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.promotions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%source_url is not null%'
  loop
    execute format('alter table public.promotions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.promotions add constraint promotions_publicada_con_fuente
  check (status <> 'publicada' or source_url is not null or kind::text = 'cupon');

-- 2. Limpieza: la corre la actualización de promos al terminar.
--    · Historial de precios: detalle de 90 días; de lo anterior queda el primer registro de cada semana.
--    · Corridas de actualización: 30 días.
create or replace function public.cleanup_old_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_publish() then
    raise exception 'No tenés permiso para limpiar datos' using errcode = '42501';
  end if;

  delete from public.price_history h
  using (
    select id, row_number() over (partition by merchant_product_id, date_trunc('week', at) order by at, id) as rn
    from public.price_history
    where at < now() - interval '90 days'
  ) d
  where h.id = d.id and d.rn > 1;

  delete from public.ingestion_runs where started_at < now() - interval '30 days';
end $$;

revoke execute on function public.cleanup_old_data() from public, anon;
grant execute on function public.cleanup_old_data() to authenticated;

-- 3. Las páginas con varias presentaciones (tonos, tamaños) se salteaban: ahora se cargan.
--    Se marcan para releer las que quedaron afuera siendo del rubro.
update public.source_records r set next_check_at = now()
from public.sources s
where s.id = r.source_id and s.adapter = 'vtex-precios' and r.state = 'omitida' and r.next_check_at is not null;

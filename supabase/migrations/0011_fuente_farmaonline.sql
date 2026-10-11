-- Pesito · Farmaonline como fuente: su página pública de promociones bancarias.
-- Oficial, sin publicación automática: todo lo que lee va a revisión.

-- Medios de pago que aparecen en sus promos y faltaban en el catálogo.
insert into public.payment_methods (slug, name, kind, color) values
  ('yoy',   'YOY',   'billetera', null),
  ('cabal', 'Cabal', 'tarjeta',   null)
on conflict (slug) do nothing;

insert into public.sources (name, url, kind, active, adapter, auto_publish)
select 'Farmaonline · Promociones bancarias', 'https://www.farmaonline.com/promociones-bancarias', 'oficial'::public.source_kind, true, 'farmaonline', false
where not exists (select 1 from public.sources s where s.adapter = 'farmaonline');

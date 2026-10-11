-- =====================================================================
-- Pesito · 0006 · Fuentes automáticas, más bancos y categorías
-- Las fuentes leen páginas públicas de promociones. Son oficiales (las publica
-- quien da la promo) pero NO publican solas: todo va a la cola de revisión.
-- =====================================================================

insert into public.categories (slug, name, icon, sort) values
  ('transporte', 'Transporte', 'bike', 11),
  ('educacion',  'Educación',  'ticket', 12)
on conflict (slug) do nothing;

insert into public.payment_methods (slug, name, kind, color) values
  ('patagonia',    'Banco Patagonia', 'banco',     '#00468C'),
  ('credicoop',    'Credicoop',       'banco',     '#E30613'),
  ('icbc',         'ICBC',            'banco',     '#C4161C'),
  ('supervielle',  'Supervielle',     'banco',     '#E4002B'),
  ('ciudad',       'Banco Ciudad',    'banco',     '#0072BC'),
  ('hipotecario',  'Banco Hipotecario','banco',    '#E35205'),
  ('comafi',       'Comafi',          'banco',     '#00843D'),
  ('brubank',      'Brubank',         'banco',     '#6236FF'),
  ('openbank',     'Openbank',        'banco',     '#EC0000'),
  ('cordobesa',    'Cordobesa',       'tarjeta',   '#0F4C81'),
  ('credimas',     'Credimas',        'tarjeta',   '#00529B'),
  ('favacard',     'Favacard',        'tarjeta',   '#E2001A'),
  ('credi-guia',   'Credi Guía',      'tarjeta',   '#F7931E'),
  ('reba',         'Reba',            'banco',     '#1E1E1E'),
  ('mastercard',   'Mastercard',      'tarjeta',   '#EB001B'),
  ('visa',         'Visa',            'tarjeta',   '#1A1F71'),
  ('amex',         'American Express','tarjeta',   '#2E77BC'),
  ('prex',         'Prex',            'billetera', '#00C389'),
  ('lemon',        'Lemon',           'billetera', '#00F068'),
  ('belo',         'Belo',            'billetera', '#4C3BFF')
on conflict (slug) do nothing;

insert into public.sources (name, url, kind, active, adapter, auto_publish)
select v.name, v.url, 'oficial'::public.source_kind, true, v.adapter, false
from (values
  ('Ualá · Promociones',           'https://www.uala.com.ar/promociones',                         'uala'),
  ('PedidosYa · Promos bancarias', 'https://www.pedidosya.com.ar/promotions-section/promotions', 'pedidosya'),
  ('Mercado Pago · Promociones',   'https://promociones.mercadopago.com.ar/',                     'mercadopago')
) as v(name, url, adapter)
where not exists (select 1 from public.sources s where s.adapter = v.adapter);

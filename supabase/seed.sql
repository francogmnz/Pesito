-- =====================================================================
-- Pesito · Datos iniciales de catálogo
-- Solo catálogos (categorías y medios de pago). No incluye promociones:
-- las promos reales entran por fuentes oficiales o por revisión del admin.
-- Los logos quedan desactivados hasta tener autorización de uso.
-- =====================================================================

insert into public.categories (slug, name, icon, sort) values
  ('supermercados', 'Supermercados', 'cart', 1),
  ('farmacias',     'Farmacias',     'pill', 2),
  ('gastronomia',   'Gastronomía',   'fork', 3),
  ('delivery',      'Delivery',      'bike', 4),
  ('combustible',   'Combustible',   'fuel', 5),
  ('indumentaria',  'Indumentaria',  'shirt', 6),
  ('tecnologia',    'Tecnología',    'device', 7),
  ('tiendas-online','Tiendas online','bag', 8),
  ('belleza',       'Belleza',       'sparkle', 9),
  ('entretenimiento','Entretenimiento','ticket', 10)
on conflict (slug) do nothing;

insert into public.payment_methods (slug, name, kind, color) values
  ('mercado-pago',   'Mercado Pago',   'billetera', '#00A6E0'),
  ('banco-nacion',   'Banco Nación',   'banco',     '#0069B4'),
  ('santander',      'Santander',      'banco',     '#EC0000'),
  ('bbva',           'BBVA',           'banco',     '#072146'),
  ('galicia',        'Galicia',        'banco',     '#F26B21'),
  ('personal-pay',   'Personal Pay',   'billetera', '#7B3FE4'),
  ('naranja-x',      'Naranja X',      'billetera', '#FE5000'),
  ('macro',          'Macro',          'banco',     '#1B3A6B'),
  ('modo',           'MODO',           'billetera', '#2D2D7F'),
  ('uala',           'Ualá',           'billetera', '#3E6BFF'),
  ('cuenta-dni',     'Cuenta DNI',     'billetera', '#00843D'),
  ('provincia',      'Banco Provincia','banco',     '#00843D')
on conflict (slug) do nothing;

-- =====================================================================
-- Pesito · 0002 · Nuevos valores de enumeraciones
-- Va en su propia migración porque un valor agregado con ALTER TYPE
-- no puede usarse dentro de la misma transacción.
-- =====================================================================

-- Cupones y beneficios de cumpleaños reutilizan la tabla de promociones.
alter type public.promo_kind add value if not exists 'cupon';
alter type public.promo_kind add value if not exists 'cumple';

alter type public.promo_audience add value if not exists 'nuevos_clientes';
alter type public.promo_audience add value if not exists 'cumpleanieros';
alter type public.promo_audience add value if not exists 'miembros';

alter type public.discount_kind add value if not exists 'regalo';

-- Las sugerencias de usuarios entran a la misma cola de revisión.
alter type public.submission_origin add value if not exists 'usuario';
alter type public.submission_status add value if not exists 'en_revision' before 'aprobada';

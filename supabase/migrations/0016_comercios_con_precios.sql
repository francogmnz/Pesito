-- Pesito · «Comparar precios»: qué comercios tienen precios cargados y cuántos productos cada uno.
-- Sirve para mostrar las tiendas disponibles y filtrar por una.

create view public.price_merchants with (security_invoker = true) as
select m.slug, m.name, count(mp.id)::int as products
from public.merchants m
join public.merchant_products mp on mp.merchant_id = m.id
group by m.id;

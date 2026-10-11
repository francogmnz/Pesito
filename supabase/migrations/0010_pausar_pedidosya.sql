-- Pesito · PedidosYa bloquea a los lectores automáticos (verificación de Cloudflare, responde 403).
-- No se evade: la fuente queda pausada. Las promos ya publicadas no se tocan.

update public.sources set active = false where adapter = 'pedidosya';

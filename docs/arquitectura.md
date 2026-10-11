# Pesito · Arquitectura

> Cada pesito cuenta. Promos bancarias, cupones de primera compra y beneficios de cumpleaños de Argentina en un solo lugar.

## Punto de partida

El repositorio estaba vacío: las funcionalidades base (buscador de promociones, calculadora de reintegros, comparador, perfiles, favoritos, base de datos y panel administrativo) estaban definidas en la imagen de referencia, pero no tenían código. Se construyeron primero esas bases y, encima, las secciones nuevas, sin reemplazar ninguna.

## Stack

- **Next.js 16 (App Router) + TypeScript + Tailwind 4**, mobile-first e instalable (manifest + íconos).
- **Supabase**: Postgres con RLS, login por enlace mágico y almacenamiento privado de capturas.
- **Modo demo**: sin variables de Supabase la app usa un repositorio en memoria con datos de ejemplo marcados como "Ejemplo". Sirve para diseñar y probar sin base de datos; nunca se mezcla con datos reales.

```
src/
  app/(app)/        Pantallas de la app (barra inferior)
  app/admin/        Panel administrativo
  app/api/          Cron de actualización, lectura con IA, imágenes demo
  components/       Marca, tarjetas, navegación, calculadora
  lib/domain/       Reglas puras (calculadora, cumpleaños, cupones, duplicados, moderación, validación)
  lib/data/         Repositorio: memoria (demo) y Supabase, misma interfaz
  lib/ingest/       Automatización: adaptadores de fuentes y procesamiento
supabase/
  migrations/       0001 base · 0002 nuevos valores · 0003 cupones/cumple/sugerencias · 0004 storage · 0005 publicación
  seed.sql          Catálogos (categorías, bancos y billeteras). Sin promociones.
```

## Qué cambió en la arquitectura

1. **Una sola entidad de promoción.** Cupones y beneficios de cumpleaños son `promotions` con `kind = 'cupon' | 'cumple'`. Lo específico vive en tablas 1:1 (`coupon_details`, `birthday_details`). Así el buscador, los favoritos, los reportes, la automatización y la publicación funcionan igual para todo.
2. **Requisitos compartidos.** `promotions.requirements` (registro previo, DNI, programa de beneficios, primera compra, solo app, cuenta nueva) sirve para cupones y cumpleaños.
3. **Guardados y utilizados en la misma tabla.** `user_promotion_states` (antes solo favoritos) suma `used_at`.
4. **Una sola cola de revisión.** Las sugerencias de usuarios entran a `promo_submissions`, la misma cola que ya usaba la automatización (`origin = 'usuario' | 'automatizacion'`). El candidato se guarda como `payload` (mismos campos que una promoción) para que el admin lo corrija antes de publicar.
5. **Publicación atómica.** `publish_promotion()` crea comercio, promo, medios de pago y detalle en una transacción. Solo el admin o el service role pueden llamarla.
6. **Historial de moderación.** `moderation_events` registra cada cambio de estado y quién lo hizo.

## Modelo de datos (resumen)

| Tabla | Para qué |
|---|---|
| `categories`, `merchants`, `payment_methods` | Catálogos. El logo del comercio solo se muestra si `logo_authorized`. |
| `profiles` | Rol y cumpleaños opcional (`birthday_day`, `birthday_month`, **sin año**). |
| `user_payment_methods` | Bancos y billeteras de cada persona (onboarding). |
| `promotions` | Reintegros, descuentos, cupones y cumpleaños. Huella única (`fingerprint`) para evitar duplicados. |
| `promotion_payment_methods` | Con qué medios aplica cada promo. |
| `coupon_details` | Código, forma de uso, solo clientes nuevos, registro en otra plataforma. |
| `birthday_details` | Ventana (día, semana, mes, rango), tipo de beneficio, programa de fidelización. |
| `user_promotion_states` | Guardado (`saved_at`) y utilizado (`used_at`). |
| `promotion_reports` | Reportes de cupones vencidos o que no funcionan. |
| `promo_submissions` | Cola de revisión: sugerencias y detecciones automáticas. Estados: pendiente, en revisión, aprobada, rechazada. |
| `moderation_events` | Historial de moderación. |
| `sources`, `ingestion_runs` | Fuentes oficiales/autorizadas y corridas de la automatización. |

## Reglas de seguridad (en la base)

- RLS en todas las tablas. El público solo ve promos `publicada`.
- Las personas no pueden cambiarse el rol (permiso por columna) ni publicar: solo crean sugerencias `pendiente` propias.
- Límites por trigger: 5 sugerencias por persona cada 24 h, 20 por IP (hash con sal), 10 reportes por persona por día, un reporte abierto por promo.
- Con 3 reportes abiertos de personas distintas, la promo pasa sola a `en_revision` (deja de mostrarse).
- Capturas en bucket privado, 5 MB, solo JPG/PNG/WEBP, cada persona sube a su carpeta.
- En la app: validación con Zod, trampa antispam y tiempo mínimo de llenado, verificación de imágenes por sus bytes, enlaces solo `https` públicos, redirecciones internas validadas.

## Navegación mobile

Barra inferior con 4 destinos y un botón central:

- **Inicio** · **Explorar** (Promos / Cupones / Cumpleaños como pestañas) · **(+)** · **Guardados** · **Perfil**
- El botón central abre las acciones rápidas: **Sugerí una promo**, Calculadora, Comparador y Tu cumple.
- "Sugerí una promo" además está visible en el banner del inicio.

## Sugerí una promo

1. Formulario corto en 4 bloques (captura, qué es, cuánto y cuándo, evidencia).
2. Opcional: **Completar con IA** lee la captura (`ANTHROPIC_API_KEY`) y propone los campos; la persona los revisa. La IA nunca publica.
3. Se exige enlace oficial o captura como evidencia.
4. Entra como `pendiente`. El admin: empieza la revisión, ve la captura y el enlace, revisa duplicados, corrige, aprueba o rechaza (con motivo visible para la persona) y publica.

## Actualización automática

`GET /api/cron/actualizar` con `Authorization: Bearer $CRON_SECRET` (o "Actualizar ahora" en el panel):

- Lee cada fuente activa con su adaptador. Hoy existe `json-feed` para feeds autorizados; no se hace scraping.
- **Nuevas**: se publican solas solo si la fuente es **oficial**, tiene `auto_publish` y el dato está completo y sin posibles duplicados. Si no, van a revisión con el motivo.
- **Existentes sin cambios**: se marcan como verificadas.
- **Cambios**: una extensión de vigencia en fuente oficial se aplica sola; cualquier otro cambio va a revisión con el antes y después.
- **Desaparecidas del feed**: se propone la baja a revisión.
- **Vencimientos**: `expire_promotions()` pasa a `vencida` lo terminado (fecha de Argentina).

Para agregar una fuente: fila en `sources` con `url` https, `kind`, `adapter = 'json-feed'` y, si hace falta, `config.fieldMap` para mapear nombres de campos.

### Lectores de páginas (0006)

| Fuente | Adaptador | Cómo lee |
|---|---|---|
| Ualá · `uala.com.ar/promociones` | `uala` | JSON embebido de Next.js (`__NEXT_DATA__`): % , tope, días, vigencia, canal, legales y códigos de cupón |
| PedidosYa · `pedidosya.com.ar/promotions-section/promotions` | `pedidosya` | JSON embebido: banco, %, reintegro o descuento, días. No trae tope ni vigencia |
| Mercado Pago · `promociones.mercadopago.com.ar` | `mercadopago` | HTML de WordPress: solo promos con % (las de cuotas o 2x1 se ignoran por ahora) |
| MODO | — | No se lee: las promos salen de `/api/` y `/data/`, que su robots.txt prohíbe. Pedir acceso o cargar a mano |

- Antes de leer, se consulta el `robots.txt` del sitio; si prohíbe la ruta, la corrida falla con ese motivo.
- Las fuentes son `oficial` pero con `auto_publish = false`: **todo va a revisión**.
- Lo que el equipo rechaza no se vuelve a encolar en las corridas siguientes.
- Programación: `vercel.json` corre `/api/cron/actualizar` todos los días a las 10:00 UTC (7:00 en Argentina). Necesita `CRON_SECRET` y `SUPABASE_SERVICE_ROLE_KEY` en Vercel.
- Si un sitio cambia su estructura, el lector falla con un error claro en Panel → Automatización; las pruebas usan copias en `tests/fixtures/`.

## Pruebas

- `npm test`: reglas de negocio, automatización, lectura con IA y **migraciones SQL contra Postgres real** (PGlite) con RLS y triggers.
- `npm run test:e2e`: flujo completo en modo demo (cupón → cumpleaños → sugerencia → revisión → publicación → permisos).
- `npm run check`: tipos + lint + tests.

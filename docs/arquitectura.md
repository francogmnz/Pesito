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
  migrations/       0001 base · 0002 nuevos valores · 0003 cupones/cumple/sugerencias · 0004 storage · 0005 publicación · 0006 fuentes · 0007 logos · 0008 MODO por tandas · 0009 fuente Prex · 0010 pausa PedidosYa · 0011 fuente Farmaonline · 0012 aprobación automática · 0013 MODO vigentes primero · 0014 productos y precios · 0015 Get The Look · 0016 comercios con precios · 0017 Farmaplus y Pigmento · 0018 fuente Brubank · 0019 fuente Belo · 0020 promos de Get The Look
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
| `source_records` | Páginas de las fuentes que se leen por tandas (MODO): estado, vigencia y próxima lectura. |

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

- Lee cada fuente activa con su adaptador: `json-feed` para feeds autorizados y lectores de páginas públicas que respetan el `robots.txt` de cada sitio.
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
| Prex · `prexcard.com.ar/promociones` | `prex` | Listado (`__NEXT_DATA__`) + la página de cada promo (unas 15, con pausa): %, tope, mínimo, días, vigencia y código salen del texto y los términos. Lo que no tiene % (transferencias sin comisión, asistencia sin costo) no se carga. Si una página falla, la corrida entera da error |
| Farmaonline · `farmaonline.com/promociones-bancarias` | `farmaonline` | Tarjetas ya armadas en el HTML (VTEX): titular + texto legal. El banco es un logo, así que se deduce del legal (`ingest/payment-names.ts`); tope, mínimo, días y vigencia salen del texto. Las de solo cuotas se saltean |
| Belo · `belo.app/ar/beneficios` | `belo` | Listado (Framer, una tarjeta repetida por tamaño de pantalla) + la página de cada beneficio: «Mecánica» (porcentaje, tope, mínimo), «Vigencia» (días) y vencimiento de la tarjeta. Los convenios sin fecha ni mecánica no se cargan. Cada 12 h |
| Get The Look · `getthelook.com.ar/getthelook/medios-de-pago` | `getthelook` | Tabla embebida (`__RUNTIME__ → rawDataJson`): una fila por tarjeta y cuotas, con el beneficio en «Promoción» y los términos en «Legales». Una promo por banco y texto; días abreviados (`parseDayText`), tope, canal y vigencia salen del texto. Cada 12 h |
| Brubank · `brubank.com/beneficios` | `brubank` | Tarjetas del carrusel por plan (One, Plus, Ultra): beneficio, comercio, tope y días. Vigencia, período del tope y términos salen del artículo de ayuda que enlaza cada tarjeta (`help.brubank.com`, con la pausa de 1 s que pide su robots). Sin artículo, va a revisión. Se lee cada 12 h (`config.everyHours`) |
| MODO · `modo.com.ar/promos/{slug}` | `modo` | Por tandas: sitemap + página pública de cada promo (datos embebidos del App Router). Ver abajo |

- Antes de leer, se consulta el `robots.txt` del sitio; si prohíbe la ruta, la corrida falla con ese motivo.
- Las fuentes son `oficial` pero con `auto_publish = false`: **todo va a revisión**.
- Lo que el equipo rechaza no se vuelve a encolar en las corridas siguientes.
- Programación: `vercel.json` corre `/api/cron/actualizar` todos los días a las 10:00 UTC (7:00 en Argentina). Necesita `CRON_SECRET` y `SUPABASE_SERVICE_ROLE_KEY` en Vercel.
- Si un sitio cambia su estructura, el lector falla con un error claro en Panel → Automatización; las pruebas usan copias en `tests/fixtures/`.

### «Comparar precios»: productos y precios (0014)

Compara el mismo producto entre comercios. Arranca con perfumería, dermocosmética y cuidado personal de Farmaonline y Farmacity (tiendas VTEX).

- **Datos** (`0014_productos_precios.sql`): `products` (uno por código de barras), `merchant_products` (la publicación de cada comercio, con el precio vigente en la misma fila), `price_history` (una fila solo cuando cambia precio o stock) y la vista `product_summaries` para el buscador. Todo se escribe con `upsert_listing()`. De las fotos se guarda el enlace.
- **Mismo producto = mismo EAN/GTIN válido** (`domain/products.ts`, con dígito verificador). El `gtin` que las tiendas ponen en su JSON-LD es su código interno; el real está en `__STATE__`. Sin código válido, el producto no se carga: no hay coincidencias por nombre todavía.
- **Lectura** (`prices/vtex.ts`, `prices/crawl.ts`): sitemap de productos → página pública de cada producto, por tandas, con la misma cola `source_records` de MODO. Lo que es de otro rubro, no tiene código de barras o tiene varias presentaciones en una página se marca y no se relee. Los precios se revisan cada 72 h; después de 5 días sin verificar se muestran como «puede estar desactualizado».
- **Corre aparte**: `/api/cron/precios` (adaptador `vtex-precios`), llamado por el mismo workflow de GitHub. No pasa por la actualización de promos.
- **Pantallas**: `/conviene` (buscador) y `/conviene/[id]` (comparación). El costo con promo bancaria usa `compareForMerchant` del motor existente y se muestra siempre como estimación.
- **Pendiente**: coincidencias por nombre para revisar a mano, más comercios, productos con varias presentaciones, sección de precios en el panel.

### Aprobación automática (0012)

Cada candidato termina en uno de tres lugares (`ingest/process.ts`):

- **Publicado solo**: la fuente es oficial con `auto_publish`, pasa `publishProblems`, el lector no dejó `flags`, no hay dudas generales (`sanityFlags`: porcentaje ≥ 70, comercio genérico, texto con restos de HTML, mínimo que ya supera el tope) y no es un duplicado casi seguro (puntaje ≥ 0,85).
- **A revisión**: todo lo demás, con el motivo. Las `notes` del lector (dato ya escrito en la promo: segmento, horario, tope sin período) van con el prefijo «Nota: » y no frenan.
- **Descartado**: vencido en la fuente, solo cuotas o sin porcentaje. No se carga.

Cambios sobre promos ya publicadas: se aplican solos si la fuente es de confianza y no cambia el beneficio (`discountValue`/`discountKind`); si cambia, o si la promo fue corregida a mano (`promotions.manual_edit_at`, lo marca Panel → Promos), van a revisión. Una promo archivada por una persona no se revive; una vencida que la fuente renueva se vuelve a publicar.

Revisión agrupa la cola por fuente y por motivo; filtrando por un motivo se puede publicar o rechazar el grupo entero. `.github/workflows/actualizar.yml` llama a `/api/cron/actualizar` cada media hora (necesita el secreto `CRON_SECRET` en GitHub); Vercel lo hace una vez por día.

### Panel → Promos

`/admin/promos` lista lo ya cargado (publicadas, pausadas, vencidas, archivadas) con buscador; `/admin/promos/[id]` edita con el mismo formulario de Revisión (`EditPayloadForm` con `save`) y cambia el estado; `/admin/promos/nueva` carga y publica a mano. Archivar no borra. El identificador de la fuente (`external_id`) no se edita: es lo que evita que el lector la vuelva a cargar.

### La misma promo en varias billeteras

Hay promos que varias fuentes publican por separado (un código de Mastercard que sirve con Ualá y con Prex). Si un candidato nuevo coincide con una promo publicada en comercio, beneficio, tope, mínimo, días, vencimiento y código (`sameBenefit` en `ingest/process.ts`), no se crea otra: va a revisión un cambio que le suma el medio de pago a la existente. Una vez aprobado, las dos fuentes la dan por verificada. La baja la sigue detectando solo la fuente que la creó.

### MODO por tandas (0008)

- **Qué se lee y qué no.** El listado `/promos` carga sus tarjetas desde `/api/`, que el `robots.txt` de MODO prohíbe: eso no se toca. Sí se leen el `sitemap.xml` y la página pública de cada promo (`/promos/{slug}`), que trae los datos en el HTML. Falta revisar los términos de uso de MODO y conviene pedirles autorización.
- **Por qué por tandas.** El sitemap lista ~28.000 páginas y solo ~1.700 están vigentes. Cada corrida lee una tanda (`config.batchSize`, 250 por defecto, con pausa `delayMs` entre consultas) y `source_records` guarda qué pasó con cada página: lo vencido no se relee, lo vigente se revisa cada `recheckDays` (7).
- **Orden.** Primero los slugs con mes reciente (`…-oct26`, `2609-…`), después los que no dicen fecha, al final los viejos (`modoPriority`).
- **Interpretación** (`parseModoPromo` en `src/lib/ingest/sites/modo.ts`):
  - `status: active` y `calculated_status: running` no significan que aplique hoy: mandan vigencia (`start_date`/`stop_date`), días y tarjetas.
  - Tope: `cap_amount_period` + `cap_period` (day/week/month/promo → día/semana/mes/vigencia); si no hay, `cap_transaction` como tope por compra. `0` es "no hay".
  - `cap_type: bank` (tope por persona en cada banco), tarjetas habilitadas, cuotas y horario van como texto al inicio de las condiciones; todavía no son campos propios.
  - El banco no viene como dato: se toma del nombre interno (`2510-credicoop-…`) o del slug. Con banco → ese banco y "pagando con MODO"; sin banco → medio de pago MODO (bancos adheridos) con aviso.
  - Promos de solo cuotas o vouchers sin porcentaje se saltean (`omitida`).
  - Avisos que van como motivo de revisión: legales con otra fecha que la vigencia, posible segmento (Platinum, Selecta…), varios bancos, horario parcial.
- **Bajas.** Una corrida parcial no infiere bajas por ausencia; solo se propone la baja si la página de una promo vigente deja de existir.
- **Ritmo.** Con el cron diario de Vercel se leen 250 páginas por día. Para la primera pasada conviene apretar "Actualizar ahora" varias veces o llamar al cron más seguido desde un programador externo.
- Las pruebas usan recortes de páginas reales en `tests/fixtures/modo-*.html` (solo el objeto de la promo).

### Panel: publicación masiva, comercios y T&C (0007)

- **Revisión**: casillas por fila y "Marcar todas". "Aprobar y publicar" aplica a las marcadas las mismas validaciones que la publicación individual; las que no pasan quedan en la cola con el motivo. "Rechazar" pide un motivo único.
- **Comercios** (`/admin/comercios`): rubro y logo. Los logos van al bucket público `logos` (solo admin sube, 1 MB, PNG/JPG/WEBP) y **solo se muestran si se marca "Tengo permiso para usar este logo"** (`merchants.logo_authorized`).
- **Avatar sin logo**: servicios genéricos (colectivos, subte, trenes, peajes, taxis o rubro Transporte) muestran el ícono; el resto, iniciales con un sello del rubro.
- **Dónde aplica** depende del rubro: colectivos → "En colectivos", combustible → estaciones o app, delivery → "En la app"; si no, el canal.
- **T&C**: si son largos, se muestra "Lo importante" (mínimo, tope, acreditación, stock, no acumulable, exclusiones; sin CUIT, domicilios ni leyes) y los legales completos plegados. Lo hace `summarizeConditions` en `src/lib/domain/legal.ts`, sin IA: solo recorta frases del texto original.

## Pruebas

- `npm test`: reglas de negocio, automatización, lectura con IA y **migraciones SQL contra Postgres real** (PGlite) con RLS y triggers.
- `npm run test:e2e`: flujo completo en modo demo (cupón → cumpleaños → sugerencia → revisión → publicación → permisos).
- `npm run check`: tipos + lint + tests.

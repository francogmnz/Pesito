# Pesito

**Cada pesito cuenta.** Promos bancarias, cupones de primera compra y beneficios de cumpleaños de Argentina, en un solo lugar.

## Qué incluye

- Inicio, buscador y catálogo de promociones con filtros (categoría, aplican hoy, mis medios de pago).
- Detalle con calculadora de reintegro, calculadora suelta y comparador de medios de pago.
- **Cupones para vos**: bienvenida y primera compra, copiar código, guardar, filtrar, próximos a vencer, marcar como usado y reportar.
- **Tu cumple con Pesito 🎂**: beneficios por ventana (día, semana, mes), requisitos claros, cumpleaños opcional sin año.
- **Sugerí una promo**: formulario rápido con lectura opcional por IA; nada se publica sin revisión.
- Perfil, onboarding de bancos y billeteras, guardados y usados.
- Panel administrativo: cola de revisión, duplicados, correcciones, aprobar/rechazar/publicar, reportes y automatización.

La arquitectura y el modelo de datos están en [docs/arquitectura.md](docs/arquitectura.md).

## Probarlo ya (modo demo)

```bash
npm install
npm run dev
```

Abrí http://localhost:3000. Sin Supabase configurado, la app usa datos de ejemplo en memoria (marcados como **Ejemplo**). En **Ingresar** podés cambiar entre una persona usuaria, el equipo admin o navegar sin cuenta.

## Conectar Supabase

1. Creá un proyecto en Supabase y copiá `.env.example` a `.env.local` con tus claves.
2. Aplicá las migraciones y los catálogos:
   ```bash
   supabase link --project-ref TU_PROYECTO
   supabase db push
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```
3. Hacé admin a tu usuario después de ingresar una vez:
   ```sql
   update public.profiles set role = 'admin' where id = 'TU-USER-ID';
   ```
4. Programá la actualización automática (por ejemplo cada 6 horas) contra `GET /api/cron/actualizar` con el header `Authorization: Bearer $CRON_SECRET`.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm test` | Tests de reglas, automatización y migraciones SQL (PGlite) |
| `npm run test:e2e` | Flujo completo en modo demo (necesita `CHROME_PATH` y el servidor corriendo) |
| `npm run check` | Tipos + lint + tests |

## Principios

- No inventamos promos ni códigos: lo real entra desde fuentes oficiales o autorizadas, o por revisión del equipo.
- Los logos de comercios solo se muestran con autorización de uso.
- Lo dudoso siempre pasa por una persona antes de publicarse.

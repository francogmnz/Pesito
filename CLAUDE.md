# Pesito

Promos bancarias, cupones y beneficios de cumpleaños de Argentina. El proyecto ya existe: se extiende, no se rehace.

- Arquitectura, modelo de datos y lectores de fuentes: [docs/arquitectura.md](docs/arquitectura.md).
- Cómo correrlo y scripts: [README.md](README.md).
- Antes de escribir código de Next.js, leer [AGENTS.md](AGENTS.md).

## Reglas del proyecto

- Nada se publica solo: todo lo que leen los lectores va a la cola de revisión.
- Los lectores respetan el `robots.txt` de cada sitio (`fetchPage`) y no evaden bloqueos. De MODO no se usa `/api/` ni `/data/`.
- No se guardan imágenes ni HTML completo en la base: solo enlaces.
- La base de producción no se toca desde acá: las migraciones van a `supabase/migrations/`, se prueban con PGlite y las aplica Franco.
- Un solo motor de cálculo (`src/lib/domain/calc.ts`), un solo panel (`src/app/admin`), una sola base.
- `npm run check` (tipos + lint + tests) antes de dar algo por terminado.

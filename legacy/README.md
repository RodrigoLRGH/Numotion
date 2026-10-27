# Código heredado (Astro DB)

Servicios y endpoints anteriores a la migración a PostgreSQL (ADR-010). No se compilan
ni se publican: `tsconfig.json` excluye esta carpeta y Astro solo enruta `src/pages`.

Sirven de referencia mientras cada módulo se reescribe sobre `db/migrations` y
`src/modules/shared/servidor/db.ts`. Cuando un archivo ya tiene reemplazo, se elimina de aquí.
Seguimiento en `docs/specs/00-contexto/estado-actual.md §9`.

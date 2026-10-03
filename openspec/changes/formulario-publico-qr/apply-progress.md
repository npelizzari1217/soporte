# Apply progress: formulario-publico-qr

## WU-1 — Master: slug, habilitacion y congelamiento (completa, sin commitear por exceder el presupuesto)

Modo: estandar (sin TDD estricto). Tareas 1.1 a 1.7 marcadas en `tasks.md`.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/clientes`: 46 archivos, 346 tests, todos verdes |
| Runtime harness | Integracion contra `soporte_master_test` (`prisma-cliente.repository.integration.spec.ts`): unicidad, CHECK, CAS |
| Rollback | Migracion `20261003120000_add_cliente_formulario_publico` con `rollback.sql`; sin consumidores todavia |

### Decisiones tomadas en apply

- `toPersistence()` omite `slug` y `slugCongeladoAt`: solo los CAS del repositorio los escriben, asi un `save()` con una entidad vieja no descongela. `formularioPublicoHabilitado` si es espejo.
- `cambiarSlugSiNoCongelado` devuelve `'CAMBIADO' | 'CONGELADO' | 'DUPLICADO'` (P2002 se traduce en infraestructura).
- `habilitarFormulario` devuelve `Result` con `SlugRequeridoError`; `configurarSlug` devuelve `Result` y rechaza slug congelado.
- `SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/`, largo maximo 63 (CHECK espeja el regex).
- 18 specs existentes con dobles de `IClienteRepository` recibieron 3 stubs (`findBySlug`, `congelarSlug`, `cambiarSlugSiNoCongelado`).

### Pendiente de WU-2 en adelante

Sin tocar.

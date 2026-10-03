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

## WU-2 — Configurar formulario publico (BE) (completa)

Modo: estandar (sin TDD estricto). Tareas 2.1 a 2.4 marcadas en `tasks.md`. Rama `feat/formulario-publico-qr-wu02`, apilada sobre `feat/formulario-publico-qr-wu01`.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Unit | `configurar-formulario-publico.use-case.spec.ts` (11 casos): no ROOT, cliente inexistente antes del CAS, CONGELADO, DUPLICADO, sin slug, mismo slug sin CAS |
| Controller | `clientes.controller.spec.ts`: mapeo 403/404/400/409 y delegacion con el actor |
| Runtime harness | e2e `formulario-publico.e2e.spec.ts` contra `soporte_master_test` con guards reales: 401, ADMIN 403, ROOT 200, 404, 409 (sin slug, duplicado, congelado), 400 (formato, UUID, dbName) |
| Rollback | Sin migracion; `git revert` limpio. El endpoint solo lo usa ROOT y el formulario sigue apagado |

### Decisiones tomadas en apply

- Orden del caso de uso: ROOT, `findById` (404) ANTES del CAS, validacion en memoria (slug y habilitacion), CAS del slug, `save` solo si cambio la habilitacion. Cierra el arrastre del verificador de WU-1 (cliente inexistente daba `CONGELADO`).
- Un slug igual al actual no es un cambio: no toca el CAS ni falla por congelado.
- Mapeo HTTP: `SlugInvalidoError` 400; `SlugCongeladoError`, `SlugDuplicadoError`, `SlugRequeridoError` 409; `ClienteNoEncontradoError` 404; nuevo `OnlyRootCanConfigurarFormularioError` 403.
- `ClienteResponseDto` suma `slug` y `formularioPublicoHabilitado` (la spec pide poder consultar la configuracion); se actualizaron 2 `toEqual` del spec del controller.
- DTO: `@Matches(SLUG_REGEX)` y `@MaxLength` cortan la basura en el borde; el dominio sigue siendo la fuente (UUID, id, dbName).

## WU-3 — FE: dialogo de configuracion (completa)

Modo: estandar. Tareas 3.1 a 3.3 marcadas en `tasks.md`. Rama `feat/formulario-publico-qr-wu03`, apilada sobre `feat/formulario-publico-qr-wu02b`. `size:exception` (434 lineas de frontend): el hook quedaria sin test propio si se partiera. Dos commits: frontend, y un fix de backend con `code` en los errores del slug.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/features/clientes`: 7 archivos, 73 tests verdes (7 del dialogo + casos del schema) |
| Runtime harness | N/A: componente aislado, MSW para el PATCH. Backend: e2e `formulario-publico.e2e.spec.ts` asevera `code` en 400/409 |
| Rollback | Revertir los dos commits; el dialogo solo se monta en `ClienteAcciones` (ROOT) |

### Decisiones tomadas en apply

- El dialogo manda solo lo que cambio; slug invalido y habilitar sin slug se rechazan en el front sin llamar al backend.
- El aviso se decide por `ApiError.code` (mapa en el hook); sin codigo cae al mensaje del backend.
- Hallazgo: el backend no enviaba `code` en estos errores. Se corrigio en `toHttpException` para los cuatro errores del slug. El 400 de borde del DTO (`@Matches`) sigue sin `code` y cae al mensaje.
- El front no sabe si el slug esta congelado (la respuesta no lo trae): se entera por el 409.
- Deuda de Ayuda: boton "Formulario" (solo ROOT) por fila de cliente, con slug y habilitacion. No hay articulo previo que se vuelva falso.
- `pnpm lint` del frontend requiere `JWT_SECRET` en el entorno (se uso un valor ficticio).


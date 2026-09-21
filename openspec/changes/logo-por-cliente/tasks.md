# Tasks: Logo por cliente en el sidebar

> **Desvío declarado de presupuesto.** El skill `sdd-tasks` fija un tope de 530
> palabras; este artefacto lo supera. La tensión la creó el encargo: 4 work
> units con 4 controles de seguridad no negociables (round-trip del mapper,
> arreglo binario del proxy, rechazo de SVG con test que falla, controller
> nuevo) exigidos explícitamente como "no pueden quedar como un renglón". Se
> comprimió cada tarea a 1-2 líneas y se evitó prosa redundante con `design.md`;
> no se recortó ningún control de seguridad para entrar en el tope.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | WU1 ~280 · WU2 ~380 · WU3 ~330 · WU4 ~300 (rango total ~1000-1300) |
| 400-line budget risk | Medium (ninguna unidad individual supera holgadamente 400; WU2 es la más ajustada) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (WU1) → PR 2 (WU2) → PR 3 (WU3) → PR 4 (WU4) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Storage + persistencia: `retrieve()`, migración, entidad, mapper espejado | PR 1 | `pnpm vitest run backend/src/clientes backend/src/shared` | N/A — sin consumidor HTTP todavía, solo unit/integration de mapper | Columnas nullable sin consumidor; revert limpio sin migración de reversa aplicada |
| 2 | Endpoints: pipe, 3 use cases, `ClienteLogoController` nuevo | PR 2 | `pnpm vitest run backend/src/clientes/interface backend/src/clientes/application` | `curl` manual a `POST/GET/DELETE /clientes/:id/logo` contra Postgres real | Controller y pipe nuevos; revert no toca `ClientesController` |
| 3 | Propagación: `resolverScope`, `JwtPayload`, sidebar, arreglo del proxy | PR 3 | `pnpm vitest run backend/src/auth frontend/src/components/shell frontend/src/app/api` | Login manual en navegador; inspección de `Content-Type` del `<img>` servido | Campo JWT aditivo (`VERSION_PAYLOAD_JWT` sin tocar); revert no desloguea sesiones vivas |
| 4 | Diálogo de carga en `Admin > Clientes` | PR 4 | `pnpm vitest run frontend/src/features/clientes` | Carga manual de un PNG/JPEG/WebP y de un SVG rechazado en el diálogo | Diálogo y hooks nuevos; revert no toca WU1-3 |

## WU1: Storage y persistencia

- [ ] 1.1 [RED] Test en `local-disk-file-storage.spec.ts`: `retrieve()` devuelve el `Buffer` de un archivo existente y `null` si no existe (`ENOENT`), sin lanzar.
- [ ] 1.2 [GREEN] Agregar `retrieve(key): Promise<Buffer | null>` a `backend/src/shared/domain/ports/i-file-storage.ts` e implementarlo en `backend/src/shared/infrastructure/storage/local-disk-file-storage.ts`.
- [ ] 1.3 Migración Prisma: agregar `logo_storage_key`, `logo_mime_type`, `logo_updated_at` (nullable, sin default, sin CHECK) a `Cliente` en `backend/prisma_master/schema.prisma`; generar con `prisma migrate dev`.
- [ ] 1.4 Escribir la migración de reversa (`down`) que dropea las 3 columnas — es el único paso que `git revert` no cubre del plan de rollback de la propuesta.
- [ ] 1.5 [RED] Test en `cliente.entity.spec.ts`: `actualizarLogo(key, mime, fecha)` setea las 3 props juntas; `quitarLogo()` las limpia juntas.
- [ ] 1.6 [GREEN] Extender `ClienteProps` (key/mime/fecha nullable) y agregar `actualizarLogo()`/`quitarLogo()` + getters en `backend/src/clientes/domain/entities/cliente.entity.ts`.
- [ ] 1.7 [RED] Test OBLIGATORIO de round-trip en `cliente.mapper.spec.ts`: `toDomain(toPersistence(clienteConLogo))` conserva las 3 columnas de logo. Debe fallar si `toDomain` no las hidrata — sin esto, un `PATCH` comercial borra el logo en silencio vía el `upsert` de `prisma-cliente.repository.ts` (read-only, evidencia del riesgo).
- [ ] 1.8 [GREEN] Mapear las 3 columnas en `toDomain` Y en `toPersistence` de `backend/src/clientes/infrastructure/persistence/prisma/cliente.mapper.ts` (espejo completo, nunca `Omit`).
- [ ] 1.9 Correr `pnpm typecheck` y `pnpm test` en backend; confirmar revert limpio de WU1 (sin consumidor HTTP todavía).

## WU2: Endpoints

- [ ] 2.1 [RED] Test en `validar-logo-cliente.spec.ts`: acepta `image/png`, `image/jpeg`, `image/webp` hasta 512 KB; rechaza `image/svg+xml` con 422 aunque empiece con `image/`; rechaza >512 KB y 0 bytes con 422, antes de escribir en disco. Debe ponerse en rojo si la whitelist muta a prefijo `image/*`.
- [ ] 2.2 [GREEN] Crear `backend/src/clientes/interface/pipes/validar-logo-cliente.ts`, HERMANO de `backend/src/tickets/interface/pipes/validar-archivo-adjunto.ts` (read-only, nunca reuso): `MIMES_LOGO` como `Set` exacto de 3 valores, `MAX_LOGO_BYTES = 512 * 1024`.
- [ ] 2.3 [RED] Test de casos de uso con mocks de `IFileStorage`: sube con key nueva (UUID), persiste la fila, borra la key anterior best-effort; si `delete` falla, la operación igual reporta éxito.
- [ ] 2.4 [GREEN] Crear `ConfigurarLogoCliente`, `QuitarLogoCliente`, `VerLogoCliente` en `backend/src/clientes/application/use-cases/` con `Result<T, DomainError>`; orden: key nueva → upload → persistir → delete best-effort de la key anterior.
- [ ] 2.5 [RED] Test de controller (guards mockeados salvo el chequeo inline): usuario de A pide logo de B → 403; pide el suyo → 200; ROOT pide cualquiera → 200; ADMINISTRADOR intenta `POST` → 403; sin token → 401; `DELETE` sin logo → 204.
- [ ] 2.6 [GREEN] Crear `backend/src/clientes/interface/controllers/cliente-logo.controller.ts` NUEVO — nunca agregar rutas a `clientes.controller.ts` (read-only, su `GlobalAdminGuard` de clase volvería el `GET` ROOT-only). `POST`/`DELETE`: `JwtAuthGuard + GlobalAdminGuard`. `GET`: solo `JwtAuthGuard` + chequeo inline `user.is_global_admin || user.cliente_id === params.id` — nunca `TenantGuard`.
- [ ] 2.7 [GREEN] `GET`: responder con el `Content-Type` almacenado, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, siguiendo el patrón `@Res({ passthrough: true })` de `backend/src/equipos/interface/controllers/equipos.controller.ts` (read-only, molde); nunca exponer storage key ni ruta de filesystem.
- [ ] 2.8 Wiring en `backend/src/clientes/clientes.module.ts` (`FILE_STORAGE` ya lo exporta `SharedModule`); correr `pnpm typecheck`, `pnpm lint`, `pnpm test` en backend.

## WU3: Propagación y sidebar

- [ ] 3.1 [RED] Test de `resolver-scope.spec.ts`: `ScopeResuelto` incluye `clienteLogoVersion` (epoch ms de `logoUpdatedAt`, `null` sin logo), sin queries nuevas.
- [ ] 3.2 [GREEN] Agregar `clienteLogoVersion` a `ScopeResuelto` en `backend/src/auth/application/use-cases/resolver-scope.ts`.
- [ ] 3.3 [GREEN] Agregar `cliente_logo_v: number | null` a `JwtPayload` en `backend/src/auth/domain/ports/i-token.service.ts` SIN bumpear `VERSION_PAYLOAD_JWT` (queda en 2); propagarlo desde `backend/src/auth/application/use-cases/login.use-case.ts`, `switch-tenant.use-case.ts` y `refresh-token.use-case.ts`. Actualizar `backend/src/auth/test-helpers/payload-de-test.ts`.
- [ ] 3.4 [RED] Test del proxy BFF: una respuesta binaria (PNG) atraviesa `frontend/src/app/api/[...path]/route.ts` byte a byte, sin corromperse.
- [ ] 3.5 [GREEN] Arreglar `route.ts`: usar `arrayBuffer()` en vez de `text()` para respuestas no-JSON; reenviar `x-content-type-options` y `cache-control`. Revisar y ajustar aserciones existentes de tests del proxy que ese cambio mueva (incluidas descargas CSV).
- [ ] 3.6 [RED] Test de `app-sidebar.test.tsx`: con `cliente_logo_v` renderiza `<img src="/api/clientes/{id}/logo?v={cliente_logo_v}">`; sin el campo, con error de carga (401/404), o con sesión MASTER (`cliente_id: null`) renderiza `Building2` sin imagen rota ni hueco de layout; cambiar de cliente actualiza el logo sin recargar.
- [ ] 3.7 [GREEN] Espejar `cliente_logo_v` en `frontend/src/shared/api/types.ts` (`JwtPayload` + normalización defensiva a `null` en `decodeJwtPayload`, igual que `modulos`/`nombre`).
- [ ] 3.8 [GREEN] Agregar el bloque de marca —NUEVO, no existía antes de este cambio— a `frontend/src/components/shell/app-sidebar.tsx`, entre el botón de colapsar y el bloque de identidad: contenedor cuadrado fijo con `object-contain`, mismo tamaño colapsado/expandido, fallback a `Building2`.
- [ ] 3.9 Correr `pnpm typecheck`, `pnpm lint`, `pnpm test` en frontend y backend; confirmar 403/401 de aislamiento con Postgres real.

## WU4: Diálogo de carga

- [ ] 4.1 [RED] Test de `use-subir-logo-cliente` / `use-quitar-logo-cliente`: arma `FormData`, rechaza SVG y >512 KB en el cliente ANTES de enviar (espejo Zod de la whitelist del backend).
- [ ] 4.2 [GREEN] Crear los hooks en `frontend/src/features/clientes/hooks/`, reusando el patrón multipart de `frontend/src/features/tickets/hooks/use-ticket-mutations.ts` (read-only, molde ya existente — H3, no es trabajo nuevo).
- [ ] 4.3 [RED] Test del diálogo: previsualiza el archivo elegido, deshabilita el submit si el pipe cliente lo rechaza, muestra éxito/error del backend.
- [ ] 4.4 [GREEN] Crear el diálogo de carga en `frontend/src/features/clientes/components/`, molde de `frontend/src/features/clientes/components/configurar-csat-dialog.tsx` (read-only, molde), con `<input type="file">` en `Admin > Clientes`.
- [ ] 4.5 Anotar la deuda de Ayuda en el mensaje de commit y en el cuerpo del PR de esta unidad (pausa vigente desde 2026-09-07; NO se escribe ningún artículo de `backend/ayuda/*.md`) — el cambio agrega una pantalla de carga y un elemento visible del sidebar.
- [ ] 4.6 Correr `pnpm typecheck`, `pnpm lint`, `pnpm test` en frontend; confirmar revert limpio (diálogo y hooks no tocan WU1-3).

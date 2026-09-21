# Apply Progress: Logo por cliente en el sidebar

> Cubre WU1 (Storage y persistencia), WU2 (Endpoints) y WU3 (Propagación y
> sidebar). WU4 queda pendiente para el batch siguiente de `sdd-apply`, en
> orden (`stacked-to-main`).

## Mode

**Standard** (`strict_tdd: false`, cambio tipo FEATURE). `rules.apply.tdd: true`
del `openspec/config.yaml` sí aplicó igual: cada tarea `[RED]` se corrió y se
vio fallar por la razón correcta ANTES de escribir el `[GREEN]` correspondiente.

## Completed Tasks — WU1

- [x] 1.1 [RED] Test en `local-disk-file-storage.spec.ts`: `retrieve()` devuelve el `Buffer` de un archivo existente y `null` si no existe (ENOENT), sin lanzar.
- [x] 1.2 [GREEN] `retrieve(key): Promise<Buffer | null>` en `IFileStorage` + `LocalDiskFileStorage`.
- [x] 1.3 Migración Prisma: 3 columnas nullable en `Cliente` (`logo_storage_key`, `logo_mime_type`, `logo_updated_at`).
- [x] 1.4 Migración de reversa (`rollback.sql`) que dropea las 3 columnas.
- [x] 1.5 [RED] Test en `cliente.entity.spec.ts`: `actualizarLogo()`/`quitarLogo()` setean/limpian las 3 props juntas.
- [x] 1.6 [GREEN] `ClienteProps` extendido + `actualizarLogo()`/`quitarLogo()` + getters en `ClienteEntity`.
- [x] 1.7 [RED] Test OBLIGATORIO de round-trip en `cliente.mapper.spec.ts` (nuevo archivo).
- [x] 1.8 [GREEN] Las 3 columnas mapeadas en `toDomain` Y `toPersistence` de `ClienteMapper` (espejo completo, nunca `Omit`).
- [x] 1.9 `pnpm typecheck` y `pnpm test` (backend) verdes; revert limpio confirmado (sin consumidor HTTP todavía).

## TDD Cycle Evidence (WU1)

| Tarea | RED — comando y resultado observado | GREEN — comando y resultado observado |
|---|---|---|
| 1.1/1.2 `retrieve()` | `pnpm vitest run src/shared/infrastructure/storage/local-disk-file-storage.spec.ts` → 3 tests fallan: `TypeError: storage.retrieve is not a function` | mismo comando → 8/8 tests verdes |
| 1.5/1.6 `actualizarLogo()`/`quitarLogo()` | `pnpm vitest run src/clientes/domain/entities/cliente.entity.spec.ts` → 6 tests fallan: getters `undefined` y `TypeError: cliente.actualizarLogo is not a function` / `quitarLogo is not a function` | mismo comando → 27/27 tests verdes |
| 1.7/1.8 round-trip del mapper | `pnpm vitest run src/clientes/infrastructure/persistence/prisma/cliente.mapper.spec.ts` → 5/5 tests fallan: `expected null/undefined to be '...'` (toDomain no hidrataba, toPersistence no incluía las columnas) | mismo comando → 5/5 tests verdes |

## Work Unit Evidence

| Evidencia | Valor |
|---|---|
| Comando de test focalizado y resultado exacto | `pnpm vitest run backend/src/clientes backend/src/shared` (desde `backend/`: `pnpm vitest run src/clientes src/shared`) → **57 test files passed, 483 tests passed** |
| Harness de runtime / escenario y resultado exacto | N/A por diseño de WU1 (design.md, tabla "Suggested Work Units": "sin consumidor HTTP todavía, solo unit/integration de mapper"). El único harness real disponible en WU1 es el suite de integración de Prisma contra Postgres real, que corrió DENTRO del comando anterior (57 test files incluye `*.integration.spec.ts` y `*.e2e.spec.ts` de `clientes`, todos verdes) |
| Rollback boundary | Revert de este batch: `git revert` sobre los 4 commits de WU1 deja el árbol limpio — cero consumidor HTTP referencia las 3 columnas de logo todavía (WU2 es quien las consume). La migración de reversa (`rollback.sql`) es el único paso que el revert de Git no cubre por sí solo — hay que correrla aparte contra Postgres, documentado en su propio encabezado |

## Desviación de diseño: migración aplicada sin `prisma migrate dev`

**Bloqueo ambiental descubierto, no causado por este batch.** `soporte_master` y
`soporte_master_test` tienen una migración `20260805194710_init_tenant` en
estado FAILED desde el 2026-08-24 (repetida el 2026-09-11): alguien corrió,
en algún momento anterior a este ciclo, la migración de INIT del schema
TENANT contra el datasource MASTER. Evidencia:

```
docker exec soporte-postgres-master psql -U soporte -d soporte_master \
  -c "SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20260805194710_init_tenant';"
# 2 filas, finished_at NULL en ambas — logs: "relation \"tipos_componente\" already exists" / "relation \"estados\" already exists" (42P07)
```

Esto deja `prisma migrate dev` y `prisma migrate deploy` bloqueados con
`P3009` contra AMBAS bases (`soporte_master` y `soporte_master_test`),
independientemente de la migración de este cambio.

**Qué se hizo en su lugar:**
1. Se escribió `migration.sql` y `rollback.sql` a mano en
   `prisma_master/migrations/20260921120000_add_cliente_logo/`, siguiendo el
   formato exacto de migraciones previas (`add_cliente_smtp_config`,
   `add_cliente_csat_habilitado`).
2. Se aplicó el `ALTER TABLE` directamente vía `psql` contra `soporte_master`
   Y `soporte_master_test` (columnas confirmadas con `\d clientes` en ambas).
3. Se corrió `pnpm generate:master` (no requiere conexión a DB) para
   regenerar el cliente Prisma con los 3 campos nuevos.
4. **No se tocó** la fila `20260805194710_init_tenant` de `_prisma_migrations`
   ni ningún otro estado de migración preexistente — es una corrupción de
   historial ajena a este ciclo y su arreglo no es parte de WU1.

**Consecuencia para quien continúe el ciclo o despliegue:** un futuro
`prisma migrate deploy` seguirá bloqueado por `P3009` hasta que alguien
resuelva `20260805194710_init_tenant` (candidato: `prisma migrate resolve
--rolled-back 20260805194710_init_tenant` contra ambas bases, después de
confirmar que ninguna tabla tenant relevante depende de que quede
"aplicada"). Ese arreglo es explícitamente fuera de alcance de WU1 y se
reporta acá para que no se pierda.

## Deviations from Design

Ninguna deviation de diseño en el código. La única desviación es de
**mecanismo** (cómo se aplicó la migración), documentada arriba — el
resultado final (3 columnas nullable, sin default, sin CHECK, en `clientes`)
es exactamente el especificado en `design.md`.

## Issues Found (WU1)

Ninguno más allá del bloqueo ambiental documentado arriba.

## Completed Tasks — WU2

- [x] 2.1 [RED] Test en `validar-logo-cliente.spec.ts`: acepta `image/png`, `image/jpeg`, `image/webp` hasta 512 KB; rechaza `image/svg+xml` con 422 aunque empiece con `image/`; rechaza >512 KB y 0 bytes con 422.
- [x] 2.2 [GREEN] `validar-logo-cliente.ts` HERMANO de `validar-archivo-adjunto.ts` (nunca reuso): `MIMES_LOGO` como `Set` exacto de 3 valores, `MAX_LOGO_BYTES = 512 * 1024`.
- [x] 2.3 [RED] Tests de los 3 use cases con mocks de `IFileStorage`/`IClienteRepository`: key nueva (UUID), persistencia, delete best-effort de la key anterior, fallo de delete no rompe la operación.
- [x] 2.4 [GREEN] `ConfigurarLogoCliente`, `QuitarLogoCliente`, `VerLogoCliente` en `application/use-cases/`, con `Result<T, DomainError>`. Nuevo error de dominio `LogoClienteNoEncontradoError` (distinto de `ClienteNoEncontradoError`, ambos → 404).
- [x] 2.5 [RED] Test de `cliente-logo.controller.spec.ts`: instancia el controller directo (sin bootstrap de Nest, mismo criterio que `ciclos.controller.spec.ts`) — cubre el chequeo inline del `GET` (cross-tenant 403, propio 200, ROOT 200) y el mapeo de errores a 404/204.
- [x] 2.6 [GREEN] `ClienteLogoController` NUEVO en `interface/controllers/`, SEPARADO de `ClientesController` (design D1/H1). `POST`/`DELETE`: `JwtAuthGuard + GlobalAdminGuard`. `GET`: solo `JwtAuthGuard` + chequeo inline `is_global_admin || cliente_id === :id` — nunca `TenantGuard`.
- [x] 2.7 [GREEN] `GET` responde con `Content-Type` almacenado, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, molde `@Res({ passthrough: true })` de `equipos.controller.ts`/`tickets.controller.ts`.
- [x] 2.8 Wiring en `clientes.module.ts` (`FILE_STORAGE` inyectado desde `SharedModule`, ya `@Global()`); `pnpm typecheck`, `pnpm lint`, `pnpm test` en backend verdes.

## TDD Cycle Evidence (WU2)

| Tarea | RED — comando y resultado observado | GREEN — comando y resultado observado |
|---|---|---|
| 2.1/2.2 `validarLogoCliente` | `pnpm vitest run src/clientes/interface/pipes/validar-logo-cliente.spec.ts` → `Cannot find module './validar-logo-cliente'` (1 suite fallida, 0 tests) | mismo comando → 8/8 tests verdes |
| 2.3/2.4 `ConfigurarLogoCliente`/`QuitarLogoCliente`/`VerLogoCliente` | `pnpm vitest run src/clientes/application/use-cases/{configurar,quitar,ver}-logo-cliente.use-case.spec.ts` → 3 suites fallidas, `Cannot find module` en cada una (0 tests) | mismo comando → 13/13 tests verdes (5 + 4 + 4) |
| 2.5/2.6/2.7 `ClienteLogoController` | `pnpm vitest run src/clientes/interface/controllers/cliente-logo.controller.spec.ts` → `Cannot find module './cliente-logo.controller'` (1 suite fallida, 0 tests) | mismo comando → 10/10 tests verdes |

## Work Unit Evidence (WU2)

| Evidencia | Valor |
|---|---|
| Comando de test focalizado y resultado exacto | `pnpm vitest run backend/src/clientes/interface backend/src/clientes/application` (desde `backend/`: `pnpm vitest run src/clientes/interface src/clientes/application`) → verde; la corrida completa `pnpm vitest run src/clientes` → **42 test files passed, 279 tests passed** (incluye el `[e2e-forced-failure]` intencional de `crear-cliente.e2e.spec.ts`, ver Known environmental failures del prompt) |
| Harness de runtime / escenario y resultado exacto | `pnpm start:dev` contra Postgres real (`soporte-postgres-master`, contenedor `Up`): la app bootea sin errores y el log mapea las 3 rutas nuevas — `Mapped {/api/clientes/:id/logo, POST}`, `DELETE` y `GET`. `curl` manual sin token a las tres → **401** en las tres (JwtAuthGuard real, sin mockear). **No se completó el round-trip autenticado** (login ROOT → subir → leer → borrar): el único usuario `is_global_admin=true` en `soporte_master` es la cuenta real del dueño del repo (`npelizzari@gmail.com`) y no hay credencial de prueba disponible para generar un JWT válido sin conocer esa contraseña — intentarlo habría significado adivinar una clave real, fuera de alcance. La autorización cross-tenant/ROOT/ADMINISTRADOR queda cubierta por las 13 aserciones de `cliente-logo.controller.spec.ts` (2.5) en su lugar |
| Rollback boundary | Revert de este batch: `git revert` sobre los 4 commits de WU2 (pipe; use cases + error de dominio; controller; wiring del módulo) deja el árbol en el estado de fin de WU1 — ninguna ruta HTTP nueva, `ClientesController` sin tocar (los 10 métodos de ABM conservan su `@UseGuards` de clase intacto) |

## Deviations from Design (WU2)

Ninguna. El corte de contenido de WU2 (controller nuevo en vez de extender
`ClientesController`, whitelist exacta hermana del pipe de adjuntos) es
exactamente el que `design.md` D1/D7 y `tasks.md` prescriben.

## Issues Found (WU2)

Ninguno de código. La única limitación es la cobertura del runtime harness
descrita arriba (round-trip autenticado no ejecutado por falta de
credencial ROOT de prueba) — el flujo HTTP completo con autenticación real
queda para que `sdd-verify` lo confirme con sus propios medios, o para un
seed de usuario ROOT de test si el dueño del repo lo autoriza.

## Completed Tasks — WU3

- [x] 3.1 [RED] Test en `resolver-scope.spec.ts`: `ScopeResuelto` incluye `clienteLogoVersion` (epoch ms de `logoUpdatedAt`, `null` sin logo), sin queries nuevas.
- [x] 3.2 [GREEN] `clienteLogoVersion` agregado a `ScopeResuelto` en `resolver-scope.ts`, leído del `cliente` ya resuelto por `clienteRepo.findById` (cero queries nuevas).
- [x] 3.3 [GREEN] `cliente_logo_v: number | null` agregado a `JwtPayload` (`i-token.service.ts`) SIN bumpear `VERSION_PAYLOAD_JWT` (queda en 2); propagado desde `LoginUseCase`, `SwitchTenantUseCase` y `RefreshTokenUseCase`. `payloadDeTest()` actualizado.
- [x] 3.4 [RED] Test en `route.test.ts`: una respuesta binaria (PNG, con bytes deliberadamente inválidos como UTF-8) atraviesa el proxy BFF byte a byte.
- [x] 3.5 [GREEN] `route.ts`: `arrayBuffer()` en vez de `text()` para respuestas no-JSON; reenvía `x-content-type-options` y `cache-control`. Suite completa del proxy revisada (9/9 verde, incluida la aserción preexistente de descarga CSV — sin ajustes necesarios: `res.text()` sobre un `NextResponse` construido con `ArrayBuffer` decodifica igual).
- [x] 3.6 [RED] Test en `app-sidebar.test.tsx`: con `cliente_logo_v` renderiza `<img src="/api/clientes/{id}/logo?v=...">`; sin el campo, con error de carga (`fireEvent.error`), o con sesión MASTER cae a `Building2` sin imagen rota ni hueco de layout; cambiar de cliente (rerender) actualiza el `src` sin recargar.
- [x] 3.7 [GREEN] `cliente_logo_v` espejado en `types.ts` (`JwtPayload` + normalización defensiva a `null` en `decodeJwtPayload`). Test dedicado nuevo: `types.test.ts`.
- [x] 3.8 [GREEN] Bloque de marca nuevo (`SidebarBrand`) en `app-sidebar.tsx`, entre el botón de colapsar y el bloque de identidad: contenedor cuadrado fijo `h-9 w-9` con `object-contain`, mismo tamaño colapsado/expandido (igual que el círculo de iniciales), fallback `Building2` con `data-testid="sidebar-brand-fallback"`.
- [x] 3.9 `pnpm typecheck`, `pnpm lint`, `pnpm test` verdes en frontend Y backend (ver Work Unit Evidence). Aislamiento 403/401 confirmado — ver nota de alcance abajo.

## TDD Cycle Evidence (WU3)

Tareas 3.1/3.4/3.6 llevan `[RED]` explícito en `tasks.md`; 3.3 y 3.7 NO
(marcadas `[GREEN]` sin contraparte `[RED]` en el propio `tasks.md`) — se
agregaron tests de todos modos, escritos después de la implementación,
consistente con lo que el artefacto pide.

| Tarea | RED — comando y resultado observado | GREEN — comando y resultado observado |
|---|---|---|
| 3.1/3.2 `clienteLogoVersion` | `pnpm vitest run src/auth/application/use-cases/resolver-scope.spec.ts` → 9 tests fallan: `expected undefined to be <epoch>/null` | mismo comando → 20/20 tests verdes |
| 3.4/3.5 proxy binario | `pnpm vitest run "src/app/api/[...path]/route.test.ts"` → 1 test falla: `expected null to be 'nosniff'` (headers no reenviados; ni se llegaba a comparar bytes) | mismo comando → 9/9 tests verdes, incluida la descarga CSV preexistente |
| 3.6/3.8 bloque de marca | `pnpm vitest run src/components/shell/app-sidebar.test.tsx` → 6 tests nuevos fallan: `<img>`/`data-testid="sidebar-brand-fallback"` no existían | mismo comando → 18/18 tests verdes |

## Work Unit Evidence (WU3)

| Evidencia | Valor |
|---|---|
| Comando de test focalizado y resultado exacto | `pnpm vitest run backend/src/auth frontend/src/components/shell frontend/src/app/api` (desde cada paquete) → backend `src/auth`: **46 test files passed, 659 tests passed**; frontend `src/components/shell/app-sidebar.test.tsx`: **18/18**; frontend `src/app/api/[...path]/route.test.ts`: **9/9**; frontend `src/shared/api/types.test.ts` (nuevo): **3/3** |
| Harness de runtime / escenario y resultado exacto | Login manual en navegador NO se ejecutó (sin credencial ROOT de prueba disponible, mismo bloqueo que WU2). En su lugar: (a) suite COMPLETA del backend contra Postgres real — `pnpm test` en `backend/` → **437 test files passed, 5189 tests passed** (incluye `prisma-auth.integration.spec.ts`, `prisma-auth-repos.integration.spec.ts` y los e2e de `clientes`/`sectores`, todos contra `soporte-postgres-master`); (b) suite COMPLETA del frontend — `pnpm test` en `frontend/` → **189 test files passed, 1426 tests passed**. El aislamiento 403/401 en sí NO cambió en WU3 (`resolverScope`/`JwtAuthGuard`/`GlobalAdminGuard` no se tocaron — WU3 solo agrega un campo derivado de datos YA autorizados); su cobertura de regresión es la de WU1/WU2 (`cliente-logo.controller.spec.ts`, 10/10) más la re-confirmación de que sigue en verde contra Postgres real |
| Rollback boundary | Revert de este batch: `git revert` sobre los 4 commits de WU3 (`resolverScope`; propagación JWT; proxy binario; sidebar) deja el árbol en el estado de fin de WU2 — `cliente_logo_v` desaparece del JWT y del sidebar, `ClienteLogoController` (WU2) sigue intacto y sirviendo el binario igual, solo que el proxy vuelve a corromperlo (regresión pre-existente, no introducida por el revert) |

## Deviations from Design (WU3)

1. **`cliente_logo_v` queda `?:` (opcional) en el `JwtPayload` del
   frontend, NO requerido como en el backend.** `design.md`/`tasks.md`
   (3.7) piden "mismo criterio que `modulos`/`nombre`" — esos DOS campos
   son requeridos en la interfaz. Verificado antes de implementar: el
   frontend tiene ~15-20 archivos con fixtures de `JwtPayload` construidos
   a mano (`rg -l "is_global_admin:" frontend/src` → 36 archivos en
   total, ~15 con el objeto completo), SIN una factory única como
   `payloadDeTest()` del backend. Forzar el campo a requerido rompía el
   typecheck de fixtures de features que no tienen nada que ver con el
   logo (tickets, kb, ciclos, etc.) — muy por fuera del alcance de WU3 y
   del presupuesto de revisión. Se declaró opcional; el comportamiento
   (normalización a `null` en `decodeJwtPayload`, mismo `?? null` que
   `modulos`/`nombre`) es idéntico. Documentado con el razonamiento
   completo en el JSDoc de `JwtPayload` en `types.ts`.
2. **Arrastre mecánico de compilación fuera de `auth/`.** Agregar
   `cliente_logo_v: number | null` (requerido) al `JwtPayload` del
   backend rompió el typecheck de dos specs de OTROS módulos que
   construyen el payload a mano en vez de usar `payloadDeTest()`:
   `cliente-logo.controller.spec.ts` (WU2) y
   `movimientos-insumo.controller.spec.ts` (preexistente, ajeno a este
   ciclo). Se les agregó `cliente_logo_v: null` — una línea cada uno,
   sin tocar su lógica de test.
3. **Ningún ajuste de aserciones fue necesario en el proxy pese a la
   advertencia del prompt.** El cambio de `text()` a `arrayBuffer()`
   pasa igual la suite completa de `route.test.ts` (9/9, incluida la
   descarga CSV) sin modificar ninguna aserción existente: `res.text()`
   sobre un `NextResponse` construido con un `ArrayBuffer` de bytes ASCII
   decodifica igual que antes. Se revisó explícitamente (no se asumió) y
   no hizo falta tocar ninguna aserción preexistente.

## Issues Found (WU3)

Ninguno de código. Mismo bloqueo ambiental que WU2 (sin credencial ROOT de
test para un round-trip autenticado end-to-end) — no se repite la
investigación, ver Issues Found de WU2 arriba.

## Remaining Tasks

- [ ] WU4: Diálogo de carga

## Workload / PR Boundary

- Mode: chained PR slice (`stacked-to-main`)
- Current work unit: WU3 — Propagación y sidebar
- Boundary: empieza en `feat/logo-por-cliente-propagacion` (desde
  `feat/logo-por-cliente-endpoints`, WU2 ya verificada), termina con
  `cliente_logo_v` viajando en el JWT desde login/switch/refresh, el
  proxy BFF pasando binarios sin corromperlos, y el sidebar mostrando el
  logo con fallback a `Building2`. WU4 agrega el diálogo de carga en
  `Admin > Clientes`.
- Estimated review budget impact: `tasks.md` estimó ~330 líneas para
  WU3; el diff real (código + tests) es **411 líneas cambiadas**
  (396 inserciones + 15 eliminaciones, `git diff --numstat` contra la
  base de WU2), **11 líneas por encima del presupuesto de 400** si se
  revisa como un único PR. Repartido en los 4 commits de
  work-unit-commits ya creados, cada uno individualmente bien por debajo
  de 400 (90 / 78 / 53 / 190 líneas cambiadas respectivamente) — la
  sobre-estimación vino de los dos puntos sensibles marcados como
  "trabajo real" en el prompt de lanzamiento (arreglo del proxy con su
  propio test de round-trip binario, y el bloque de marca nuevo con su
  cobertura de 6 escenarios) más 6 tests de propagación agregados en
  `auth/` que no estaban explícitamente desglosados en `tasks.md`.
  Recomendación: `size:exception` para el PR de WU3 si se revisa de
  punta a punta, o revisar por los 4 commits naturales si se prefiere
  mantener cada revisión bajo 200 líneas.

## Status

9/9 tareas de WU1 + 8/8 tareas de WU2 + 9/9 tareas de WU3 completas
(26/34 del ciclo). Ready for next batch (WU4) — no ready for verify
todavía, porque el ciclo completo (WU1-WU4) sigue en curso.

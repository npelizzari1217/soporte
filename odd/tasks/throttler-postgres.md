# Límites de pedidos en Postgres (2026-10-15)

## Objetivo
Que los cuatro limitadores de pedidos del backend cuenten en una tabla de la base master en vez de
en la memoria del proceso. Salda la fila "El límite de pedidos de la API v1 se cuenta en la
memoria del proceso" de "Deuda técnica conocida" (`docs/roadmap-comercial.md`).

## Problema y porqué
Los cuatro usan el `ThrottlerStorageService` en memoria de `@nestjs/throttler` 6.5.0:

| Limitador | Guard | Dónde se provee el storage |
|---|---|---|
| API v1 | `src/integraciones/infrastructure/api-v1-throttler.guard.ts` | `src/integraciones/api-v1.module.ts:41-47` |
| CSAT | `src/csat/infrastructure/guards/csat-throttler.guard.ts` | `src/csat/csat.module.ts:85` (`ThrottlerModule.forRoot`) |
| Recuperación de contraseña | `src/auth/infrastructure/guards/recuperacion-password-throttler.guard.ts` | `src/auth/recuperacion-password.module.ts:118-120` |
| Formulario público / QR | `src/publico/infrastructure/guards/pedido-publico-throttler.guard.ts` | `src/publico/formulario-publico.module.ts:108-130` |

- Con más de un proceso, cada uno cuenta por su lado y el límite real se multiplica.
- Además, hoy los contadores **se reinician con cada reinicio o deploy** del backend.
- El repo ya tiene el molde: `src/auth/infrastructure/tfa/prisma-limitador-intentos.ts` (2FA/SSO)
  cuenta en la tabla master `auth_intentos_fallidos` con un solo
  `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` y purga cada hora.

## Decisión del dueño (2026-10-15)
- Los **cuatro** limitadores pasan a Postgres, no solo el de la API v1.
- Si la base no responde, el limitador **deja pasar** el pedido y lo registra en el log
  (fail-open): con la base caída el resto del sistema tampoco funciona.

## Alcance
- Una tabla nueva en master (no se reusa `auth_intentos_fallidos`: otra ventana y otro sentido),
  con su migración y su `rollback.sql` re-ejecutable.
- Un `ThrottlerStorage` de Postgres, en infraestructura, con la misma semántica que el de memoria.
- Los cuatro módulos lo usan. Límites, claves y rutas no cambian.
- Fuera de alcance: el lock en memoria del barrido de webhooks (`odd/tasks/webhooks.md:118`), que
  es otro supuesto de proceso único.

## Criterios de aceptación
- CA1: el storage de Postgres respeta el contrato de `ThrottlerStorage.increment` de 6.5.0
  (`totalHits`, `timeToExpire`, `isBlocked`, `timeToBlockExpire`, en las mismas unidades) y da los
  mismos resultados que `ThrottlerStorageService` para una misma secuencia de llamadas, ventana
  vencida y bloqueo incluidos.
- CA2: dos instancias del storage (como dos procesos) comparten la cuenta de una misma clave.
- CA3: si la consulta falla, `increment` deja pasar (cuenta 0 y sin bloqueo) y loguea un error sin
  la clave en claro.
- CA4: las filas vencidas se purgan, sin bloquear el pedido si la purga falla.
- CA5: los cuatro módulos proveen el storage de Postgres. Los e2e de límites siguen verdes (API v1
  60/min por clave y cupo compartido entre rutas; CSAT; recuperación; formulario público), sin
  depender de que el storage sea de memoria.
- CA6: la migración es aditiva y su `rollback.sql` se puede correr dos veces.

## Tareas
- [x] **T1 — Tabla y storage de Postgres** (CA1-CA4, CA6). Migración master + `rollback.sql`,
  modelo Prisma, `PostgresThrottlerStorage` con sus tests contra la base.
  - Archivos: `backend/prisma_master/migrations/20261015120000_throttler_contadores/{migration,rollback}.sql`,
    `backend/prisma_master/schema.prisma` (modelo `ThrottlerContador`),
    `backend/src/shared/infrastructure/throttler/postgres-throttler-storage.ts` y sus tres specs
    (`.spec.ts`, `.integration.spec.ts`, `rollback-throttler-contadores.integration.spec.ts`).
  - Semántica de 6.5.0 leída del fuente instalado: `ttl` y `blockDuration` en ms; `timeToExpire` y
    `timeToBlockExpire` en segundos con `Math.ceil`; la cuenta es una **ventana deslizante por
    pedido** (cada pedido deja de contar `ttl` ms después, por `setTimeout`), no una ventana fija;
    mientras está bloqueado no cuenta; al vencer el bloqueo reinicia con un pedido. Por eso la
    tabla guarda `vencimientos timestamptz[]` (a lo sumo `limit + 1` elementos) en vez de un
    contador entero. Todo el `increment` es un `INSERT ... ON CONFLICT DO UPDATE` con el reloj de
    la app como parámetro.
  - Diferencias deliberadas con memoria: la fila es por `throttlerName:key`, y no se copia el bug de
    6.5.0 en el que el reinicio de un bloqueo cancela los vencimientos pendientes de las otras keys
    del mismo throttler.
  - Fail-open (CA3): devuelve `{ totalHits: 0, timeToExpire: 0, isBlocked: false,
    timeToBlockExpire: 0 }` y loguea `THROTTLER_ERROR | throttler=… | clave=<12 hex del sha256> | …`.
  - Deriva Prisma ↔ DDL: no hay un test automático en el repo; se verificó con
    `prisma migrate diff --from-config-datasource --to-schema` contra `soporte_master_test` ya
    migrada: cero líneas sobre `throttler_contadores`.
  - Evidencia: `pnpm vitest run src/shared/infrastructure/throttler/` → 3 archivos, 10 tests
    verdes. Mutaciones (borde `h > ahora` → `>=`; reinicio sin pedido) rompen el test de contrato.
  - Commit: `094ed235`.
- [x] **T2 — API v1 usa el storage** (CA5, parte v1).
  - Archivos: `backend/src/integraciones/api-v1.module.ts` (provider `THROTTLER_STORAGE_POSTGRES`),
    `api-v1.module.spec.ts` (fija que el storage es el de Postgres), comentario del guard, y
    `backend/test/barrido-huerfanas.global-setup.mjs`: vacía `throttler_contadores` una vez por
    corrida, junto con `auth_intentos_fallidos`.
  - Evidencia: `pnpm vitest run` de `test/integraciones-api-v1-{auth,catalogos,tickets}.e2e.spec.ts`,
    `test/integraciones-webhooks-encolado.e2e.spec.ts` y `api-v1.module.spec.ts`, dos veces
    seguidas → 5 archivos, 32 tests verdes las dos veces; la tabla quedó con filas (el storage se
    usa de verdad). Las keys de v1 son ids de clave nuevos en cada corrida.
- [ ] **T3 — CSAT, recuperación y formulario público usan el storage** (CA5, resto).
- [ ] **T4 — Cierre**: fila de la deuda RESUELTA en el roadmap, nota de migración y rollback en
  `DEPLOY-VPS-runbook.md`, compuertas del backend (`pnpm lint`, `pnpm typecheck`, `pnpm test`).

## Precondición de deploy
Trae una migración de master: `predeploy-dump.ps1` como siempre. Es aditiva, así que el código
anterior funciona con la tabla creada.

## Ruta y entrega
- Delegada: un escritor (más de dos archivos no triviales).
- RDD apagada. TDD no exigido (§6.1: es feature), pero cada tarea lleva sus tests.
- Previsión: ~500 líneas, por encima de la heurística de 400. Con GitHub en pausa no hay PR: la
  entrega es un commit por tarea en `feat/throttler-postgres` y merge local.

## Progreso
- 2026-10-15: exploración hecha, decisión del dueño registrada, documento creado.
- 2026-10-15: T1 hecha (ruta delegada, escritor único).
- 2026-10-15: T2 hecha.

## Próximo paso
T1.

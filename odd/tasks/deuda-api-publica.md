# Deuda técnica de la API pública (JD-4 a JD-7)

## Objetivo
Saldar cuatro hallazgos del `judgment-day` de la API pública (etapa 1, 2026-10-11) que quedaron como deuda técnica en el roadmap.

## Problema
`docs/roadmap-comercial.md`, tabla de deuda técnica (filas de JD-4 a JD-7):
- **JD-5:** `ClienteMapper.toPersistence` escribe `apiHabilitada` en cada guardado. Un caso de uso de clientes que leyó la entidad antes de que ROOT deshabilitara la API y guarda después vuelve a dejarla en `true`, y las claves vuelven a funcionar.
- **JD-4:** el solicitante de los tickets creados por la API es el usuario de integración (`integracion+<id>@integraciones.invalid`). `prisma-usuario-contacto-resolver.ts` no filtra `esIntegracion`, así que cada evento intenta un envío SMTP a una dirección inexistente.
- **JD-7:** `ConfigurarApiClienteUseCase` busca y crea el usuario de integración sin transacción. Dos habilitaciones simultáneas chocan con el email único y dan un 500.
- **JD-6:** `ApiV1Module` registra un segundo `ThrottlerModule` global (`forRootAsync`), contra la convención de `recuperacion-password-throttler.guard.ts:15-21`.

## Por qué
JD-5 tiene impacto de seguridad. JD-4 ensucia el SMTP de cada cliente. JD-7 y JD-6 son robustez. El dueño eligió estos cuatro el 2026-10-11.

## Fuera de alcance (decisión del dueño, 2026-10-11)
- El throttler en memoria por proceso: su disparador es escalar a más de un proceso, y hoy hay uno solo.
- El rollback de `api_publica`, que no se puede re-correr después de una corrida completa.

## Restricciones
- Son bugfixes: TDD obligatorio (RED observado, GREEN, REFACTOR), con la evidencia registrada acá (`~/proyectos/CLAUDE.md` §6.1).
- Un commit por hallazgo en `fix/deuda-api-publica`, con tests y docs juntos, Conventional Commits, sin atribución de IA.
- Al cerrar cada hallazgo, su fila de deuda en el roadmap queda tachada y marcada RESUELTA con el sha.
- Hexagonal: Prisma solo en `infrastructure/`.
- La Ayuda está en pausa; anotar deuda solo si un cambio la vuelve falsa.

## Tareas
- [x] **T1 — JD-5:** `apiHabilitada` se escribe solo desde `ConfigurarApiClienteUseCase`; el upsert general del mapper la omite. Criterio: un guardado de cliente con la entidad leída antes de deshabilitar NO vuelve a habilitar la API (test de integración contra la base). Ruta: delegada.
  - Diseño: puerto satélite `IApiHabilitadaRepository` (`integraciones/domain/api-habilitada-repository.port.ts`) con un UPDATE dirigido, en vez de un método nuevo en `IClienteRepository`: agregarlo obligaba a tocar ~25 mocks de specs, varios fuera del módulo (csat, publico, auth). Mismo criterio que `IClienteEmailConfigRepository`. Un cliente nuevo nace con el default de la columna (`false`).
  - RED: `configurar-api-cliente.integration.spec.ts` › "JD-5: un save() con la entidad leida antes de deshabilitar no vuelve a habilitar la API" — `AssertionError: expected true to be false` en `expect(await apiHabilitada(id)).toBe(false)` después del `save()` viejo.
  - GREEN: el mismo spec pasa (1/1). `pnpm vitest run src/clientes src/integraciones`: 66 archivos, 485 tests verdes; e2e `integraciones-api-cliente` + `integraciones-claves`: 14/14. `pnpm lint` y `pnpm typecheck`: 0 errores.
  - Commit: ver T2 (se registra al inicio del commit siguiente).
- [ ] **T2 — JD-4:** el resolvedor de contactos de notificaciones excluye a los usuarios de integración. Criterio: un ticket cuyo solicitante es el usuario de integración no produce destinatario `.invalid`. Ruta: delegada.
- [ ] **T3 — JD-7:** dos habilitaciones simultáneas no dan 500. Criterio: dos `execute` concurrentes del caso de uso terminan bien y dejan un solo usuario de integración. Ruta: delegada.
- [ ] **T4 — JD-6:** `ApiV1Module` provee sus opciones y su almacenamiento localmente, sin un `ThrottlerModule` global, como `formulario-publico.module.ts`. Criterio: los e2e del límite v1 (60/min por clave, un solo cupo por clave) siguen verdes, y uno nuevo prueba que el límite de v1 no altera el de recuperación de contraseña. Ruta: delegada.

## Verificación
- Por tarea: el spec nuevo en RED antes del cambio y en GREEN después; `pnpm lint`, `pnpm typecheck` y los specs del módulo afectado.
- Al cierre: la suite completa del backend y `node scripts/check-roadmap-fresco.mjs`.

## Ruta
Delegada: un writer por tarea, que implica 2 o más archivos no triviales (código, spec y fila del roadmap).

## Progreso
- 2026-10-11: documento creado; rama `fix/deuda-api-publica` desde `main` `23b31110`.
- 2026-10-11: T1 (JD-5) cerrada.

## Próximo paso
T2 (JD-4).

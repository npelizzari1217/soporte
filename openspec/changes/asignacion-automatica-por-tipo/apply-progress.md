# Apply progress: asignacion-automatica-por-tipo

## WU-1 — Migración M1, puerto, repo y evaluador (rama `feat/asignacion-automatica-por-tipo-wu01`)

Estado: completa (tareas 1.1 a 1.8).

- 1.1 / 1.2: migración `20261009120000_reglas_asignacion` (`migration.sql` + `rollback.sql`), modelo `ReglaAsignacion` y back-relation en `TipoTicket`; cliente tenant regenerado.
- 1.3 / 1.5: puerto `IReglaAsignacionRepository` (+ token `REGLA_ASIGNACION_REPOSITORY`) y `PrismaReglaAsignacionRepository`.
- 1.4: integración `prisma-regla-asignacion.repository.integration.spec.ts` (tenant efímero, 8 casos incluido el rollback).
- 1.6 / 1.7: `elegibilidad-responsable-regla.ts` (+ spec) y JSDoc ampliado de `listarTecnicosAsignables`.
- 1.8: M1 aplicada a `soporte_tenant_test` (`prisma migrate status` limpio); lint, typecheck, specs de la WU y ratchet de casts en verde (617, sin subir).

Desvíos del diseño: ninguno. `evaluarResponsableRegla` recibe `Pick<IUsuarioMasterChecker, 'listarTecnicosAsignables'>` en vez del checker completo (mocks completos sin casts).

## WU-2a — Constantes, evento, resolver y `operacionesDeApertura` (rama `feat/asignacion-automatica-por-tipo-wu02`)

Estado: completa (tareas 2.1 a 2.5). WU-2 se parte en la costura pactada: 2a (esta) y 2b (`CrearTicketUseCase`, cableado, integración; rama `...-wu02b`).

- 2.2: `AUTOR_SISTEMA`, `DESCRIPCION_ASIGNACION_POR_REGLA`, `ORIGEN_ASIGNACION` y `TicketAsignadoEvent`.
- 2.1 / 2.3: `ResolverAsignacionAutomatica` (el tenant propaga, el maestro degrada a `null` con log enmascarado) y su spec con la mutación documentada.
- 2.4 / 2.5: `operacionesDeApertura` y su spec (búsqueda por tipo de operación).

Desvíos: el resolver loguea `REGLA_ROTA` con `logger.log` y `DEGRADADA` con `logger.error` (el puerto `ILogger` solo tiene esos dos niveles). El spec no repite el caso "tipo inactivo": `desactivar()` ya cubre baja e inactivo a la vez.

## WU-2b — `CrearTicketUseCase` y cableado (rama `feat/asignacion-automatica-por-tipo-wu02b`)

Estado: completa (tareas 2.6 y 2.7). Segunda partición de WU-2: el diff total de 2b con las integraciones pasaba de 490 líneas, así que las integraciones 2.8 y 2.9 van en 2c (`...-wu02c`), sobre esta rama.

- 2.7: `CrearTicketUseCase` recibe `ResolverAsignacionAutomatica` (12.º parámetro, tras el resolver de ciclo), resuelve en la fase de lectura, `assignTo` antes del primer `save`, `operacionesDeApertura` y `ticket.asignado` por `alCommitear` después de `ticket.creado`. `TicketsModule` registra `REGLA_ASIGNACION_REPOSITORY` y el resolver (`useFactory`) y exporta ambos. El archivo no tenía comentarios de "nunca auto-asigna".
- 2.6: specs del caso de uso (con regla, sin regla, regla rota, cola de `alCommitear`, rechazo del tenant). Las otras dos construcciones del caso de uso (`mantenimiento` y `generar-preventivos` integration) reciben el resolver nulo.

## WU-2c — Integraciones del alta con regla y del preventivo (rama `feat/asignacion-automatica-por-tipo-wu02c`)

Estado: completa (tareas 2.8, 2.9 y 2.10). WU-2 queda cerrada en tres ramas encadenadas: 2a, 2b, 2c.

- 2.8: `crear-ticket.asignacion-automatica.integration.spec.ts` (tenant efímero): con regla nace ASIGNADO con apertura null→ASIGNADO y ASIGNACION de `AUTOR_SISTEMA`; sin regla idéntico a hoy; el `save` de la ASIGNACION forzado a fallar deja cero tickets y cero eventos (atomicidad). `CrearTicketUseCase` no tiene satélite, así que la falla se fuerza en el repo de operaciones.
- 2.9: tres casos en `generar-preventivos.integration.spec.ts` (regla aplicada dentro de la tx del plan; fallo del maestro no aborta el plan; `marcarGenerado` forzado a fallar → ROLLBACK y ningún `ticket.asignado`) y el caso de SLA (A9) en la integración nueva. El barrido procesa todos los planes vencidos del tenant: los eventos se filtran por `ticketId` y el fallo forzado es permanente en la corrida.
- 2.10: lint, typecheck, `pnpm test` completo y ratchet de casts en verde (617/114).

Desvíos de WU-2: la partición pactada era 2a/2b; 2b con las integraciones daba ~490 líneas, así que las integraciones pasaron a una tercera rama (2c). `orden-de-arranque.spec.ts` falla en este worktree por falta de `backend/.env` (`DATABASE_URL_MASTER`, `APP_BASE_URL`), no por el cambio.

## WU-3a — Soporte, formulario público y Edilicia: casos de uso y cableado (rama `feat/asignacion-automatica-por-tipo-wu03`)

Estado: parcial (tareas 3.1 y 3.2 hechas; 3.3 y 3.4 pendientes). WU-3 se parte para respetar el tope de 400 líneas: 3a (esta) lleva el código con sus tests unit; 3b llevará los casos con regla por canal contra Postgres (3.3) y la verificación final (3.4).

- 3.2: `CrearTicketSoporteUseCase` y `CrearTicketEdilicioUseCase` reciben `ResolverAsignacionAutomatica` (parámetro tras el resolver de ciclo), resuelven antes de abrir la transacción, `assignTo` antes del primer `save`, `operacionesDeApertura` y `ticket.asignado` por `alCommitear` tras `ticket.creado`. `equipos.module.ts` y `reparaciones.module.ts` lo inyectan desde `TicketsModule` (sin reconstruirlo). El formulario público no tiene use case propio: usa `CrearTicketSoporteUseCase`, así que queda cubierto. Los archivos no tenían comentarios de "nunca auto-asigna".
- 3.1: casos con y sin regla, regla rota (resolver nulo), cola de `alCommitear`, rechazo del tenant, y en Soporte la apertura con `AUTOR_FORMULARIO_PUBLICO` frente a la `ASIGNACION` de `AUTOR_SISTEMA`. Las tres construcciones de integración existentes reciben el resolver nulo.
- Verificado: los e2e existentes `reparaciones.e2e` y `pedido-publico-confirmar.e2e` levantan la app real (el cableado de DI resuelve).

## WU-3b — Integración por canal y verificación final (misma rama `...-wu03`, commit nuevo)

Estado: completa (tareas 3.3 y 3.4). WU-3 queda cerrada.

- 3.3: `asignacion-automatica.canales.integration.spec.ts` (tenant efímero, 5 casos): Soporte, formulario público (apertura `AUTOR_FORMULARIO_PUBLICO`, `ASIGNACION` de `AUTOR_SISTEMA`) y Edilicia nacen ASIGNADO con la regla; ROLLBACK de Soporte (cero ticket, cero operaciones nuevas, cero eventos); y `POST /tickets` con el responsable fuera de `listarTecnicosAsignables` (membresía dada de baja) → alta ok, NUEVO, sin asignado, una sola operación.
- Desvío: el 3.3 pedía e2e HTTP. Se probó a nivel de caso de uso sobre Postgres real (mismo cableado que los módulos); el DI real ya lo ejercitan `reparaciones.e2e` y `pedido-publico-confirmar.e2e`. Master es un doble (no se trunca master, sin `usarLockMasterTest()`).
- 3.4: verificación en el reporte del apply. **Deuda de Ayuda para el cuerpo del PR:** un ticket de Soporte, Edilicia o del formulario público ahora puede nacer Asignado (con responsable y la bitácora "Asignación automática") si el tipo tiene regla; los artículos de Ayuda que describen esos altos como "siempre Nuevo" o sin responsable deben revisarse al levantar la pausa de la Ayuda.

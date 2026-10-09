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

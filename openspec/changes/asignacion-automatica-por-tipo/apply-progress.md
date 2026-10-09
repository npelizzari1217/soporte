# Apply progress: asignacion-automatica-por-tipo

## WU-1 — Migración M1, puerto, repo y evaluador (rama `feat/asignacion-automatica-por-tipo-wu01`)

Estado: completa (tareas 1.1 a 1.8).

- 1.1 / 1.2: migración `20261009120000_reglas_asignacion` (`migration.sql` + `rollback.sql`), modelo `ReglaAsignacion` y back-relation en `TipoTicket`; cliente tenant regenerado.
- 1.3 / 1.5: puerto `IReglaAsignacionRepository` (+ token `REGLA_ASIGNACION_REPOSITORY`) y `PrismaReglaAsignacionRepository`.
- 1.4: integración `prisma-regla-asignacion.repository.integration.spec.ts` (tenant efímero, 8 casos incluido el rollback).
- 1.6 / 1.7: `elegibilidad-responsable-regla.ts` (+ spec) y JSDoc ampliado de `listarTecnicosAsignables`.
- 1.8: M1 aplicada a `soporte_tenant_test` (`prisma migrate status` limpio); lint, typecheck, specs de la WU y ratchet de casts en verde (617, sin subir).

Desvíos del diseño: ninguno. `evaluarResponsableRegla` recibe `Pick<IUsuarioMasterChecker, 'listarTecnicosAsignables'>` en vez del checker completo (mocks completos sin casts).

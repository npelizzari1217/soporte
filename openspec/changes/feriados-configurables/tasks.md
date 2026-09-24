# Tareas: Feriados configurables (globales + por cliente)

> **Desviación de presupuesto declarada.** La skill `sdd-tasks` limita este artefacto a 530 palabras;
> este documento lo supera ampliamente, siguiendo el precedente sentado por
> `openspec/changes/archive/2026-09-21-logo-por-cliente/tasks.md`. La presión: 8 unidades
> de trabajo, cada una obligada a itemizar sus propios tests en la misma unidad (regla del repo: código + tests
> + docs mínimos en un commit revertible), más tareas explícitas para 5 correcciones de
> comentarios/spec desactualizados (H3/H4), logging de falla cerrado (D10), y el requerimiento de
> cierre del roadmap — ninguna de las cuales se puede recortar sin abandonar un control no negociable.

## Review Workload Forecast

| Campo | Valor |
|-------|-------|
| Líneas cambiadas estimadas | WU1 ~330 · WU2 ~400 · WU3 ~330 · WU4 ~400 · WU5 ~300 · WU6 ~220 · WU7 ~230 · WU8 ~380 (total ~2.590) |
| Riesgo respecto del presupuesto de 400 líneas | Alto (el total excede ampliamente una sola PR; WU2/WU4 están al límite por unidad) |
| PRs encadenadas recomendadas | Sí |
| División sugerida | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 → PR 7 → PR 8, una WU por PR |
| Estrategia de entrega | ask-on-risk |
| Estrategia de cadena | pendiente — el usuario todavía no eligió una estrategia; el diseño sugiere Feature Branch Chain sobre `feat/feriados-configurables` (ya es la rama activa), pero acá no se asume |

Decisión necesaria antes de aplicar: Sí
PRs encadenadas recomendadas: Sí
Estrategia de cadena: pendiente
Riesgo respecto del presupuesto de 400 líneas: Alto

### Unidades de trabajo sugeridas

| Unidad | Objetivo | PR probable | Comando de test focalizado | Harness de runtime | Límite de rollback |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Base de VO/entidad/errores de dominio + port/repository/mapper globales | PR 1 | `pnpm vitest run backend/src/calendario-laboral/domain backend/src/calendario-laboral/infrastructure` | N/A — todavía no hay controller cableado, solo tests unitarios + Prisma mockeado | Solo archivos nuevos, ningún controller registrado; revertir elimina código puramente aditivo |
| 2 | Casos de uso globales + `FeriadosController` + DTOs + wiring | PR 2 | `pnpm vitest run backend/src/calendario-laboral` | `curl` contra `POST/GET/PATCH/DELETE /feriados` con el contenedor de Postgres arriba (46 filas sembradas) | Solo wiring de controller/module nuevo; revertir nunca toca las filas de `Feriado` en master |
| 3 | Schema/migración `FeriadoCliente` del inquilino + repo de cliente + checker de master | PR 3 | `pnpm vitest run backend/src/calendario-laboral` (integración, base de inquilino efímera) | `pnpm prisma migrate dev --schema prisma_tenant/schema.prisma` contra una base de inquilino efímera | Migración aditiva; el plan de rollback corre `DROP TABLE feriados_cliente` por inquilino |
| 4 | Casos de uso de cliente + `FeriadosClienteController` + e2e de aislamiento A/B | PR 4 | `pnpm vitest run backend/src/calendario-laboral` (e2e, incluye aislamiento) | Dos bases de inquilino efímeras, `curl` contra `/feriados-cliente` por JWT de inquilino | Solo controller nuevo; revertir no toca WU1-3 |
| 5 | Unión de SLA + falla cerrado + logging del listener (D10) + correcciones H3/H4 | PR 5 | `pnpm vitest run backend/src/calendario-laboral backend/src/sla` | e2e de SLA: crear + repriorizar un ticket HABIL con feriados globales+de cliente, Postgres real | Solo cambio de repository/listener; revertir restaura la lectura previa a la unión (solo global), una regresión de spec, no un crash |
| 6 | tokens `--info`, variantes de badge, `OrigenFeriadoBadge`, scaffolding del feature, entrada de nav para ROOT | PR 6 | `pnpm vitest run frontend/src/features/feriados frontend/src/components/ui` | Manual: renderizar el badge en los temas claro y oscuro | Solo tokens/componente/scaffolding nuevos; todavía ninguna pantalla los consume |
| 7 | Pantalla de feriados globales para ROOT (`/admin/feriados-globales`) | PR 7 | `pnpm vitest run frontend/src/features/feriados` | Manual: ROOT inicia sesión, abre la pantalla, hace CRUD contra el backend real | Ruta + componentes nuevos; revertir elimina la pantalla, el backend queda intacto |
| 8 | Pantalla del cliente, lista combinada, `AdminNav`, cierre de roadmap, deuda de Ayuda | PR 8 | `pnpm vitest run frontend/src/features/feriados` | Manual: ADMINISTRADOR abre `/admin/feriados`; `node scripts/check-roadmap-fresco.mjs` | Ruta + componentes nuevos; la edición del doc de roadmap se revierte independientemente del código |

## Deploy Note

WU3 agrega la migración del inquilino; WU5 agrega el camino de código que lee `FeriadoCliente`. Según
`design.md`, la sección Migration/Rollout, `deploy.ps1:212-214` debe correr `migrate:tenants`
antes de que la app reinicie, y la PR de WU5 no debe desplegarse a un inquilino que
no tenga la migración de WU3 — eso lanza `P2021` dentro del camino de SLA (ahora logueado vía D10, no en silencio, pero
igual está mal desplegarlo fuera de orden).

## WU1: Base de dominio + repositorio global

- [x] 1.1 Agregar `FERIADO_DESCRIPCION_MAX_LENGTH = 200` y `FECHA_CALENDARIO_REGEX` a `backend/src/calendario-laboral/domain/feriados.constants.ts`.
- [x] 1.2 Crear el VO `FechaCalendario` en `backend/src/calendario-laboral/domain/value-objects/fecha-calendario.ts` (`crear(iso)`, `aClave()`, `aDateUtc()`); test en `fecha-calendario.spec.ts`: `2026-02-30` rechazada, `2028-02-29` aceptada.
- [x] 1.3 Crear `FeriadoEntity` y `feriados.errors.ts` (`FechaCalendarioInvalidaError`, `FeriadoFechaDuplicadaError`, `FeriadoFechaEsGlobalError`, `FeriadoNoEncontradoError`) en domain.
- [x] 1.4 Crear el port `IFeriadoGlobalRepository` en `domain/ports/i-feriado-global.repository.ts`.
- [x] 1.5 Promover `claveDiaUtcDe` a static público en `backend/src/calendario-laboral/infrastructure/persistence/prisma/prisma-calendario-laboral.mapper.ts:79-84`; agregar un test de ida y vuelta del mapper que pruebe que `…T00:00:00.000Z` mapea al mismo día calendario (trampa UTC de D2).
- [x] 1.6 Implementar `PrismaFeriadoGlobalRepository` (tabla `feriado` de master) reutilizando el static promovido; tests unitarios con un cliente Prisma mockeado para CRUD + lista ordenada por `fecha` asc.
- [x] 1.7 Correr `pnpm typecheck` y `pnpm vitest run backend/src/calendario-laboral/domain backend/src/calendario-laboral/infrastructure`.

## WU2: ABM global + controller

- [x] 2.1 Crear los casos de uso `ListarFeriadosGlobales`, `CrearFeriadoGlobal`, `EditarFeriadoGlobal`, `EliminarFeriadoGlobal` en `application/use-cases/`, `Result<T, DomainError>`; tests unitarios incl. el mapeo `P2002` → `FeriadoFechaDuplicadaError`.
- [x] 2.2 Crear los DTOs de crear/editar que apliquen el regex de solo-fecha y el límite de 200 caracteres de las constantes de WU1.
- [x] 2.3 Crear `FeriadosController` en `interface/controllers/` (`@Controller('feriados') @UseGuards(JwtAuthGuard)`; las escrituras llevan `@UseGuards(GlobalAdminGuard)` por método, precedente `ciclos-vigentes.controller.ts:103-121`, de solo lectura); mapeo error→HTTP (D7): 400/422/404, `DELETE` → 204.
- [x] 2.4 Tests e2e del controller: 401 sin token, 403 escritura no-ROOT, 200 escritura de ROOT + lectura de vuelta, las 46 filas sembradas sin cambios.
- [x] 2.5 Cablear en `backend/src/calendario-laboral/calendario-laboral.module.ts` (`imports: [AuthModule]`). Correr `pnpm typecheck`, `pnpm lint`, `pnpm vitest run backend/src/calendario-laboral`.

## WU3: Tabla del inquilino + repositorio de cliente + checker de master

- [x] 3.1 Agregar `model FeriadoCliente` a `backend/prisma_tenant/schema.prisma` según D1 (`id uuid gen_random_uuid()`, `fecha DateTime @unique @db.Date`, `descripcion VarChar(200)`, `created_at`/`updated_at timestamptz`, advertencia `@db.Date` copiada de `prisma_master/schema.prisma:492-498`); generar la migración `prisma_tenant/migrations/20260924130000_feriados_cliente/` (WU3a; el timestamp difiere de la sugerencia original de esta línea — ver la nota de desviación en apply-progress).
- [x] 3.2 Crear los ports `IFeriadoClienteRepository` e `IFeriadosGlobalesChecker` en `domain/ports/`.
  - [x] `IFeriadoClienteRepository` (WU3a)
  - [x] `IFeriadosGlobalesChecker` (WU3b)
- [x] 3.3 Implementar `PrismaFeriadoClienteRepository` (cliente del inquilino, reutiliza el static UTC de WU1) y `FeriadosGlobalesMasterChecker` (`esGlobal`, master de solo lectura, precedente `UsuarioMasterChecker`) en infrastructure.
  - [x] `PrismaFeriadoClienteRepository` (WU3a)
  - [x] `FeriadosGlobalesMasterChecker` (WU3b)
- [x] 3.4 Tests de integración sobre una base de inquilino efímera: CRUD, constraint `fecha` única, `esGlobal` true/false, ida y vuelta del mapper para la tabla del inquilino.
  - [x] CRUD, constraint `fecha` única, ida y vuelta del mapper/fecha para `feriados_cliente` (WU3a)
  - [x] `esGlobal` true/false (WU3b — contra `soporte_master_test`, no una base de inquilino efímera, ya que el checker lee master; ver la nota de desviación en apply-progress)
- [x] 3.5 Correr `pnpm typecheck` y la suite de integración; orden de higiene limpiar filas → `app.close()` → `dropDatabase` (WU3a corrió ambos para su porción; el test del checker de WU3b usa `usarLockMasterTest()` y nunca trunca — WU3 ahora está completamente cerrada).

## WU4: ABM del cliente + aislamiento

- [x] 4.1 Crear los casos de uso `ListarFeriadosCliente`, `CrearFeriadoCliente`, `EditarFeriadoCliente`, `EliminarFeriadoCliente`; tests unitarios: pre-chequeo de deduplicación global al crear Y al editar, duplicado dentro de la misma lista, no encontrado.
- [ ] 4.2 Crear los DTOs espejando las constantes de WU1; crear `FeriadosClienteController` (`@Controller('feriados-cliente') @UseGuards(JwtAuthGuard, TenantGuard)`; las escrituras llevan `@UseGuards(AdminClienteGuard)` por método, precedente `catalogos.controller.ts:94,160-161`, de solo lectura).
- [ ] 4.3 Spec e2e de aislamiento con dos inquilinos efímeros: A nunca lista las filas de B, un `:id` de B resuelve 404 dentro de la base de A, un rol no-admin recibe 403, la escritura de ROOT sobre el inquilino tiene éxito.
- [ ] 4.4 Cablear en `calendario-laboral.module.ts`. Correr `pnpm typecheck`, `pnpm lint`, `pnpm vitest run backend/src/calendario-laboral`; orden de higiene limpiar filas → `app.close()` → `dropDatabase`.

## WU5: Unión de SLA, falla cerrado, observabilidad, correcciones de referencias desactualizadas

- [ ] 5.1 Modificar `PrismaFeriadosLaboralesRepository.obtener()` (`infrastructure/persistence/prisma/prisma-feriados-laborales.repository.ts`): `Promise.all([master.feriado.findMany, ctx.prismaClient.feriadoCliente.findMany])` → unión con `Set`; lanzar `FeriadosSinTenantContextError extends Error` cuando `tenantContext.get()` no está bindeado (D3).
- [ ] 5.2 Corregir H4: bindear un `TenantContext` en `backend/src/calendario-laboral/infrastructure/persistence/prisma/calendario-laboral.repositorios.integration.spec.ts:31-32`, que actualmente construye el repositorio sin bindear; agregar tests unitarios para la unión de deduplicación y el caso de excepción por no-bindeado.
- [ ] 5.3 Inyectar `ILogger` (token `LOGGER`) en `AplicarSlaListener` (`backend/src/sla/infrastructure/listeners/aplicar-sla.listener.ts`) y su factory en `sla.module.ts:154-159`; ambos bloques `catch` llaman a `logger.error('SLA_APLICAR_ERROR | evento=... | ticket=${id} | error=${mensaje}')`, nunca vuelven a lanzar (D10).
- [ ] 5.4 `aplicar-sla.listener.spec.ts`: para cada handler (`ticket.creado`, `ticket.reprioritizado`), un rechazo loguea una vez con el id del ticket + mensaje, el handler resuelve sin volver a lanzar, y ningún objeto de error crudo aparece en el mensaje.
- [ ] 5.5 Corregir los 4 comentarios desactualizados "holidays are global-only" (H3): `prisma-feriados-laborales.repository.ts:1-5`, `backend/src/calendario-laboral/domain/ports/i-feriados-laborales.repository.ts:4-5`, `backend/src/sla/application/use-cases/aplicar-sla.use-case.ts:59-70`, `calendario-laboral.module.ts:6-7`.
- [ ] 5.6 e2e de SLA: un ticket HABIL salta el feriado global + el propio del cliente tanto al crear como al repriorizar, nunca el de otro cliente; el `sla_vence_at` de un ticket ya abierto queda sin cambios cuando se agrega un feriado después. Correr `pnpm vitest run backend/src/calendario-laboral backend/src/sla`; orden de higiene como en WU3/WU4.

## WU6: Tokens de frontend, badge, scaffolding

- [ ] 6.1 Agregar los tokens `--info`/`--info-foreground`/`--info-light` (claro `#0369a1`/`#ffffff`/`#e0f2fe`, oscuro `#38bdf8`/`#082f49`/`#082f49`) + `@theme inline --color-info*` a `frontend/src/styles/globals.css:49-54`; agregar las variantes `info` y `success-light` a `frontend/src/components/ui/badge.tsx`.
- [ ] 6.2 Crear `OrigenFeriadoBadge` en `frontend/src/features/feriados/` (verde `success-light` para global, `info` para cliente), siguiendo `frontend/src/components/ui/status-badge.tsx` (solo lectura, plantilla); test de componente para ambas variantes en ambos temas.
- [ ] 6.3 Crear el scaffolding: `types.ts`, funciones de cliente API para ambos endpoints, schemas de Zod espejando los DTOs del backend, `frontend/src/features/feriados/limites.ts` copiando las constantes de WU1 con un test centinela, `frontend/src/features/ciclos-master/limites.ts` (solo lectura, precedente).
- [ ] 6.4 Registrar `/admin/feriados-globales` en `ROOT_SECTION_ITEMS` (`frontend/src/shared/nav/nav-config.ts:134-161`, gateado por `isGlobalAdmin`).
- [ ] 6.5 Correr `pnpm type-check`, `pnpm lint`, `pnpm vitest run frontend/src/features/feriados frontend/src/components/ui`.

## WU7: Pantalla de feriados globales para ROOT

- [ ] 7.1 Crear la pantalla de ROOT en `/admin/feriados-globales`, siguiendo `frontend/src/features/ciclos-master/components/ciclos-vigentes-admin-view.tsx` (solo lectura, plantilla): `DataTable` ordenada por fecha, `OrigenFeriadoBadge`, diálogos de crear/editar/eliminar.
- [ ] 7.2 Tests de componente: renderizado ordenado, badge, validación del diálogo contra `limites.ts`, toasts de éxito/error.
- [ ] 7.3 Test del guard de ruta: un actor no-ROOT no tiene entrada de nav y queda redirigido/bloqueado al navegar directamente.
- [ ] 7.4 Agregar la nota de deuda de Ayuda (pantalla nueva para ROOT; Ayuda en pausa desde 2026-09-07, sin artículo `backend/ayuda/*.md` escrito) al mensaje de commit y al cuerpo de la PR de esta unidad.
- [ ] 7.5 Correr `pnpm type-check`, `pnpm lint`, `pnpm vitest run frontend/src/features/feriados`.

## WU8: Pantalla del cliente, lista combinada, cierre del roadmap

- [ ] 8.1 Crear la pantalla del cliente en `/admin/feriados`, siguiendo `frontend/src/features/catalogos/components/catalogos-admin-view.tsx` (solo lectura, plantilla): `DataTable` combinada que mezcla `GET /feriados` + `GET /feriados-cliente` vía una `combinarFeriados()` pura, ordenada por fecha ISO; las filas globales son de solo lectura (sin acciones de editar/eliminar).
- [ ] 8.2 Tests de componente: test unitario de `combinarFeriados`, renderizado del badge por origen, las filas globales no llevan acciones, las acciones de escritura quedan ocultas/con 403 para los roles no-admin.
- [ ] 8.3 Registrar `/admin/feriados` en `frontend/src/components/shell/admin-nav.tsx` (gateado por `esAdminCliente`).
- [ ] 8.4 Actualizar la viñeta del Punto 5 en `docs/roadmap-comercial.md` ("Decisiones de producto ya cerradas", líneas 197-206): declarar **Cumplida** para "feriados nacionales AR precargados en el seed más excepciones por cliente" (ahora implementado), mantener la **Desviación** existente para la cláusula del horario semanal por cliente. Correr `node scripts/check-roadmap-fresco.mjs` y confirmar que pasa.
- [ ] 8.5 Agregar la nota de deuda de Ayuda (pantalla nueva del cliente; misma pausa) al mensaje de commit y al cuerpo de la PR de esta unidad.
- [ ] 8.6 Correr `pnpm type-check`, `pnpm lint`, `pnpm vitest run frontend/src/features/feriados`; confirmar cada checkbox de Success Criteria de `proposal.md`.

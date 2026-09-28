# Propuesta: Horario laboral por cliente

> Insumo: [`exploration.md`](./exploration.md). Esta propuesta referencia sus hallazgos; no los repite.

## Intent

El horario semanal que usa el SLA `HABIL` vive en `calendario_laboral_dias` (master), es
global y solo se cambia con una migración. Un cliente con otro horario ve su SLA calculado
contra un horario ajeno. Este cambio da a cada cliente su propio horario semanal, editable
desde una pantalla, y cierra la Desviación declarada el 2026-09-24 en el Punto 5 del roadmap.

## Decisión de producto citada (regla del roadmap)

`docs/roadmap-comercial.md`, sección "Decisiones de producto ya cerradas", viñeta del
**Punto 5**. `sdd-spec` DEBE convertir cada cláusula en requerimiento o en referencia explícita:

| Cláusula | Este cambio |
|---|---|
| "calendario por cliente con default 9-18 lun-vie" | **Alcance de este ciclo.** Requerimientos: horario por cliente; default 9-18 lun-vie sembrado en todo tenant |
| "feriados nacionales AR precargados... más excepciones por cliente" | Ya **Cumplida** (`feriados-configurables`). No se toca |
| "arranca el reloj en la próxima ventana hábil" | Ya **Cumplida** (2026-09-09). El calculador no cambia; solo el origen del calendario |

**Al cerrar**, la cláusula del horario pasa de **Desviación** a **Cumplida** en esa viñeta,
validado con `scripts/check-roadmap-fresco.mjs`.

## Las tres preguntas (`rules.proposal`)

| Pregunta | Respuesta |
|---|---|
| ¿Espeja otra capa? | **Sí.** El CHECK de ventana (Postgres) y el Zod del frontend derivan del DTO/dominio del backend, **fuente única** |
| ¿Alternativas con comportamiento distinto? | **Cerrado por el dueño** (abajo). Descartadas: `clienteId` en master; varios intervalos por día |
| ¿Cambia lo que el usuario ve o hace? | **Sí**: pantalla nueva. Ningún artículo de Ayuda pasa a ser falso; escritura en pausa, se anota la deuda |

## Decisiones confirmadas (dueño, 2026-09-28)

| # | Decisión |
|---|---|
| 1 | Un intervalo por día. `VentanaLaboral` y `CalcularSlaHabilVenceService` sin cambios. Pausa de almuerzo no representable (aceptado) |
| 2 | Edita ADMINISTRADOR del cliente o ROOT (`AdminClienteGuard`); `GET` abierto a todo autenticado del tenant. Mismo split que `FeriadosClienteController` |
| 3 | Guardar el horario **NO** recalcula el SLA de tickets abiertos. Rige para tickets nuevos y reprioritizados (`alReprioritizar`, anclado al `createdAt` original). Requerimiento explícito |
| 4 | Zona horaria fija Argentina. Default 9-18 lun-vie sembrado en tenants existentes y nuevos: cero cambio de comportamiento al desplegar |
| 5 | Research: no seleccionado |
| 6 | `calendario_laboral_dias` (master) se **depreca sin dropear**: red de rollback sin lectores. Se corrigen los docstrings "global, vive en MASTER" |

## Scope

### In Scope
- Tabla tenant nueva (mismo shape y CHECK que master) + migración de datos con el default.
- `PrismaCalendarioLaboralSemanalRepository` pasa a `TenantContext`, fail-closed, sin unión con master.
- Endpoint único que reemplaza las 7 filas en una transacción, validado como agregado.
- Invariante nueva al guardar: **al menos un día abierto**.
- Frontend: grilla de 7 filas, edición gated por `esAdminCliente`.
- Corrección de docstrings; edición de la viñeta del Punto 5.

### Out of Scope
- Varios intervalos por día; zona horaria por cliente.
- Recalcular el SLA de tickets abiertos.
- Dropear `calendario_laboral_dias`.
- Artículos de Ayuda (en pausa).

## Capabilities

### New Capabilities
- `horario-laboral-cliente`: horario semanal por tenant, permisos, invariante de día abierto, default sembrado, lectura del SLA fail-closed y no-recálculo de tickets abiertos.

### Modified Capabilities
- Ninguna a nivel requerimiento. Al archivar, la fila de citación "calendario por cliente" de `openspec/specs/feriados-cliente/spec.md` (línea 28, no es requerimiento) queda desactualizada y se corrige.

## Approach

Enfoque 1 de la exploración, calcado de `feriados-configurables`. La migración de datos llega
a tenants existentes vía `migrate:tenants` en el deploy y a los nuevos vía provisioning.

## Affected Areas

| Área | Impacto |
|---|---|
| `backend/prisma_tenant/schema.prisma` + migraciones | Tabla nueva + seed |
| `backend/src/calendario-laboral/**` | Repo, mapper, caso de uso, controller, DTOs |
| `backend/prisma_master/schema.prisma`, `aplicar-sla.use-case.ts` | Solo docstrings |
| `frontend/src/features/**`, `app/(dashboard)/**` | Pantalla nueva |
| `docs/roadmap-comercial.md` | Punto 5 → Cumplida |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Calendario sin días abiertos deja `sla_vence_at` null en silencio (listener traga el error) | Media | Invariante al guardar |
| Tenant sin migrar rompe el mapper (exige 7 filas) | Baja | Seed en la misma migración; `migrate:tenants` en deploy |
| Tamaño ~1230-1680 líneas | Alta | `auto-chain`, `stacked-to-main`, 400 líneas por PR; `size:exception` solo si separar aleja código de sus tests |

## Rollback Plan

`git revert` de los merges en orden inverso: el repositorio vuelve a leer master, cuyas filas
siguen intactas. La tabla tenant es aditiva; dejarla es inofensivo o se dropea por tenant.

## Dependencies

- Ninguna externa ni paquetes nuevos. Reusa patrones de `feriados-configurables`, ya presente en `main`; la migración tenant nueva se ordena después de la suya.

## Success Criteria

- [ ] El día del deploy todo tenant tiene 9-18 lun-vie y los vencimientos no cambian.
- [ ] ADMINISTRADOR/ROOT editan; otros roles reciben 403 al escribir; A nunca ve ni altera el horario de B.
- [ ] Guardar 7 días cerrados se rechaza.
- [ ] Tickets abiertos conservan su `sla_vence_at`; uno reprioritizado usa el horario nuevo.
- [ ] Sin `TenantContext`, la lectura falla cerrada.
- [ ] Gates backend y frontend en verde; `check-roadmap-fresco.mjs` pasa con el Punto 5 Cumplida.
- [ ] Deuda de Ayuda anotada en commits y PRs.

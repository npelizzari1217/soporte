# Propuesta: Feriados configurables (global + por cliente)

> Origen: issue de GitHub #216 (etiqueta `status:approved`).
> Insumo: [`exploration.md`](./exploration.md). Esta propuesta referencia sus hallazgos; no los repite.

## Intent

Hoy todo feriado vive en el `Feriado` de master y se agrega solo mediante migraciones. El
operador de la plataforma no puede agregar un feriado nacional sin un deploy, y un cliente no
puede declarar sus propios días no laborables provinciales o locales. Como resultado, su SLA
de horas hábiles (`HABIL`) cuenta esos días como días laborables. Este cambio hace que el
calendario global sea editable desde una pantalla y agrega una lista de feriados por cliente
que el SLA respeta.

## Decisión de producto citada (regla del roadmap)

`docs/roadmap-comercial.md`, sección "Decisiones de producto ya cerradas", viñeta del
**Punto 5**. Cada una de sus cláusulas, `sdd-spec` DEBE convertirla en un requerimiento o
en una desviación declarada:

| Cláusula | Este cambio |
|---|---|
| "calendario por cliente con default 9-18 lun-vie" | **Desviación declarada, no implementada.** `CalendarioLaboralDia` sigue siendo global. Motivo: el dueño acotó el #216 solo a feriados |
| "feriados nacionales AR precargados en el seed más excepciones por cliente" | **Implementada.** Las 46 filas sembradas siguen siendo el conjunto global. Las filas por cliente son las excepciones |
| "arranca el reloj en la próxima ventana hábil" | Ya entregada (`calcular-sla-habil-vence.service.ts`); sin cambios |

**Al cerrar**, la viñeta del Punto 5 DEBE actualizarse para declarar **Cumplida** o
**Desviación** con su motivo. `scripts/check-roadmap-fresco.mjs` exige que esa declaración
exista.

## Las tres preguntas (`rules.proposal`)

| Question | Answer |
|---|---|
| ¿Refleja otra capa? | **Sí.** El formato de fecha y los límites de descripción viven en los DTOs del backend. Los schemas Zod del frontend derivan de ahí. **Fuente única: el backend** |
| ¿Alternativas con comportamiento distinto? | **Cerrado por el dueño** (tabla abajo). La exploración descartó dos alternativas: `clienteId` en el `Feriado` de master y una UI de grilla mensual |
| ¿Cambia lo que el usuario ve o hace? | **Sí**: dos pantallas nuevas. Esto genera **deuda de Ayuda** (ver Risks) |

## Decisiones confirmadas

| # | Decisión |
|---|---|
| 1 | El calendario global sigue en el `Feriado` de master. Sus 46 filas no se tocan. ROOT (`GlobalAdminGuard`) lo edita desde una pantalla |
| 2 | Los feriados por cliente van en una tabla NUEVA del **schema del inquilino**, así el aislamiento se sostiene por construcción. El ADMINISTRADOR del cliente o ROOT los edita (`TenantGuard` + `AdminClienteGuard`). Solo pueden agregar días, y cada cliente ve solo los propios |
| 3 | El SLA usa la unión de los feriados globales ∪ los del cliente del ticket, construida dentro de `PrismaFeriadosLaboralesRepository.obtener()` vía `TenantContext`. Sin cambios de firma en el puerto, `AplicarSlaUseCase` ni `CalcularSlaHabilVenceService` |
| 4 | Vista: un `DataTable` ordenado por fecha con un badge de origen. Lo global usa `--success-light` (verde). El cliente usa una tripleta NUEVA `--info`/`--info-foreground`/`--info-light` (claro y oscuro) más una variante de badge `info` (azul pálido). El cliente ve lo global en modo solo lectura |
| 5 | Una fecha de cliente que ya es global se rechaza, verificado a través de un adaptador de master de solo lectura (precedente `UsuarioMasterChecker`). La unión de `Set` también de-duplica |

## Scope

### In Scope
- ABM global de `Feriado`: casos de uso, `FeriadosController` (escrituras con `GlobalAdminGuard`, lecturas autenticadas).
- Tabla de inquilino `FeriadoCliente` y migración de inquilino (`@@unique(fecha)`, más el comentario de la trampa UTC de `@db.Date` y el test del mapper).
- ABM por cliente: casos de uso, checker de master de solo lectura, `FeriadosClienteController`.
- Unión de SLA en `PrismaFeriadosLaboralesRepository`. Corregir los comentarios desactualizados de "los feriados son solo-globales" (clase del repositorio, docstring de `AplicarSlaUseCase`).
- Frontend: pantalla global ROOT (plantilla `CiclosVigentesAdminView`) y pantalla de cliente (plantilla `CatalogosAdminView`), tokens `--info`, variante de badge `info`.
- Tests en cada unidad, incluyendo un escenario de aislamiento (el cliente A nunca ve los feriados de B).

### Out of Scope
- Horario semanal por cliente (`CalendarioLaboralDia` sigue siendo global). Esta es la
  desviación declarada del Punto 5.
- Que un cliente cancele o sobrescriba un feriado global.
- Recalcular el SLA de tickets ya abiertos.
- Importación externa o automática de feriados.
- UI de grilla mensual, o cualquier librería nueva de fechas o calendario.
- Artículos de Ayuda (en pausa desde el 2026-09-07).

## Capacidades

### New Capabilities
- `feriados-globales`: creación/edición/eliminación solo-ROOT de la lista global de
  feriados, y acceso de lectura autenticado a ella.
- `feriados-cliente`: lista de feriados por inquilino con sus permisos de admin y
  aislamiento, rechazo de duplicados globales, la vista combinada con badges de origen, y
  la semántica de unión del SLA.

### Modified Capabilities
- Ninguna. `openspec/specs/` no tiene ninguna spec de SLA ni de calendario.

## Approach

Enfoque 1 de la exploración: una nueva tabla de inquilino, el `Feriado` de master sin tocar,
y la unión en la capa de infraestructura. Ambos caminos del SLA (crear/repriorizar vía
listener, y el sweep vía `tenantContext.run()`) ya llevan `TenantContext`, así que un solo
cambio en el repositorio cubre a ambos.

## Áreas afectadas

| Area | Impacto |
|---|---|
| `backend/prisma_tenant/schema.prisma` + migración | Nueva `FeriadoCliente` |
| `backend/src/calendario-laboral/**` | Nuevos casos de uso, controllers, repo, mapper, checker de master. `prisma-feriados-laborales.repository.ts` modificado (unión) |
| `backend/src/sla/application/use-cases/aplicar-sla.use-case.ts` | Solo comentario |
| `frontend/src/styles/globals.css`, `components/ui/badge.tsx` | Tripleta `--info`, variante `info` |
| `frontend/src/features/feriados*/**`, `app/(dashboard)/**` | Dos pantallas nuevas |
| `backend/prisma_master/schema.prisma` | **Sin cambios** |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Fuga cross-tenant | Baja | El schema del inquilino aísla por construcción, y un escenario de spec A/B explícito lo testea |
| Un caso de uso de inquilino escribe en master | Baja | El adaptador expone solo un puerto de solo lectura, siguiendo el precedente de `UsuarioMasterChecker` |
| Desplazamiento UTC de `@db.Date` | Media | El mapper lee las partes UTC crudas. Un test dedicado lo cubre |
| El SLA ignora en silencio los feriados del inquilino cuando no hay `TenantContext` vinculado | Media | `sdd-design` define el comportamiento. Un escenario de spec cubre ambos caminos del SLA |
| Tamaño ~1,850-2,450 líneas vs. un presupuesto de PR de 400 líneas | **Alta** | PRs encadenados (abajo) |
| Deuda de Ayuda | Segura | Una nota de deuda va en los commits y el cuerpo del PR. No se escriben artículos mientras dure la pausa. Cualquier artículo que este cambio vuelva falso se corrige |

## Despliegue / división de PRs (intención; `sdd-tasks` decide)

Cadena de feature-branch sobre `feat/feriados-configurables`, en orden de dependencia:
1. Backend del ABM global.
2. Backend de tabla de inquilino + ABM por cliente (incluye el checker de duplicados).
3. Unión de SLA + corrección de comentarios.
4. Tokens/badge `--info` + pantalla global ROOT.
5. Pantalla de cliente con lista combinada con badges.

Cada porción debe tener unas 400 líneas o menos y entregarse con sus propios tests.

## Rollback Plan

Hacer `git revert` de los merges de cada porción en orden inverso, y luego revertir la
migración de inquilino (`DROP TABLE` de `FeriadoCliente`) en cada base de inquilino. La
tabla es aditiva y nada fuera de este cambio la lee, así que dejarla después del revert es
inofensivo. Los datos de `Feriado` de master nunca se migran. Los feriados que ROOT agregó
desde la pantalla siguen siendo filas válidas y permanecen vigentes.

## Dependencias

- Ninguna externa. Sin paquetes nuevos.

## Success Criteria

- [ ] ROOT agrega, edita y elimina un feriado global sin una migración, y los usuarios
  no-ROOT reciben 403 en esas escrituras.
- [ ] Un ADMINISTRADOR de cliente gestiona solo sus propios feriados. Otros roles reciben
  403 en escrituras, y el cliente A nunca ve las filas de B.
- [ ] Una fecha de cliente que ya es global se rechaza.
- [ ] Un ticket `HABIL` omite tanto los feriados globales como los propios del cliente, y
  nunca los de otro cliente.
- [ ] La lista muestra lo global en verde y las filas de cliente en azul pálido, en los
  temas claro y oscuro.
- [ ] Las 46 filas existentes de `Feriado` no cambian.
- [ ] Backend `pnpm lint`/`typecheck`/`test` y frontend `pnpm lint`/`type-check`/`test`
  están en verde.
- [ ] La viñeta del Punto 5 del roadmap declara Cumplida/Desviación, y
  `check-roadmap-fresco.mjs` pasa.
- [ ] La deuda de Ayuda queda registrada en los commits y el cuerpo del PR.

# Exploración: feriados configurables (calendario global + por cliente)

> Ciclo SDD `feriados-configurables`. Fecha: 2026-09-24. Issue GitHub #216 (aprobado).

## Decisión de producto citada

`docs/roadmap-comercial.md`, sección "Decisiones de producto ya cerradas", punto 5
(línea ~197-206):

> **Punto 5** — calendario **por cliente** con default 9-18 lun-vie; feriados
> nacionales AR precargados en el seed más excepciones por cliente; un ticket
> abierto fuera de horario arranca el reloj en la **próxima ventana hábil**.
> **Desviación entregada el 2026-09-09**: el arranque en la próxima ventana
> hábil está implementado (`calcular-sla-habil-vence.service.ts`), pero el
> calendario y los feriados son **globales**, no por cliente:
> `CalendarioLaboralDia` tiene como clave solo `dia_semana` y `Feriado` solo
> `fecha`, ambos en la base master (`backend/prisma_master/schema.prisma:477-512`).
> No hay excepciones por cliente. Anotado en la deuda técnica.

Desglosando la viñeta en sus tres cláusulas, y qué cubre este cambio:

| Cláusula | ¿Cubierta por este cambio? |
|---|---|
| "calendario por cliente con default 9-18 lun-vie" | **No cubierta — desviación explícita.** El issue #216 mantiene el horario semanal (`CalendarioLaboralDia`) global (fuera de alcance, declarado explícitamente). Solo la lista de feriados pasa a ser por cliente. |
| "feriados nacionales AR precargados en el seed más excepciones por cliente" | **Cubierta.** Los 46 feriados nacionales ya sembrados se mantienen como el conjunto global; las filas por cliente son las "excepciones" (provinciales/municipales/locales). |
| "un ticket abierto fuera de horario arranca el reloj en la próxima ventana hábil" | **Ya entregada** (sdd/sla-habil WU-1, no relacionada con este cambio — sin riesgo de regresión, `CalcularSlaHabilVenceService` no se toca en el enfoque recomendado). |

**Consecuencia para `sdd-spec`**: este cambio cierra la mitad de "feriados por cliente" de la desviación documentada el 2026-09-09, pero deja deliberadamente abierta la mitad de "calendario semanal por cliente". La spec debe declarar ese remanente como una **nueva desviación, separada y declarada** (no silenciosa). Actualizar la viñeta del roadmap en sí debe señalarse como seguimiento en la propuesta, no quedar desactualizada en silencio.

## Current State

### 1. Cómo obtiene los feriados hoy el camino del SLA, y cómo conoce al inquilino

**Hoy no conoce al inquilino en absoluto — y no lo necesita para el enfoque recomendado.**

- `AplicarSlaUseCase.calcularVenceAt()` (`backend/src/sla/application/use-cases/aplicar-sla.use-case.ts:187-196`)
  se ramifica según `ticket.slaRegla`. Para `'HABIL'` hace:
  ```ts
  const [calendario, feriados] = await Promise.all([
    this.calendarioRepo.obtener(),
    this.feriadosRepo.obtener(),
  ]);
  return this.calculadorHabil.venceAt(creadoEn, horas, calendario, feriados);
  ```
  Ni `calendarioRepo` (`ICalendarioLaboralSemanalRepository`) ni `feriadosRepo`
  (`IFeriadosLaboralesRepository`) reciben ningún parámetro de inquilino/cliente — la firma
  del puerto es `obtener(): Promise<FeriadosLaborales>`, sin argumentos
  (`backend/src/calendario-laboral/domain/ports/i-feriados-laborales.repository.ts:18`).
- La implementación concreta, `PrismaFeriadosLaboralesRepository`
  (`backend/src/calendario-laboral/infrastructure/persistence/prisma/prisma-feriados-laborales.repository.ts:17-22`),
  consulta `this.prismaService.getMasterClient().feriado.findMany()` — **todas las filas, sin
  filtro, sin ninguna noción de inquilino.**
- **Dónde la identidad del inquilino YA está disponible, sin usar:** el listener que invoca
  `AplicarSlaUseCase` (`aplicar-sla.listener.ts:6-12`) documenta que los handlers de
  `EventEmitter2` corren de forma sincrónica en la pila de llamadas emisora y **heredan el
  `TenantContext` del scope emisor** (el binding de inquilino de la request HTTP, fijado por
  `TenantGuard`, `backend/src/auth/infrastructure/guards/tenant.guard.ts:65-73`). Así que para
  cuando corre `PrismaFeriadosLaboralesRepository.obtener()`, `TenantContext.get()` ya tiene
  `{ prismaClient: <tenant client>, dbName, clienteId }` del cliente propio del ticket —
  ambiental vía `AsyncLocalStorage`.

**Punto de enganche para la unión por cliente**: cambiar SOLO
`PrismaFeriadosLaboralesRepository.obtener()` para que también inyecte `TenantContext`, lea
de ahí el cliente Prisma del inquilino, consulte la nueva tabla de feriados por cliente en
esa conexión, y una los dos resultados `Set<string>` (claves `YYYY-MM-DD` del master global ∪
claves `YYYY-MM-DD` del inquilino — la unión de `Set` ya de-duplica, así que incluso una
carrera que deje a una fila de cliente duplicar una fecha global nunca puede contarse dos
veces en el cálculo del SLA).
**No hace falta ningún cambio** en `AplicarSlaUseCase`, `CalcularSlaHabilVenceService`,
`ICalendarioLaboralSemanalRepository`, el wiring de `sla.module.ts`, ni la firma del puerto
de dominio — la unión es una preocupación de la capa de infraestructura.

`SlaSweepScheduler` (el sweep S4/S5) también corre cada iteración dentro de `tenantContext.run()`
por inquilino (`sla.module.ts:160-177`, `TenantContext`/`ITenantEnumerator`) — así que el mismo
cambio en el repositorio cubre tanto el camino de creación/repriorización (S2/S3) como el
sweep periódico (S4/S5) sin wiring adicional.

### 2. Dónde deberían vivir los feriados por cliente — comparación de tablas

`Cliente` (master) ya lleva la configuración SMTP por cliente
(`backend/prisma_master/schema.prisma:78-102`) y, desde
`openspec/changes/archive/2026-09-21-logo-por-cliente`, un logo. Ambos son **atributos
escalares de la entidad cliente misma** — necesarios incluso antes de que exista un binding
a la base del inquilino (SMTP al resetear contraseña, logo en el JWT al iniciar sesión). Los
feriados son categóricamente distintos: un **dataset operativo con forma de lista**,
consumido solo desde dentro de una request ya vinculada a un inquilino. El análogo
estructural es `Prioridad`
(`backend/prisma_tenant/schema.prisma:84`) — una config de lista editable por inquilino,
con CRUD protegido por `AdminClienteGuard`, viviendo en el schema del INQUILINO.

| | `Feriado` en master + `clienteId` nullable | Nueva tabla en el schema del inquilino (recomendada) |
|---|---|---|
| Aislamiento | Solo lógico — toda consulta DEBE recordar `WHERE clienteId = X OR clienteId IS NULL`. Un filtro olvidado filtra los feriados de otro inquilino. | **Estructural** — una base Postgres distinta por inquilino (`PrismaService.getTenantClient(dbName)`, `prisma.service.ts:62`). Una consulta que se olvida de filtrar no puede filtrar datos. |
| Consistencia con los patrones existentes | Ninguna — `Feriado`/`CalendarioLaboralDia` están documentados como solo-globales ("ABM ROOT-only, fuera de la matriz de permisos por cliente", schema.prisma:474). | Coincide con `Prioridad`, `TipoTicket`, y todo otro catálogo editable por inquilino. |
| Riesgo de migración sobre las 46 filas existentes | Agrega una columna nullable a una tabla con 46 filas sembradas, encadenadas por migraciones (`20260909130000_seed_feriados_nacionales_inamovibles`, `20260923150000_seed_feriados_moviles_y_trasladables`). | **Cero** — `Feriado` no se toca; la nueva tabla es puramente aditiva. |
| Prevención de duplicados (req 5) | Un índice único parcial igual le permite a un cliente sombrear una fecha global; la aplicación igual debe validar. | Misma necesidad de validación, limpiamente separable: `CrearFeriadoClienteUseCase` lee el conjunto global vía un adaptador de master de solo lectura — con precedente en `UsuarioMasterChecker` (`backend/src/tickets/infrastructure/persistence/prisma/usuario-master.checker.ts`). |

**Recomendación: nueva tabla en el schema del inquilino**, por ejemplo `FeriadoCliente` en
`backend/prisma_tenant/schema.prisma`, replicando la forma de `Feriado` (`id`, `fecha
@db.Date` con el mismo comentario de la trampa `@db.Date`, `descripcion`, timestamps) más
`@@unique(fecha)` (la unicidad por inquilino alcanza; no hace falta columna `clienteId`
dentro de una base de inquilino).

### 3. Autorización — roles/permisos/scopes

Ya existen dos conceptos de admin ortogonales; no hace falta un guard nuevo:

- **ROOT** = `is_global_admin` en el JWT, cross-tenant, evaluado por `GlobalAdminGuard`
  (`backend/src/auth/infrastructure/guards/global-admin.guard.ts:22-33`). Actor para el
  ABM del calendario **global**. Precedente: `CicloVigenteController`
  (`backend/src/clientes/interface/controllers/ciclos-vigentes.controller.ts`) protege
  las escrituras solo con `GlobalAdminGuard` (sin `TenantGuard` — un ROOT puede no tener
  `cliente_id` en el JWT, :13-16).
- **ADMINISTRADOR** (de la membresía activa) O ROOT = `esAdminDeCliente(user)`,
  evaluado por `AdminClienteGuard`
  (`backend/src/auth/infrastructure/guards/admin-cliente.guard.ts:30-45`), siempre aplicado
  **por método, nunca por clase** (ADR-P5). Precedente: `CatalogosController`
  (`backend/src/tickets/interface/controllers/catalogos.controller.ts`) — `TenantGuard` a
  nivel de clase, `AdminClienteGuard` por método de escritura, lecturas `GET` abiertas.

No hace falta ninguna entrada nueva en `CATALOGO_MODULOS`/`CodigoAccion` (`backend/src/shared/domain/acciones.ts`):
eso es la matriz de permisos por usuario, y el ABM de calendario/feriados está
documentado como **"fuera de la matriz de permisos por cliente (ADR-5)"**.

| Endpoint | Guard(s) | Precedente |
|---|---|---|
| `POST/PATCH/DELETE /feriados` (global) | `GlobalAdminGuard` | escrituras de `CicloVigenteController` |
| `GET /feriados` (lista global) | cualquier usuario autenticado, solo lectura | lecturas abiertas de `CatalogosController` |
| `POST/PATCH/DELETE /feriados-cliente` (por cliente) | `TenantGuard` + `AdminClienteGuard` | escrituras de `CatalogosController` |
| `GET /feriados-cliente` (lista por cliente) | solo `TenantGuard` | lecturas abiertas de `CatalogosController` |

Los gates de frontend ya existen: `useSession().isGlobalAdmin` y `useSession().esAdminCliente`
(`frontend/src/shared/hooks/use-session.ts:53,61`).

### 4. Frontend — patrones existentes, y el vacío de la vista de calendario

- **Routing**: Next.js App Router, `frontend/src/app/(dashboard)/...`. Precedente de ABM
  master solo-ROOT: `frontend/src/app/(dashboard)/ciclos/page.tsx` →
  `CiclosVigentesAdminView`
  (`frontend/src/features/ciclos-master/components/ciclos-vigentes-admin-view.tsx`), protegido
  por `useSession().isGlobalAdmin`, lista `DataTable`, `FormDialog` para crear/editar,
  `ConfirmDialog` para eliminar. Plantilla para la pantalla global.
- **Precedente de pantalla admin de inquilino**:
  `frontend/src/features/catalogos/components/catalogos-admin-view.tsx` (protegido por
  `esAdminCliente`). Plantilla para la pantalla por cliente.
- **No existe ningún componente ni librería de calendario/grilla de fechas.**
  `frontend/package.json` no tiene dependencias de calendario/fecha (`react-day-picker`,
  `date-fns`, `dayjs`, `luxon` — ninguna). Toda pantalla de fechas existente renderiza una
  columna `DataTable` con `formatearFechaCalendario`
  (`frontend/src/shared/lib/formato-fecha.ts`). Una grilla mensual literal es
  infraestructura completamente nueva. **Hace falta una decisión de producto** (lista vs.
  grilla).
- **Colores**: `frontend/src/styles/globals.css` define tripletas de tokens duales
  claro/oscuro (`--success`/`--success-foreground`/`--success-light`, `--warning`/…),
  consumidas por `badgeVariants` (`frontend/src/components/ui/badge.tsx:14-21`). El verde
  suave mapea al `--success-light` existente (#dcfce7 claro / #052e16 oscuro). El azul
  pálido **no tiene token** — hay que agregar una tripleta
  `--info`/`--info-foreground`/`--info-light` tanto al bloque `:root` como al `.dark`, más
  una variante de badge `info`.

### 5. Patrones de test existentes

- Los specs de integración que truncan la base de test master llaman a `usarLockMasterTest()`
  (`backend/src/testing/lock-master-test.ts`) antes de su `describe`, por ejemplo
  `calendario-laboral.repositorios.integration.spec.ts:19`.
- Los specs de integración de repositorio corren contra Postgres real (`MASTER_TEST_URL`), ver
  `calendario-laboral.repositorios.integration.spec.ts:15-41`.
- Los tests de mapper son specs unitarios separados (`prisma-calendario-laboral.mapper.spec.ts`);
  la trampa de `@db.Date` merece un test dedicado para el nuevo mapper.
- Los specs e2e a nivel controller (`crear-cliente.e2e.spec.ts`, `auth.e2e.spec.ts`) son la
  plantilla para verificar la matriz de guards de punta a punta.
- Frontend: `<feature>-admin-view.test.tsx` junto a cada vista admin
  (`ciclos-vigentes-admin-view.test.tsx`, `catalogos-admin-view.test.tsx`).

### 6. Risks

- **Aislamiento de inquilino**: resuelto estructuralmente por la tabla en el schema del
  inquilino. El chequeo de duplicados (req 5) deliberadamente lee del master desde un caso
  de uso de inquilino — debe ser un adaptador de solo lectura estilo
  `UsuarioMasterChecker` y nunca escribir en master.
- **Sin caché, y no debería agregarse ninguna**: el docstring de `AplicarSlaUseCase`
  (aplicar-sla.use-case.ts:65-70) explica que las lecturas de feriados son deliberadamente
  sin caché. La unión agrega una lectura por inquilino. **Ese docstring y el comentario de
  clase de `PrismaFeriadosLaboralesRepository` ("los feriados son globales, viven en
  MASTER") pasan a ser FALSOS una vez que esto se despliega y deben corregirse en el mismo
  cambio.**
- **Trampa UTC de `@db.Date`**: aplica al `fecha` de la nueva tabla; el mapper debe leer
  los componentes UTC crudos, nunca `desplazarAArgentina`. Copiar la advertencia de
  `prisma_master/schema.prisma:492-498`.
- **Las 46 filas existentes**: no requieren migración.
- **Ayuda en pausa** (`soporte/CLAUDE.md`): solo una nota de deuda en el commit/cuerpo del PR.
- **Presupuesto de PR (400 líneas cambiadas)**: la estimación es 4-6 veces eso; necesita
  una división deliberada.

## Approaches

1. **Nueva tabla en el schema del inquilino + `Feriado` de master sin tocar + unión en
   `PrismaFeriadosLaboralesRepository` vía `TenantContext`** (recomendado)
   - Pros: aislamiento por construcción; riesgo de migración cero; cero cambios en
     `AplicarSlaUseCase`/`CalcularSlaHabilVenceService`/puertos de dominio; coincide con el
     precedente del catálogo de inquilino; el precedente de `UsuarioMasterChecker` cubre la
     lectura cross-DB.
   - Contras: misma forma en dos schemas; la lógica de unión debe testearse para tablas de
     inquilino vacías y con datos.
   - Esfuerzo: Medio (backend), Medio (frontend).
2. **`Feriado` de master + `clienteId` nullable, `NULL` = global**
   - Pros: una sola tabla y un solo repositorio; sin migración de inquilino.
   - Contras: aislamiento solo lógico; contradice el invariante documentado de
     solo-global del modelo; toca la tabla sembrada; toda consulta futura debe recordar el
     filtro. **No recomendado.**
   - Esfuerzo: Medio-Bajo (backend), Medio (frontend).
3. **UI de calendario con grilla mensual literal** (por ejemplo `react-day-picker`)
   - Pros: lectura literal de "vista de calendario".
   - Contras: dependencia y patrón de UI nuevos sin precedente; bundle y superficie de
     revisión más grandes; el requerimiento real (distinguir el origen por color) se
     satisface con `Badge`/`DataTable`.
   - Esfuerzo: Alto (frontend). **Necesita una decisión de producto explícita.**

## Recommendation

Enfoque 1: nueva tabla `FeriadoCliente` en `prisma_tenant/schema.prisma`; un nuevo
`FeriadosController` (master, escrituras con `GlobalAdminGuard` / lecturas abiertas) y un
nuevo `FeriadosClienteController` (inquilino, escrituras con `AdminClienteGuard` / lecturas
con `TenantGuard`); prevención de duplicados vía un adaptador de master de solo lectura
inyectado en `CrearFeriadoClienteUseCase`; unión de SLA dentro de
`PrismaFeriadosLaboralesRepository.obtener()`.
Frontend: dos pantallas admin siguiendo `CiclosVigentesAdminView` / `CatalogosAdminView`,
reutilizando `--success-light` para lo global, agregando una tripleta `--info` para lo
por cliente, y renderizando la vista de calendario como una lista ordenada con badges de
color, salvo que el dueño de producto elija una grilla.

## Estimación aproximada de tamaño

| Area | Estimate (incl. tests) |
|---|---|
| Backend — ABM global de `Feriado` | ~450-600 líneas |
| Backend — ABM de `FeriadoCliente` por inquilino (schema, migración, casos de uso, controller, repo, mapper, tests) | ~500-650 líneas |
| Backend — plug-in de unión SLA | ~100-150 líneas |
| Frontend — pantalla admin global | ~350-450 líneas |
| Frontend — pantalla por cliente + vista con colores + token | ~450-600 líneas |
| **Total** | **~1,850-2,450 líneas** |

Necesita como mínimo una división en 4-5 PRs, decidida en `sdd-tasks`.

## Lista para la propuesta

Sí, con dos puntos por resolver antes de `sdd-spec`:

1. **Vista de calendario: grilla mensual literal vs. lista con badges de color** — decisión
   del dueño de producto.
2. **El remanente del punto 5 del roadmap** (horario semanal por cliente) queda abierto; la
   propuesta debe indicar que este cambio resuelve solo la mitad de feriados de la viñeta.

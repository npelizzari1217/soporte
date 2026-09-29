# Exploración: horario laboral por cliente (calendario semanal)

> Ciclo SDD `horario-laboral-por-cliente`. Fecha: 2026-09-28. Tercer pedido del dueño en la
> sesión del 2026-09-28.

## Decisión de producto citada

`docs/roadmap-comercial.md`, sección "Decisiones de producto ya cerradas", punto 5
(líneas 198-215):

> **Punto 5** — calendario **por cliente** con default 9-18 lun-vie; feriados
> nacionales AR precargados en el seed más excepciones por cliente; un ticket
> abierto fuera de horario arranca el reloj en la **próxima ventana hábil**.
> Se declara por cláusula:
> - **Cumplida** — próxima ventana hábil: entregada el 2026-09-09
>   (`calcular-sla-habil-vence.service.ts`).
> - **Cumplida** — feriados nacionales precargados más excepciones por cliente:
>   ciclo `feriados-configurables` (issue #216, 2026-09-24, en la rama
>   `feat/feriados-configurables`, todavía sin desplegar). Los nacionales
>   siguen en `feriados` (master) y ahora se administran desde
>   `/admin/feriados-globales` (solo ROOT); cada cliente carga los suyos en
>   `feriados_cliente` de su propia base desde `/feriados` (su ADMINISTRADOR).
>   El SLA hábil saltea la unión de ambos y nunca los de otro cliente
>   (`prisma-feriados-laborales.repository.ts`).
> - **Desviación** — horario semanal por cliente: `CalendarioLaboralDia` sigue
>   siendo global (clave solo `dia_semana`, base master). El issue #216 se
>   acotó a los feriados por decisión del dueño; el horario por cliente queda
>   en la deuda técnica.

| Cláusula | ¿Cubierta por este cambio? |
|---|---|
| "calendario por cliente con default 9-18 lun-vie" | **Sí — es el alcance de este ciclo.** Cierra la Desviación declarada el 2026-09-24. |
| "feriados nacionales AR precargados... más excepciones por cliente" | Ya cerrada por `feriados-configurables`. No se toca. |
| "un ticket abierto fuera de horario arranca el reloj en la próxima ventana hábil" | Ya entregada. `CalcularSlaHabilVenceService.venceAt()` no cambia de forma; solo cambia el origen del `CalendarioLaboralSemanal` que recibe. |

**A re-confirmar con el dueño**: el default 9-18 lun-vie es el mismo valor sembrado hoy en
`calendario_laboral_dias` (`20260830210100_seed_calendario_laboral_default/migration.sql:18-26`).
Se propone sembrar ese mismo valor por tenant (cero cambio de comportamiento el día del deploy).

**Consecuencia para la spec**: al cerrar el ciclo, la viñeta del punto 5 pasa de
**Desviación** a **Cumplida** (`scripts/check-roadmap-fresco.mjs` exige la declaración).

## Estado actual

### 1. El modelo hoy — `CalendarioLaboralDia` (global, master)

- Schema: `backend/prisma_master/schema.prisma:477-485`. PK `diaSemana` (`SmallInt`,
  0=domingo..6=sábado, como `Date.getUTCDay()`). `aperturaMinuto`/`cierreMinuto` en minutos
  desde medianoche, hora local Argentina; ambos `NULL` = día cerrado. **Un solo intervalo por
  día** (no representa pausa de almuerzo).
- Migraciones: `20260830210000_add_calendario_laboral/migration.sql:22-39` crea la tabla con
  dos CHECK (`dia_semana BETWEEN 0 AND 6` y ventana: ambos NULL, o `apertura < cierre` dentro
  de `[0,1440]`). `20260830210100_seed_calendario_laboral_default/migration.sql:18-26` siembra
  las 7 filas (lun-vie 540-1080; sáb/dom NULL) con `ON CONFLICT (dia_semana) DO NOTHING`.
- **No existe ABM.** El comentario del schema (`schema.prisma:474-475`) promete un ABM
  ROOT-only en "WU-6/WU-7" que nunca se construyó: `interface/controllers/` solo tiene
  controllers de feriados. Hoy el horario solo se cambia con una migración.
- **Único lector**: `PrismaCalendarioLaboralSemanalRepository.obtener()`
  (`prisma-calendario-laboral-semanal.repository.ts:21-24`), `findMany()` sobre
  `getMasterClient()`, sin conocimiento de tenant. El mapper
  (`prisma-calendario-laboral.mapper.ts:35-64`) **lanza** si falta alguna de las 7 filas.
- **Sin caché**: se lee en cada `alCrear`/`alReprioritizar` (`aplicar-sla.use-case.ts:68-70`
  explica por qué).
- **Zona horaria fija**, Argentina UTC-3 sin horario de verano (`OFFSET_ARGENTINA_MS`,
  `calcular-sla-habil-vence.service.ts:42-45,220-239,273-276`), sin parámetro.
- Único consumidor: `AplicarSlaUseCase.calcularVenceAt()` (`aplicar-sla.use-case.ts:191-199`),
  llamado desde `alCrear` (`ticket.creado`) y `alReprioritizar` (`ticket.reprioritizado`).
  `SlaSweepScheduler` (`sla.module.ts:160-177`) solo usa `MarcarVencidosUseCase`: compara el
  `sla_vence_at` ya calculado, no recalcula.

### 2. El precedente `feriados-configurables` (archivado 2026-09-24)

- **Tabla por cliente**: `FeriadoCliente` en `backend/prisma_tenant/schema.prisma:1289-1299`
  (`feriados_cliente`), sin `clienteId`: el tenant es la base (aislamiento estructural).
- **Migraciones de tenant**, dos rutas ya en producción:
  1. Tenant nuevo: `TenantMigrationRunnerAdapter.run()` (`tenant-migration-runner.adapter.ts:48-55`)
     corre `prisma migrate deploy --schema=prisma_tenant/schema.prisma`, desde
     `ProvisionarTenantDatabaseUseCase` vía `CrearClienteUseCase` (`crear-cliente.use-case.ts:150-154`).
  2. Tenants existentes: `backend/scripts/migrate-tenants.js` (líneas 57-90), fan-out
     idempotente sobre `master.clientes` activos. `deploy.ps1:210-214` lo corre en todo deploy.
  - **Consecuencia**: una migración de DATOS en el schema tenant llega a los tenants
    existentes en el próximo deploy y a todo tenant nuevo, con el mismo archivo y sin tocar
    `TenantSeederAdapter` (que siembra catálogos editables con `createMany`,
    `tenant-seeder.adapter.ts:194-210`).
- **Pantalla y permisos**: `FeriadosClienteController` (`feriados-cliente.controller.ts:78-146`)
  con `@UseGuards(JwtAuthGuard, TenantGuard)` a nivel de clase, `GET` abierto a cualquier
  autenticado del tenant y escrituras con `@UseGuards(AdminClienteGuard)` por método (ROOT o
  ADMINISTRADOR de la membresía activa, desde el JWT, `admin-cliente.guard.ts:30-45`). Sin
  entrada en `CATALOGO_MODULOS` (`backend/src/shared/domain/acciones.ts:38-133`).
- **Unión SLA**: `PrismaFeriadosLaboralesRepository.obtener()`
  (`prisma-feriados-laborales.repository.ts:61-81`) lee master y tenant vía `TenantContext`;
  **fail-closed** sin contexto (`FeriadosSinTenantContextError`, líneas 39-48).
  `AplicarSlaListener` hereda el `TenantContext` porque `EventEmitter2` corre sincrónico
  (`aplicar-sla.listener.ts:6-12`).
- **Chequeo contra master** (`FeriadosGlobalesMasterChecker`): no tiene análogo acá; el
  horario no es aditivo sino reemplazante.
- **Tests**: integración con DB tenant efímera
  (`prisma-feriado-cliente.repository.integration.spec.ts:27-50`: crear, migrar con
  `TenantMigrationRunnerAdapter`, dropear en `afterAll`); `usarLockMasterTest()` en specs que
  truncan `soporte_master_test` (`calendario-laboral-dias-check.integration.spec.ts:37`); e2e
  de la matriz de guards (`feriados-cliente.e2e.spec.ts`).

### 3. Migración para clientes existentes

- **2 tenants en producción** (consultar `SELECT nombre, db_name, activo FROM clientes` antes
  de tocar una base real).
- **Sembrado recomendado**: migración de datos en `prisma_tenant/migrations/` calcada de
  `seed_calendario_laboral_default` (lun-vie 540-1080, sáb/dom NULL, `ON CONFLICT DO NOTHING`)
  sobre una tabla nueva con el mismo shape y CHECK. Cero pasos manuales y cero cambio de
  comportamiento el día del deploy.
- **Tabla master**: queda sin lectores. Decisión abierta (deprecar sin dropear vs. dropear).
- **Tenants nuevos**: automático vía el `migrate deploy` del provisioning.
- **Cohorte SLA y tickets abiertos**: `calcularVenceAt()` solo corre en `alCrear` y
  `alReprioritizar`. El docstring (`aplicar-sla.use-case.ts:73-74`) ya dice "Los tickets ya
  abiertos no se recalculan al cambiar un feriado; solo al repriorizarse". Lo mismo aplica al
  horario: repriorizar después de un cambio recalcula con el horario nuevo, anclado al
  `createdAt` original (`alReprioritizar`, líneas 123-141). **Debe declararse como
  requerimiento explícito.**

### 4. Permisos

- Reusar el split de `feriados-cliente`: `JwtAuthGuard + TenantGuard` por clase, `GET` abierto,
  escritura con `AdminClienteGuard` por método. Sin entrada nueva en `CATALOGO_MODULOS`.
- Gates de frontend existentes: `useSession().isGlobalAdmin` / `esAdminCliente`
  (`frontend/src/shared/hooks/use-session.ts:53,61`).

### 5. Frontend

- Sin dependencia de fechas en `frontend/package.json` y no hace falta: el editor es una grilla
  fija de 7 filas (activo, apertura, cierre).
- La forma de UI se parece más a un catálogo de filas fijas editable-solo (como `Prioridad`,
  `EditarPrioridadUseCase`) que al CRUD de `FeriadosListView`.
- Zod espejo del DTO, como `frontend/src/features/feriados/schemas.ts:22-34`.

### 6. Reglas de validación

- `apertura < cierre` y rango `[0,1440]`: CHECK existente
  (`20260830210000_add_calendario_laboral/migration.sql:33-38`), se replica.
- **Al menos un día hábil**: **no existe hoy** como invariante. Regla nueva, necesaria:
  - No hay loop infinito: `buscarInicioVentanaAbierta` está acotado por
    `LIMITE_DIAS_BUSQUEDA = 400` (`calcular-sla-habil-vence.service.ts:87,129`) y **lanza**.
  - Pero `AplicarSlaListener` hace log-and-swallow (`SLA_APLICAR_ERROR`,
    `aplicar-sla.listener.ts:45-53,63-69`): un cliente con los 7 días cerrados deja **todos sus
    tickets HABIL nuevos con `sla_vence_at = null` en silencio**.
  - Por eso la regla vive en la capa de aplicación/dominio del ABM (bloquea el guardado). No es
    expresable como CHECK de fila.
- Intervalos superpuestos: no aplica con un intervalo por día.

### 7. Tests

- Calculador de SLA: ya cubre "calendario sin días abiertos"; no se toca si no cambia el tipo.
- Repositorio con `TenantContext` y fail-closed: patrón de `prisma-feriados-laborales.repository.spec.ts`.
- CHECK de Postgres: patrón de `calendario-laboral-dias-check.integration.spec.ts`, sobre la
  tabla tenant.
- Integración con DB tenant efímera y e2e de guards: patrones de feriados.
- Frontend: test de la vista, como `feriados-globales-admin-view.test.tsx`.

### 8. Ayuda

Escritura en pausa. Ningún artículo de `backend/ayuda/*.md` describe el horario 9-18 lun-vie
(búsqueda por "calendario", "horario", "SLA", "9-18", "lunes a viernes", "hábil"). **Ningún
artículo pasa a ser falso.** Solo se anota la deuda en commit y PR.

## Decisiones de producto abiertas

1. **Un intervalo por día o varios (pausa de almuerzo).** Recomendado: **uno**, igual que hoy.
   Reusa `VentanaLaboral` y el calculador sin tocarlos. No es regresión: el calendario global
   tiene la misma limitación.
2. **Quién edita.** Recomendado: **ADMINISTRADOR del cliente o ROOT** (`AdminClienteGuard`),
   como `/feriados`. Riesgo mitigado por la regla de "al menos un día abierto".
3. **SLA de tickets ya abiertos al cambiar el horario.** Recomendado: **no se recalcula al
   guardar**; se refleja al repriorizar. Declararlo como requerimiento. Recalcular en masa no
   tiene precedente en el código.
4. **Zona horaria.** Recomendado: **fija (Argentina)**. Hacerla por cliente exige rediseñar el
   servicio de dominio entero; queda como deuda si aparece un cliente fuera de AR.
5. **Default global en master.** Recomendado: **deprecar sin dropear** este ciclo (red de
   rollback) y corregir en el mismo cambio los docstrings "global, vive en MASTER".
6. **Forma del endpoint de escritura.** Recomendado: **un único endpoint que reemplaza las 7
   filas en una transacción**, validado como agregado. Un PATCH por día no puede garantizar
   "al menos un día abierto" sin carrera.

## Enfoques

1. **Tabla nueva en el schema tenant + swap del repositorio a `TenantContext`, sin unión
   (recomendado).** `CalendarioLaboralDiaCliente` con el mismo shape y CHECK, sembrada por
   migración de datos. El repositorio lee solo el tenant (fail-closed). Sin cambios en
   `AplicarSlaUseCase`, el calculador ni el token DI. Contra: la regla de "al menos un día"
   vive en la aplicación; la tabla master queda sin lectores. Esfuerzo medio.
2. **`clienteId` nullable en la tabla master.** Aislamiento solo lógico; contradice el
   invariante documentado (`schema.prisma:454-459`). Descartado, mismo criterio que feriados.
3. **Varios intervalos por día.** Exige rediseñar `VentanaLaboral` y el calculador. Fuera de
   alcance salvo decisión explícita.

## Estimación

| Área | Líneas (con tests) |
|---|---|
| Schema + migraciones tenant | ~80-120 |
| Dominio + validación de agregado | ~120-180 |
| Caso de uso + repositorio + mapper | ~180-250 |
| Controller + guards + DTOs + e2e | ~150-200 |
| Tests backend (CHECK, integración, unit) | ~200-280 |
| Frontend (grilla, hooks, Zod) | ~350-450 |
| Tests frontend | ~150-200 |
| **Total** | **~1230-1680** |

Con el criterio de tamaño del dueño, al menos 3-4 PRs, a detallar en `sdd-tasks`.

## Listo para propuesta

Sí, una vez confirmadas las decisiones abiertas.

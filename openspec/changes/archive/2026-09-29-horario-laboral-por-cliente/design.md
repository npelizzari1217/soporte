# Diseño: Horario laboral por cliente

> Insumos: [`proposal.md`](./proposal.md), [`specs/horario-laboral-cliente/spec.md`](./specs/horario-laboral-cliente/spec.md), [`exploration.md`](./exploration.md).
> **Desviación de presupuesto declarada**: la skill limita este artefacto a 800 palabras. Se excede
> por la misma causa que en `feriados-configurables`: el prompt de lanzamiento exige nueve decisiones
> verificadas contra el código, el mapa de capas (`rules.design`) y la división de PRs. El resto va
> en tablas.

## Enfoque técnico

Enfoque 1 de la exploración, calcado de `feriados-configurables`. Se agrega una tabla de inquilino
`calendario_laboral_dias_cliente` con el mismo shape y los mismos CHECK que la tabla de master, y se
siembra en la misma migración. `PrismaCalendarioLaboralSemanalRepository` pasa a leer esa tabla vía
`TenantContext`, falla cerrado y no hace unión con master. El token DI, el puerto de lectura,
`AplicarSlaUseCase` y `CalcularSlaHabilVenceService` conservan su firma. La escritura se hace con un
único `PUT` que reemplaza las 7 filas en una transacción de inquilino, validado como agregado por un
VO de dominio.

## Hallazgos que corrigen los insumos

| # | Afirmación previa | Verificado contra el árbol |
|---|---|---|
| H1 | Un fallo del SLA "se traga en silencio" (exploración §6, riesgo 1 de la propuesta) | **Desactualizado.** Desde D10 de `feriados-configurables`, `AplicarSlaListener` loguea `SLA_APLICAR_ERROR` vía `ILogger` (`aplicar-sla.listener.ts:45-53,63-69`). El fallo es **visible en el log**, aunque el ticket queda con `sla_vence_at = null`. La invariante de "al menos un día abierto" sigue siendo necesaria |
| H2 | El swap no afecta specs existentes | **FALSO.** Dos specs construyen el repositorio con `PrismaService`: `calendario-laboral.repositorios.integration.spec.ts:63` y `aplicar-sla-habil-feriados.e2e.spec.ts:184`. Con el constructor nuevo, el typecheck falla. Se corrigen en WU-3 |
| H3 | `migrate:tenants` llega a "todo tenant existente" | **Parcial.** Solo migra `activo = true AND deleted_at IS NULL` (`migrate-tenants.js:62`). El hueco lo cubre `ReactivarClienteUseCase`, que corre `migrationRunner.run()` al reactivar (`reactivar-cliente.use-case.ts:41`) |
| H4 | Solo hay que corregir los docstrings "global, vive en MASTER" | **Hay más.** Ver D8: 11 ubicaciones. Incluye `aplicar-sla-habil-feriados.e2e.spec.ts:18-21`, que además cita una migración inexistente (`20260824130000_add_calendario_laboral`; la real es `20260830210000`) |

## Mapa de capas (`rules.design`)

| Pieza | Capa | Por qué ahí |
|---|---|---|
| `HorarioLaboralSemanal` (VO), `horario-laboral.errors.ts`, `horario-laboral.constants.ts` | `calendario-laboral/domain` | Invariante del agregado sin framework. Es la fuente única que espejan el DTO, el CHECK y el Zod |
| `IHorarioLaboralEscrituraRepository` (nuevo). El puerto de lectura `ICalendarioLaboralSemanalRepository` no cambia | `domain/ports` | ISP: el SLA solo lee, igual que `IFeriadosLaboralesRepository` |
| `ObtenerHorarioLaboralUseCase`, `GuardarHorarioLaboralUseCase` | `application/use-cases` | Orquestación, `Result<T, DomainError>` y transacción vía `ITenantTransactionRunner` |
| Repositorio Prisma (lectura + `reemplazar`), mapper | `infrastructure/persistence/prisma` | Único lugar habilitado para Prisma (regla de ESLint) |
| `HorarioLaboralController`, DTOs | `interface` | HTTP y guards |

## Decisiones de arquitectura

| # | Decisión | Elección | Rechazado | Justificación |
|---|---|---|---|---|
| D1 | Tabla, migración, seed | `model CalendarioLaboralDiaCliente` → `calendario_laboral_dias_cliente`, mismos campos que `CalendarioLaboralDia` (`prisma_master/schema.prisma:477-485`). **Una sola** migración, `prisma_tenant/migrations/20260928150000_calendario_laboral_dias_cliente/` (convención `YYYYMMDDHHMMSS_snake`, posterior a `20260924130000_feriados_cliente`), con el CREATE, los dos CHECK y el seed. SQL abajo. **Timestamp distinto a propósito**: `20260928120000` ya lo usa `prisma_master/migrations/20260928120000_add_password_reset_tokens` en las ramas sin mergear `feat/reseteo-contrasena-olvidada-*`. Como viven en dirs de schema distintos no chocan, pero confunde al leer. La unicidad se verificó en `main` (`rg 20260928` sin resultados fuera de este diseño); las ramas no mergeadas no se inspeccionaron más allá de ese caso conocido | (a) Modelo `CalendarioLaboralDia` en tenant. (b) Tabla y seed en dos migraciones (`add_` + `seed_`, como en master) | (a) Dos tipos generados con el mismo nombre vuelven ambiguo el import del mapper (mismo criterio que D1 de feriados). (b) Si una se aplica y la otra no, queda una tabla vacía y el mapper lanza. Con un solo archivo, la tabla existe con sus 7 filas o la migración queda fallida y `deploy.ps1:213-214` (`AssertOk`) aborta el deploy |
| D2 | Alcance de la migración | Tenants existentes: `migrate-tenants.js:75-89` (`execFileSync` de `prisma migrate deploy` por tenant; el primer fallo corta con exit 1). Tenants nuevos: `TenantMigrationRunnerAdapter.run()` (`:48-55`) desde `ProvisionarTenantDatabaseUseCase` (`:49`), que compensa con `dropDatabase` si falla. Reactivados: `reactivar-cliente.use-case.ts:41` (H3). `TenantSeederAdapter` no se toca | Sembrar en `TenantSeederAdapter` | El seeder no corre sobre los tenants existentes. La migración cubre las tres rutas con un solo archivo |
| D3 | Tenant sin migrar o sin filas | **Visible, no silencioso.** Falta la tabla → `P2021`. Falta una fila → el mapper lanza (`prisma-calendario-laboral.mapper.ts:44-53`). Los dos casos terminan en `SLA_APLICAR_ERROR` con el id del ticket (H1). Mitigación: el `AssertOk` del deploy más el `upsert` de D6, que recompone las filas faltantes al primer guardado. **Declarado**: entre el fallo y la corrección, los tickets HABIL de ese tenant quedan sin vencimiento | Fallback a master o a un default en memoria | La spec lo prohíbe (fail-closed). Un default silencioso calcularía un vencimiento con un horario que el cliente no eligió |
| D4 | Swap del repositorio | `constructor(private readonly tenantContext: TenantContext)`. Sin `PrismaService`. `obtener()`: si `tenantContext.get()` es `undefined`, lanza `CalendarioLaboralSinTenantContextError extends Error`, en el mismo archivo y con el mismo criterio que `FeriadosSinTenantContextError` (`prisma-feriados-laborales.repository.ts:39-48,61-65`). Si hay contexto, `ctx.prismaClient.calendarioLaboralDiaCliente.findMany()` → mapper. El mapper tipa la fila en forma estructural (`{diaSemana; aperturaMinuto; cierreMinuto}`) y deja de importar `.prisma/master` para el calendario | `getClient()` genérico | Con el genérico no se puede testear específicamente. Mismo razonamiento que D3 de feriados |
| D5 | Consumidores con `TenantContext` | Único token: `CALENDARIO_LABORAL_SEMANAL_REPOSITORY` (`calendario-laboral.module.ts:60-63`, exportado en `:111`). Único inyector: `sla.module.ts:141` → `AplicarSlaUseCase.calcularVenceAt()` (`aplicar-sla.use-case.ts:191-199`). Lo disparan `ticket.creado` (emitido por `crear-ticket.use-case.ts:208`, `crear-ticket-soporte.use-case.ts:205`, `crear-ticket-edilicio.use-case.ts:194`, que corren bajo HTTP con `TenantGuard`, bajo `PreventivoSweepScheduler` en `tenantContext.run` en `preventivo-sweep.scheduler.ts:64`, o bajo `demo-seed.ts:320,667` en `run`) y `ticket.reprioritizado` (`editar-ticket.use-case.ts:112`, HTTP). El listener corre sincrónico y hereda el contexto (`aplicar-sla.listener.ts:6-12`). `SlaSweepScheduler` no lee el calendario (`sla.module.ts:160-177`). **Todos corren con un contexto vinculado** | — | Verificado con `rg` sobre los emisores de `TicketCreadoEvent`/`TicketReprioritizadoEvent`: solo hay esos cuatro. Los preventivos cortan antes de leer el calendario (`aplicar-sla.use-case.ts:165-172`), y aun así tienen contexto |
| D6 | Escritura atómica | `GuardarHorarioLaboralUseCase(repo, txRunner)`: `HorarioLaboralSemanal.crear(dto.dias)`; si falla → `Result.fail`, sin tocar la base. Si pasa → `txRunner.run(() => repo.reemplazar(horario))`, con 7 `upsert` por `diaSemana` sobre el cliente transaccional (`tenant-transaction-runner.ts:104-113`). Los `upsert` son **secuenciales (`for … await`, nunca `Promise.all`) y en orden fijo `dia_semana` 0→6 ascendente**. Así, dos `PUT` concurrentes toman los locks de fila en el mismo orden: el segundo espera al primero y no se puede dar un deadlock. **Semántica: gana el último que escribe.** Los dos payloads son completos y válidos, así que el resultado final es el horario completo del `PUT` que commitea último, nunca una mezcla por día. No hay control de versión optimista: el horario no tiene historial que proteger, y un 409 le daría al admin un error sin nada que reconciliar. Devuelve el horario leído después del commit | (a) `deleteMany` + `createMany` (`prisma-matriz-permisos.repository.ts:44-54`). (b) `$transaction` dentro del repositorio. (c) `PATCH` por día | (a) Sirve, pero pierde `created_at` sin necesidad. `upsert` además recompone filas faltantes (D3). (b) Los casos de uso de tenant usan `ITenantTransactionRunner` (`rechazar-item-compra.use-case.ts:2` y otros); el repositorio no abre transacciones. (c) No puede garantizar "al menos un día abierto" sin carrera (exploración, decisión 6) |
| D7 | Dominio del agregado | VO `domain/value-objects/horario-laboral-semanal.ts` (snippet abajo). Produce el `CalendarioLaboralSemanal` existente con `aCalendario()`. Reusa `VentanaLaboral`/`CalendarioLaboralSemanal` de `calcular-sla-habil-vence.service.ts:53-70` sin tocarlos | Entidad | Sin identidad propia: hay un horario por tenant y se reemplaza entero. Mismo criterio que `FechaCalendario` |
| D8 | Docstrings a corregir (WU-3) | `i-calendario-laboral-semanal.repository.ts:3-5` · `prisma-calendario-laboral-semanal.repository.ts:1-5` · `prisma-calendario-laboral.mapper.ts:1-4,30,48` (el mensaje nombra la tabla nueva; el regex de `mapper.spec.ts:65` sigue matcheando) · `calcular-sla-habil-vence.service.ts:12-13,51,60` · `aplicar-sla.use-case.ts:59-62,68-72,185-187` · `sla.module.ts:87-88` · `calendario-laboral.module.ts:2-9` · `prisma_master/schema.prisma:454-475` (D12) · `calendario-laboral.repositorios.integration.spec.ts:1-14` · `aplicar-sla-habil-feriados.e2e.spec.ts:18-21,29` · `calcular-sla-habil-vence.service.spec.ts:26` | Dejarlos para el archive | Un docstring que miente es un defecto, y estos mienten desde el momento del swap |
| D9 | Endpoint | `@Controller('horario-laboral') @UseGuards(JwtAuthGuard, TenantGuard)`. `GET` → 200 `{ dias }`, abierto a cualquier autenticado del tenant. `PUT` + `@UseGuards(AdminClienteGuard)` por método → 200 `{ dias }`. DTO → 400. Errores de dominio → **422** (precedente D7 de feriados). Sin token → 401; rol no-admin en el `PUT` → 403. El `GET` es la lectura del frontend: no hay otro endpoint | `POST`/`PATCH`; guard a nivel de clase | Un reemplazo total e idempotente es un `PUT`. Un guard a nivel de clase rompe la lectura abierta (ADR-P5, `admin-cliente.guard.ts:11-15`) |
| D10 | Autorización, dos lugares | **Borde:** D9. **Inline: ninguno, deliberadamente**; ninguna ruta lleva `clienteId`, y `TenantGuard` vincula el tenant desde el JWT. **Gotcha de Nest**: `@UseGuards(Clase)` instancia el guard por su cuenta y saltea cualquier provider `useFactory` con el mismo token (bug real de WU-4/WU-7 en `reseteo-contrasena-olvidada`). `AdminClienteGuard` no tiene dependencias (`admin-cliente.guard.ts:29-45`) y ya está como provider plano (`auth.module.ts:358`): **no se registra ningún factory para él**. El e2e ejercita el guard real, nunca `overrideGuard` | Chequeo inline | El aislamiento es estructural |
| D11 | SLA | `AplicarSlaUseCase`: **cero cambios de lógica**, solo docstrings (D8). `sla.module.ts` sin cambios de wiring: `useClass` resuelve `TenantContext` desde `SharedModule` (`@Global`), igual que `PrismaFeriadosLaboralesRepository`. Guardar no emite ningún evento, así que no recalcula nada (requerimiento de no-recálculo) | Recalcular los tickets abiertos | Decisión 3 del dueño |
| D12 | Master deprecada | Comentario en `schema.prisma:454-475`: "DEPRECADA desde `horario-laboral-por-cliente`: sin lectores, red de rollback, no dropear". Se borra la promesa de un ABM ROOT (`:474-475`). Prueba: `rg '\.calendarioLaboralDia\b' backend/src --glob '!*.spec.ts'` → 0 resultados (hoy da 1: `prisma-calendario-laboral-semanal.repository.ts:22`). Solo queda un lector de test: `calendario-laboral-dias-check.integration.spec.ts:178`, que prueba el CHECK de la tabla que se conserva | Dropear | Decisión 6 del dueño |
| D13 | Frontend | Feature `features/horario-laboral/`. Ruta `/horario-laboral` (`app/(dashboard)/horario-laboral/page.tsx`, Server Component fino, sin `layout.tsx`, como `/feriados/page.tsx`). Ítem de nav **justo después de `/feriados`** en `DEFAULT_SECTION_ITEMS` (`nav-config.ts:133-148`), `visible: () => true`, icono `Clock`. `RUTAS_PUBLICAS` (`middleware.ts:35`) **no cambia** | `/admin/horario-laboral` | `/admin/*` gatea por `esAdminCliente` y bloquearía la lectura (misma desviación que documenta `nav-config.ts:141-146`) |
| D14 | Grilla y conversión | Container `HorarioLaboralView` (`useHorarioLaboral`, `useGuardarHorarioLaboral`, `useSession().esAdminCliente`) → presentacional `HorarioLaboralForm` (RHF + `zodResolver`, props: `valoresIniciales`, `soloLectura`, `guardando`, `errorServidor`, `onGuardar`) → `HorarioLaboralFila` × 7 (checkbox "Abierto" + dos `<Input type="time">`). Solo lectura: inputs `disabled` y sin botón Guardar. La conversión HH:MM ↔ minutos vive en `features/horario-laboral/minutos.ts` (puro). En la columna **cierre**, `"00:00"` significa 1440 (fin del día); en apertura significa 0. El form trabaja con strings y `aDto()` convierte al enviar | Convertir en el componente; `type="text"` | Una función pura se testea sola. `type="time"` no puede expresar `24:00` y la regla del cierre cubre el rango `[0,1440]` de la spec |
| D15 | Zod espejo | `schemas.ts`: `diaFormSchema {diaSemana, abierto, apertura, cierre}` + `horarioLaboralFormSchema` con `.length(7)` y `superRefine`: si está abierto, las dos horas son obligatorias y `apertura < cierre` en minutos; `diaSemana` único; al menos un día abierto → error en la raíz: "Debe quedar al menos un día abierto." `limites.ts` copia `DIAS_POR_SEMANA`/`MINUTOS_POR_DIA` con un test centinela (precedente D9 de feriados) | — | Fuente única en el dominio (`rules.specs`) |
| D17 | Zona horaria fija Argentina (spec.md:174-184) | **Sin parámetro en ninguna capa.** `CalcularSlaHabilVenceService` sigue usando `OFFSET_ARGENTINA_MS`/`desplazarAArgentina` (`calcular-sla-habil-vence.service.ts:42-45`, `shared/domain/zona-horaria-argentina.ts`), sin cambios. `HorarioLaboralSemanal`, el DTO y el Zod no tienen campo de zona horaria. La tabla D1 no tiene columna de zona. Los minutos se documentan como "hora local Argentina" en el VO, en el DTO y en el comentario del modelo Prisma. El test de escenario ya existe: el spec del calculador cubre el offset fijo, y el e2e de WU-4 lo ejercita con anclas UTC (09:00 ART = 12:00Z) | Una columna `zona_horaria` por cliente, "por si acaso" | Decisión 4 del dueño. Una columna sin lectores sería una promesa falsa, y hacerla real exige rediseñar el calculador entero (exploración, decisión 4) |
| D18 | Precondición del deploy, automatizada | Script de solo lectura `backend/scripts/check-calendario-master-default.mjs`: lee `DATABASE_URL_MASTER` (`process.loadEnvFile()`, igual que `migrate-tenants.js:34-38`), corre la consulta de abajo con `pg` y sale con **exit 1 e imprime la diferencia** si las 7 filas no son exactamente el default, o si la tabla no existe. Se cablea en `deploy.ps1` como un paso nuevo, `Precondicion: calendario master = default`, **después de `Cargar backend/.env` (`:137`) y antes de `Detener servicios` (`:205`)**, con `AssertOk`. Así un fallo aborta el deploy **sin downtime y antes de cualquier migración**. El script es de solo lectura. El paso se retira en un follow-up después del primer deploy exitoso: a partir de ahí master queda sin lectores y el chequeo deja de proteger algo | Solo un paso manual en el runbook | **Justificación para tocar `deploy.ps1`**: esta precondición protege el vencimiento de SLA de producción, y un paso manual se saltea. El propio `deploy.ps1:46-50` documenta tres fallas del 2026-08-20 por pasos que "seguían de largo". Ya hay precedente de un script de `backend/scripts/` invocado desde `deploy.ps1` (`:252`). Costo: unas 45 líneas de script, unas 60 de spec unitario con la consulta inyectada (precedente `backfill-correo-clientes.spec.ts`) y unas 6 líneas en `deploy.ps1`, 100 % ASCII y sin BOM (§2.2 de `~/proyectos/CLAUDE.md`). No agrega ningún `.ps1` nuevo a la tabla de §2.2 |
| D16 | UX de errores (sin callejón sin salida) | El skeleton depende de `isLoading` (primera carga), **nunca de `isFetching`**. `ErrorState` con `onRetry={refetch}` **solo** cuando `isError && !data`. Un error de la mutación (400/422/500/red) **nunca desmonta el form**: se conservan los valores, se muestra un alert inline con el mensaje y se dispara `notifyError`. El botón se deshabilita solo mientras `isPending`. Al tener éxito: `invalidateQueries(["horario-laboral"])` + `reset(nuevos)` + `notifySuccess` | Reemplazar la vista ante cualquier error | El ciclo anterior tuvo un callejón sin salida. Un error de guardado debe dejar corregir y reintentar |

### SQL de la migración (D1)

```sql
CREATE TABLE "calendario_laboral_dias_cliente" (
    "dia_semana"      SMALLINT NOT NULL,
    "apertura_minuto" SMALLINT,
    "cierre_minuto"   SMALLINT,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ NOT NULL,
    CONSTRAINT "calendario_laboral_dias_cliente_pkey" PRIMARY KEY ("dia_semana"),
    CONSTRAINT "calendario_laboral_dias_cliente_dia_semana_check"
      CHECK ("dia_semana" BETWEEN 0 AND 6),
    CONSTRAINT "calendario_laboral_dias_cliente_ventana_check" CHECK (
      ("apertura_minuto" IS NULL AND "cierre_minuto" IS NULL) OR
      ("apertura_minuto" IS NOT NULL AND "cierre_minuto" IS NOT NULL
       AND "apertura_minuto" >= 0 AND "cierre_minuto" <= 1440
       AND "apertura_minuto" < "cierre_minuto")
    )
);
-- updated_at no tiene DEFAULT (@updatedAt): el INSERT raw lo setea explícito.
INSERT INTO "calendario_laboral_dias_cliente" ("dia_semana", "apertura_minuto", "cierre_minuto", "updated_at") VALUES
  (0, NULL, NULL, CURRENT_TIMESTAMP), (1, 540, 1080, CURRENT_TIMESTAMP),
  (2, 540, 1080, CURRENT_TIMESTAMP), (3, 540, 1080, CURRENT_TIMESTAMP),
  (4, 540, 1080, CURRENT_TIMESTAMP), (5, 540, 1080, CURRENT_TIMESTAMP),
  (6, NULL, NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("dia_semana") DO NOTHING;
```

"Al menos un día abierto" no es una restricción de fila: vive solo en D7.

## Flujo de datos

    ADMIN/ROOT A ─PUT /horario-laboral (Jwt+Tenant+AdminCliente)─→ GuardarHorarioLaboralUseCase
         ├─ HorarioLaboralSemanal.crear() ── falla → 422, cero escrituras
         └─ txRunner.run → repo.reemplazar: 7 upsert en la base de A (TenantContext)
    ticket.creado / ticket.reprioritizado (TenantContext A) → AplicarSlaListener → AplicarSlaUseCase
         └→ calendarioRepo.obtener(): solo la base de A (sin contexto → CalendarioLaboralSinTenantContextError)
                 └→ lanza: SLA_APLICAR_ERROR en el log, el ticket queda commiteado (H1)

## Interfaces / contratos

```ts
// domain/value-objects/horario-laboral-semanal.ts
export interface DiaHorarioEntrada { diaSemana: number; aperturaMinuto: number | null; cierreMinuto: number | null }
static crear(dias: readonly DiaHorarioEntrada[]): Result<HorarioLaboralSemanal, HorarioLaboralInvalidoError>;
// Orden de validación: length === 7 → diaSemana entero 0..6 y sin repetir (0..6 exactos)
// → por día: ambos null, o enteros con 0 <= apertura < cierre <= 1440 → al menos un día abierto.
aCalendario(): CalendarioLaboralSemanal;   // tupla indexada por diaSemana
// errors: HorarioLaboralDiasInvalidosError | VentanaLaboralInvalidaError(dia) | HorarioLaboralSinDiasAbiertosError (todos → 422)
// domain/ports/i-horario-laboral-escritura.repository.ts
reemplazar(horario: HorarioLaboralSemanal): Promise<void>;   // mismo Prisma repo; token alias vía useExisting
// HTTP: GET y PUT (body y respuesta)
{ dias: Array<{ diaSemana: 0|1|2|3|4|5|6; aperturaMinuto: number | null; cierreMinuto: number | null }> } // ordenado 0..6
```

DTO: `@IsArray @ArrayMinSize(7) @ArrayMaxSize(7) @ValidateNested({ each: true }) @Type(() => DiaHorarioLaboralDto)`,
con `@IsInt @Min(0) @Max(6) diaSemana` y minutos `@ValidateIf(v !== null) @IsInt @Min(0) @Max(1440)`
(precedente: `insumos.dto.ts:206-208`; `ValidationPipe` global con `whitelist, transform`, `app.module.ts:71`). Los números salen de `horario-laboral.constants.ts`.

## Estrategia de testing

| Capa | Qué | Cómo |
|---|---|---|
| Unitario | VO: cada rama de `crear` (6 días, 8 días, lunes repetido + domingo faltante, apertura ≥ cierre, un solo extremo null, 1441, −1, no entero, 7 cerrados) y el `aCalendario` exacto. `GuardarHorarioLaboralUseCase`: si el VO es inválido, `txRunner.run` **no se llama**. `reemplazar`: con un cliente espía, los 7 `upsert` salen en orden `diaSemana` 0→6 y cada uno empieza después de que termina el anterior (D6). `check-calendario-master-default`: con la consulta inyectada, exit 0 con el default, y exit 1 con una fila distinta, con 6 filas y con la tabla ausente (D18). Repo: `obtener()` sin contexto → `CalendarioLaboralSinTenantContextError`. Controller: metadata de guards con el modismo `?? []` (`modelos-equipo.controller.spec.ts:162`); `PUT` lleva `AdminClienteGuard`, `GET` no. Se **prueba por mutación** (borrar el decorador debe poner el test en rojo) | Puertos mockeados |
| Integración (DB tenant efímera) | Nuevo `calendario-laboral-dias-cliente-check.integration.spec.ts`: seed exacto de 7 filas, cada violación de CHECK, `dia_semana = 7`, y re-ejecutar el INSERT del seed no pisa una fila editada (`ON CONFLICT`). `calendario-laboral.repositorios.integration.spec.ts` migra los casos del calendario de master a la tenant (lectura del seed, fila faltante → lanza, fail-closed) y agrega `reemplazar` dentro de un `PrismaTenantTransactionRunner` real: si algo lanza después de los upserts, las 7 filas siguen como estaban | Patrón `prisma-feriado-cliente.repository.integration.spec.ts:62-79` (`conContexto` vía `run()`). `usarLockMasterTest()` solo donde se toca `soporte_master_test` |
| E2E SLA | **Sin cambio al desplegar**: `aplicar-sla-habil-feriados.e2e.spec.ts` solo cambia el constructor del repositorio (tenant) y conserva **idénticos** sus vencimientos esperados (`2031-04-11T21:00:00.000Z`, `2031-04-14T21:00:00.000Z`), que antes salían del calendario de master. Nuevo `aplicar-sla-horario-cliente.e2e.spec.ts` (tenants A y B, `createdAt` lunes 2031-04-07 12:00Z, prioridad de 8h): se crea el ticket en A con el default → `2031-04-07T20:00Z`; A pasa a lun-vie 480-720 por SQL directo → el `sla_vence_at` de ese ticket **no cambia**; se repriorizea → `2031-04-09T12:00Z`, anclado al `createdAt` original; un ticket nuevo en A usa el horario nuevo; un ticket de B con el mismo `createdAt` → `2031-04-07T20:00Z` (aislamiento) | Cableado manual, igual que `aplicar-sla-habil-feriados.e2e.spec.ts:173-187`. **`usarLockMasterTest()` obligatorio**: lee los feriados de master, y el spec hermano inserta temporalmente un global el 2031-04-08, que cae dentro de la ventana repriorizada |
| E2E HTTP | `horario-laboral.e2e.spec.ts`: 401 en `GET`/`PUT`; 200 en el `GET` para un no-admin; 403 en su `PUT`; 200 para ADMINISTRADOR y ROOT; 422 con 7 cerrados y 422 con un día repetido, y en los dos casos un `GET` posterior devuelve el horario sin cambios; 400 con 6 días; A guarda → el `GET` de B devuelve el default | Harness de `feriados-cliente.e2e.spec.ts`. Higiene: borrar filas de `clientes` → `app.close()` → `onModuleDestroy()` → `dropDatabase` |
| Frontend | `minutos` (ida y vuelta, cierre `00:00` = 1440), `schemas` (7 cerrados, apertura ≥ cierre, día repetido), centinela de `limites`, `nav-config` (el ítem es visible para cualquier rol). Vista: admin puede editar; no-admin, solo lectura; 7 cerrados muestra el mensaje y la API **no se llama**; un 422 y un 500 dejan el form con sus valores; un error de carga muestra `ErrorState` y el retry vuelve a pedir los datos | Vitest + Testing Library |
| Adversarial (verify) | Quitar el fail-closed; quitar la regla de día abierto del VO; quitar `AdminClienteGuard` del `PUT`; cambiar el seed de lunes a 600; cambiar `reemplazar` a `Promise.all`; hacer que el guard de D18 acepte cualquier `apertura` del lunes. Cada mutación debe dar rojo | `rules.verify` |

## Matriz de amenazas

N/A: sin shell, subprocess, automatización de VCS/PR, clasificación de archivos ejecutables ni límite
de integración de procesos en el código de la aplicación (la migración usa el runner existente, sin cambios). El paso de D18 es un script de operaciones de solo lectura, sin entrada del usuario, con la misma forma que `backfill-correo-clientes.mjs` en `deploy.ps1:252`. Aislamiento,
fail-closed y guards se cubren en D4, D9 y D10, cada uno con su test adversarial.

## Migración / despliegue

1. **Precondición (D18)**: la master de producción tiene que seguir en 9-18 lun-vie. Si no, el seed
   cambiaría el comportamiento. `deploy.ps1` la chequea sola con el paso de D18. Para chequearla a mano en
   el VPS: `cd C:\soporte\backend; node scripts/check-calendario-master-default.mjs` (exit 0 = OK). Si
   no, correr esta consulta de solo lectura contra la master con cualquier cliente SQL:

   ```sql
   SELECT dia_semana, apertura_minuto, cierre_minuto
   FROM calendario_laboral_dias ORDER BY dia_semana;
   ```

   Salida esperada, exacta (7 filas):

   ```text
    dia_semana | apertura_minuto | cierre_minuto
   ------------+-----------------+---------------
             0 |                 |
             1 |             540 |          1080
             2 |             540 |          1080
             3 |             540 |          1080
             4 |             540 |          1080
             5 |             540 |          1080
             6 |                 |
   ```

   Cualquier diferencia **detiene el deploy**. Para cambiar el seed de D1 hace falta una decisión del
   dueño.

   **El runbook lo escribe WU-1b, en el mismo commit.** soporte versiona su propio
   `DEPLOY-VPS-runbook.md` en la raíz del repo (es el que documenta `deploy.ps1`; la copia de la
   raíz `proyectos` es otro archivo). WU-1b suma el paso nuevo en "Qué hace, en orden" y la
   consulta con su salida esperada en "Preflight que conviene correr antes", indicando que
   `deploy.ps1` ya lo verifica y que el chequeo manual sirve de diagnóstico si el paso aborta.
2. `deploy.ps1:212-214` corre `migrate:tenants` antes de levantar los servicios, y `AssertOk` aborta
   si algún tenant falla (D1-D3).
3. Rollback: se revierte con `git revert` en orden inverso. Master sigue intacta; la tabla tenant es
   aditiva.

## División de la entrega (`sdd-tasks` refina)

**PRs encadenados: Sí** (stacked-to-main, lineal). Las estimaciones ya incluyen tests, JSDoc y ~15
líneas de openspec por PR. El histórico da un tamaño real de 1.5-2x lo estimado, así que se apunta a
≤250 por unidad.

| WU | Contenido | Est. | Depende de |
|---|---|---|---|
| 1 | Modelo tenant, migración (D1) y su spec de CHECK/seed | ~200 | — |
| 1b | Guard de precondición (D18): script, su spec, el paso en `deploy.ps1` y el runbook de soporte (`DEPLOY-VPS-runbook.md`). **Debe estar en `main` antes que WU-3** | ~130 | — |
| 2 | VO, errores, constantes + unitarios | ~250 | — |
| 3 | Swap del repo (D4) + fail-closed + mapper, corrección de H2 en los dos specs, docstrings (D8) y deprecación en master (D12). **Es el cambio de comportamiento** | ~230 | 1, 1b |
| 4 | `aplicar-sla-horario-cliente.e2e.spec.ts` (no-recálculo, repriorización, aislamiento) | ~220 | 3 |
| 5 | Puerto de escritura, `reemplazar` (orden 0→6 secuencial, D6), los dos casos de uso, unitarios + integración de atomicidad y orden | ~260 | 2, 3 |
| 6a | Controller, DTOs, wiring, spec unitario de guards | ~240 | 5 |
| 6b | `horario-laboral.e2e.spec.ts` (matriz de guards y aislamiento A/B) | ~230 | 6a |
| 7 | Front: `types`, `api`, `limites`, `minutos`, `schemas`, hooks + tests | ~240 | 6a |
| 8a | `HorarioLaboralForm`/`Fila` presentacionales + tests | ~240 | 7 |
| 8b | `HorarioLaboralView`, página, nav + tests de vista y nav. Deuda de Ayuda anotada | ~240 | 8a |

El seam de 6a/6b separa el e2e de un controller que ya lleva su spec unitario (mismo corte que WU4c en
feriados), así que no hace falta `size:exception`. Si WU-2 o WU-5 superan las 400 líneas reales, se
cortan tests por clase de error; nunca se separa el código de sus tests. El Punto 5 pasa a Cumplida
(con `check-roadmap-fresco.mjs`) en el **archive**, no en un WU.

## Preguntas abiertas

Ninguna bloqueante. La suposición del despliegue (master en el default) queda automatizada por D18.
Queda como follow-up retirar ese paso de `deploy.ps1` después del primer deploy exitoso.

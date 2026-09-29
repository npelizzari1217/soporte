# Design: catálogo único para los componentes de equipo

## Technical Approach

El camino vinculado ya existe y ya es correcto (`agregar-componente.use-case.ts:127-163`,
`obtener-equipo.use-case.ts:115-123`). El ciclo **borra el segundo camino** en vez de construir
uno nuevo: todo componente entra por un insumo repuesto, su tipo sale de `insumo.familia`, y
el catálogo MASTER, su módulo y su pantalla desaparecen.

Cuatro movimientos, en este orden:

1. **Limpieza operativa** de las 12 filas con `insumo_id NULL` (9 vivas, 3 borradas
   lógicamente), con un script de Node que se entrega **antes** que el resto (ADR-3).
2. **Backend de equipos en un solo camino**: alta con `insumoId` obligatorio y
   `descontarStock` (ADR-1), edición sin tipo ni insumo, lectura solo por familia.
3. **Contrato del esquema tenant**: migración fail-closed en una sola sentencia (ADR-4).
4. **Retiro** de `tipos-componente` (backend, frontend, navegación) y DROP de la tabla MASTER
   en el mismo release (ADR-5).

Specs de referencia: `specs/componentes-catalogo-unico/spec.md` y el delta de
`specs/repuestos-autoridad-catalogo/spec.md`.

---

## Capa donde cae cada pieza (`rules.design`)

| Pieza | Capa | Por qué ahí |
|---|---|---|
| `ComponenteEquipoEntity` sin `tipoComponenteCodigo`, `insumoId: string` | domain | La obligatoriedad del vínculo es invariante del componente, no del borde |
| Guards de insumo y familia; derivación del tipo | application (`AgregarComponenteUseCase`) | Necesitan repositorios; ya viven ahí y se conservan |
| Atomicidad componente + SALIDA | application (`InstalarComponenteDesdeDepositoUseCase`, sin cambios de lógica) | Mecanismo S36 ya probado (issue #153) |
| Elección entre los dos casos de uso según `descontarStock` | interface (controller) | Es enrutamiento por un campo del request; ver ADR-1 |
| Default `descontarStock = true` | interface (DTO + controller) | Es contrato HTTP, lo fija la spec ("cuando se omite") |
| Migración con guard | infrastructure (`prisma_tenant/migrations`) | La exigencia entre tablas (`es_repuesto`) no es expresable como CHECK: queda en application |
| Script de limpieza | operación (`backend/scripts/`) | One-off, fuera de Prisma, mismo patrón que `drop-legacy-rbac-matriz-vieja.mjs` |
| Zod del diálogo | interface del frontend | Regla derivada: la autoridad es el DTO del backend |

**Autorización, sus dos lugares.** Borde: `@RequiereAcciones('EQUIPOS:ALTAS')` en
`POST :id/componentes` (las dos ramas de ADR-1 quedan bajo la misma acción, igual que hoy) y
`EQUIPOS:MODIFICACION` en el PATCH; los 5 endpoints ROOT con `GlobalAdminGuard` se borran con
el módulo. Inline: no hay chequeos dentro de los métodos que cambien; en el frontend se borran
la entrada ROOT de `nav-config.ts:181-185` y el `layout.tsx` que gatea la ruta retirada. Sin
permiso nuevo: la consecuencia ya aceptada en #153 (quien tiene `EQUIPOS:ALTAS` descuenta stock
sin permisos de INSUMOS) no cambia.

---

## Architecture Decisions

### ADR-1: un solo endpoint de alta con `descontarStock`; se retira `instalar-desde-deposito`

**Choice**: `POST /equipos/:id/componentes` recibe `insumoId` (obligatorio) y
`descontarStock?: boolean`. El controller resuelve `dto.descontarStock ?? true`: con `true`
llama a `InstalarComponenteDesdeDepositoUseCase` (usuario desde `@CurrentUser()`); con `false`,
a `AgregarComponenteUseCase`. La ruta `POST :id/componentes/instalar-desde-deposito` se borra.
El frontend manda siempre el valor explícito, nunca depende del default.

| Opción | Costo | Decisión |
|---|---|---|
| A. Dos endpoints; el diálogo elige cuál llamar | Diff mínimo | **Rechazada**: la spec exige que un alta *sin indicar* `descontarStock` descuente. Con A, `POST /componentes` sin el campo no descuenta y el escenario "Descuento por defecto" falla |
| B. Un endpoint, rama en el controller | Retargetear el e2e de instalación | **Elegida** |
| C. Un caso de uso nuevo que orqueste las dos ramas | Archivo y spec nuevos para un `if` | Rechazada: los dos casos de uso ya existen con semántica cerrada. `Instalar...` con `descontar=false` contradiría su nombre |
| D. `descontarStock` dentro de `AgregarComponenteUseCase` | Invierte la dependencia (hoy `Instalar` envuelve a `Agregar`) | Rechazada |

`@IsOptional() @IsBoolean()` sin conversión implícita (el `ValidationPipe` global no usa
`enableImplicitConversion`): un `"false"` en texto vuelve 400, nunca se lee como verdadero.
El próximo cambio (`stock-usado-componentes`) suma la elección del saldo a la rama con
descuento; queda localizada en `Instalar...`.

### ADR-2: un `tipoComponenteCodigo` sobrante se IGNORA, no se rechaza

**Choice**: los DTO dejan de declarar el campo y el `ValidationPipe` global
(`app.module.ts:73`, `whitelist: true`, sin `forbidNonWhitelisted`) lo descarta en silencio.
Vale para el POST y para el PATCH, y también para un `insumoId` enviado en el PATCH.

**Rationale**:
- Es la convención del repo, con tests que la fijan: `codigo` en `POST /insumos`
  (`insumos.dto.spec.ts:95`) y `clienteId` en usuarios (`usuarios.controller.spec.ts:386`).
- Rechazar exigiría `forbidNonWhitelisted`. Global, rompe clientes de todos los módulos; por
  ruta, crea el único pipe distinto del repo.
- Compatibilidad en el deploy: una pestaña con el bundle viejo manda `tipoComponenteCodigo`
  en **cada** PATCH (`componente-edit-dialog.tsx:78`). Si se ignora, la edición sigue
  funcionando. Si se rechaza, esa pestaña recibe 400 hasta recargar.
- La spec solo exige que el campo no defina el tipo, y eso se cumple por construcción.

**Consecuencia**: `ComponenteVinculadoTipoInmutableError` se elimina y el catálogo de errores
de equipos queda en **13 clases**.

### ADR-3: la limpieza es un script de Node entregado antes, más una precondición de solo lectura en `deploy.ps1`

**Choice**: `backend/scripts/limpiar-componentes-sin-insumo.mjs` (ESM, `pg` directo, sin leer
`dist/`). Recorre el mismo conjunto de tenants que `migrate-tenants.js:62`, con la misma
derivación de URL (`tenantUrl`).

| Modo | Efecto | Exit |
|---|---|---|
| sin flags (reporte) | Lista por tenant cada fila con `insumo_id NULL`: id, equipo, `tipo_componente_codigo` y "viva" o "borrada lógicamente el …"; totales vivas y borradas; clientes fuera del recorrido (inactivos o borrados) | 0 sin filas · 2 con filas |
| `--apply --esperadas=N` | Recuenta; si el total ≠ N, aborta **sin borrar nada**. Si coincide, por tenant: `DELETE … WHERE insumo_id IS NULL RETURNING id` en una transacción; si los ids difieren de los inventariados, `ROLLBACK` y aborta | 0 ok · 1 error o desacuerdo |

`--esperadas` obliga a que el operador escriba el número que vio en el reporte: si producción
cambió entre la medición y el borrado, no se borra nada.

**Cómo llega al VPS**: WU-1 es un PR **independiente a `main`** que se despliega en un deploy
ordinario, antes de que la cadena se integre. Así el dueño ve el reporte de producción (incluidas
las 3 filas borradas lógicamente) antes de cualquier `--apply`, y en la ventana de migración el
script ya está en disco.

**Precondición en `deploy.ps1`** (en WU-7, dentro de la cadena): un paso nuevo, inmediatamente
después de "Cargar backend/.env" y **antes** de `prisma generate` y de los builds, que corre
`& $NodeExe scripts/limpiar-componentes-sin-insumo.mjs` en modo reporte, seguido de
`AssertOk`. Si quedan filas, el deploy corta con `dist/` intacto: los servicios arrancan con el
código viejo contra el esquema viejo, y la base queda consistente. Sin este paso, un operador
que se salte la limpieza haría abortar la migración a mitad del recorrido de tenants, con unos
tenants migrados y otros no, y Prisma marcaría la migración como fallida (P3009) en ese tenant.
Es el mismo patrón de la precondición D18, que se agregó y luego se retiró
(`DEPLOY-VPS-runbook.md:83-91`); esta también se retira en un cambio posterior.

| Alternativa | Por qué no |
|---|---|
| SQL manual por tenant | Depende de la disciplina del operador y no queda registro de qué se borró |
| La migración borra las filas | Prohibido: "nunca borra en silencio" |
| `.ps1` nuevo | Obligaría a mantenerlo en ASCII sin BOM y a registrarlo en la tabla §2.2. Node ya corre en el VPS (`$NodeExe`) |
| `git pull` manual antes de `deploy.ps1` para traer el script | El hash de lockfiles de `deploy.ps1:145-149` se tomaría después del pull y dejaría de detectar un lockfile cambiado |
| Solo el guard de la migración, sin precondición | Deja el estado parcial P3009 descripto arriba |

### ADR-4: la migración tenant es UNA sentencia `DO $$`, guard y DDL juntos

```sql
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM "componentes_equipo" WHERE "insumo_id" IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'componentes_equipo: % fila(s) con insumo_id NULL (incluye borradas logicamente). Correr scripts/limpiar-componentes-sin-insumo.mjs', n;
  END IF;
  ALTER TABLE "componentes_equipo" ALTER COLUMN "insumo_id" SET NOT NULL;
  DROP INDEX "componentes_equipo_tipo_componente_codigo_idx";
  ALTER TABLE "componentes_equipo" DROP COLUMN "tipo_componente_codigo";
END $$;
```

**Rationale**: una sentencia es atómica sin depender de que Prisma envuelva o no la migración
en una transacción. El guard cuenta **todas** las filas, sin filtrar por `deleted_at`, porque
el NOT NULL también las alcanza. La FK `RESTRICT` no se toca. Una tabla vacía pasa el guard.
El nombre del índice está verificado en `20260810130000_add_componente_tipo_codigo/migration.sql:9`. Se
rechaza el guard en una sentencia y el DDL en otras: sin transacción envolvente, un fallo
intermedio dejaría el esquema a medias.

### ADR-5: DROP de MASTER `tipos_componente` en el mismo release, última unidad de trabajo

**Choice**: migración master nueva `DROP TABLE "tipos_componente"`, sin `rollback.sql`.

**Rationale**: el precedente de mantener la tabla como red (`calendario_laboral_dias`) servía
porque aquel lado tenant era aditivo y el código viejo podía volver. Acá el DROP de
`tipo_componente_codigo` ya obliga a restaurar el dump ante cualquier revert, así que conservar
la tabla MASTER no hace posible ningún rollback y deja código y esquema muertos. Sin
`rollback.sql`: ROOT editó el catálogo en producción, así que recrearlo desde el seed original
restauraría datos falsos. La restauración fiel es el dump. Va última porque los specs de
integración del módulo retirado leen la tabla: primero se borra el código.

### ADR-6: forma de las respuestas

- `ComponenteResponseDto` (POST, PATCH, reactivar): **sin** `tipoComponenteCodigo`;
  `insumoId: string`. Ningún consumidor usa el tipo de esa respuesta: las mutaciones invalidan
  `["equipo", id]` (`use-equipo-mutations.ts:75,145,161`).
- `ComponenteConTipoResponseDto` (embebido en `GET /equipos/:id`): conserva `tipoNombre` y
  `tipoActivo`, ahora siempre desde la familia. No se agrega un campo de código: el `insumo_id`
  NOT NULL con FK garantiza la familia, y el fallback de display pasa a `"—"`.

### ADR-7: entrega

WU-1 va directo a `main` (ADR-3). El resto va en una **Feature Branch Chain** con tracker
`feat/catalogo-unico-componentes`, que se integra a `main` una sola vez y se despliega en una
sola ventana. Los estados intermedios no son desplegables (por ejemplo, un backend sin texto
libre frente a un frontend que todavía lo ofrece), y cada migración irreversible tiene que
viajar con su código. Cada WU queda en verde y se puede revertir dentro del tracker.

---

## Data Flow

```
Alta (diálogo único)
  ComponenteCreateDialog ── insumoId, descontarStock(true por defecto), serie, capacidad
        │ POST /equipos/:id/componentes
        ▼
  EquiposController ── descontarStock ?? true
        ├─ true  → InstalarComponenteDesdeDepositoUseCase ─ tx ─┬ AgregarComponenteUseCase (guards, tipo = familia)
        │                                                       └ RegistrarSalidaInsumoUseCase (1 u., equipoId)
        └─ false → AgregarComponenteUseCase (sin movimiento)

Lectura
  ObtenerEquipoUseCase ── findFamiliasDeInsumos(insumoIds) ── tipoNombre, tipoActivo   (MASTER no participa)

Ventana de deploy
  predeploy-dump.ps1 (servicios detenidos)
    → node scripts/limpiar-componentes-sin-insumo.mjs         reporte: esperar 12, revisar
    → … --apply --esperadas=12                                borra
    → deploy.ps1: pull → precondición (reporte, exit 0) → build → migrate:master (DROP)
                  → migrate:tenants (guard + NOT NULL + DROP) → arranque
```

---

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `backend/scripts/limpiar-componentes-sin-insumo.mjs` (+`.spec.ts`, `.integration.spec.ts`) | Create | ADR-3 |
| `DEPLOY-VPS-runbook.md` | Modify | Sección "Precondición: componentes sin repuesto" (WU-1) y paso de `deploy.ps1` + recuperación P3009 (WU-7) |
| `deploy.ps1` (+`scripts/deploy.ps1.spec.ts`) | Modify | Precondición de solo lectura, ASCII |
| `backend/prisma_master/seeds/demo-seed.ts` (+ spec) | Modify | Crea 2 insumos (`CrearInsumoUseCase`, familias `RAM` y `SSD`, unidad `UNI`) y los agrega con `insumoId` sin descuento |
| `backend/src/equipos/application/use-cases/agregar-componente.use-case.ts` (+spec) | Modify | Un camino; sin `ITipoComponenteMasterChecker` |
| `.../editar-componente.use-case.ts`, `.../obtener-equipo.use-case.ts` (+specs) | Modify | Sin tipo; lectura solo por familia |
| `.../instalar-componente-desde-deposito.use-case.ts` | Modify | Solo JSDoc (ya no hay "chequeo MASTER") |
| `backend/src/equipos/interface/dtos/equipos.dto.ts`, `controllers/equipos.controller.ts` (+specs) | Modify | ADR-1, ADR-2, ADR-6; mapeo de errores |
| `backend/src/equipos/interface/controllers/equipos-instalar-desde-deposito.e2e.spec.ts` | Modify | Retargeteado a `POST :id/componentes`; suma casos `false` y omitido |
| `backend/src/equipos/domain/errors/equipos.errors.ts` | Modify | −3 clases (13) |
| `backend/src/equipos/domain/entities/componente-equipo.entity.ts`, mapper, `equipos.module.ts` | Modify | `insumoId: string`; `create()` conserva `Result` (patrón ADR-9) y falla con `InsumoRepuestoInexistenteError` ante un `insumoId` vacío |
| `backend/prisma_tenant/schema.prisma` + migración nueva (+ integration spec en base efímera) | Modify/Create | ADR-4 |
| `backend/scripts/backfill-tipos-componente-codigo.js`, `backend/eslint.config.js:287,343` | Delete/Modify | One-off ya cumplido |
| `backend/src/tipos-componente/**`, `app.module.ts:7`, checker, puerto, `listar-tipos-componente.use-case.ts` | Delete | Retiro |
| `backend/prisma_master/schema.prisma` + migración DROP | Modify/Create | ADR-5 |
| `frontend/src/features/equipos/components/componente-create-dialog.tsx` (+test) | Modify | Repuesto obligatorio y `Checkbox` "Descontar del depósito" marcado; siempre `POST /componentes` |
| `.../componente-instalar-dialog.tsx` (+test) | Delete | Absorbido |
| `.../componente-edit-dialog.tsx`, `equipo-componentes-section.tsx`, `equipo-detail-view.tsx`, `ordenar-componentes.ts` (+tests) | Modify | Edición sin tipo (el tipo se muestra como texto); fallback `"—"`; un solo botón |
| `frontend/src/features/equipos/{schemas,types}.ts`, `hooks/use-equipos.ts`, `hooks/use-equipo-mutations.ts` (+tests) | Modify | `agregarComponenteSchema` (reemplaza a `instalarComponenteSchema`) y `editarComponenteSchema`; sin `useTiposComponente` ni `useInstalarComponenteDesdeDeposito`; `useAgregarComponente` invalida también stock y movimientos |
| `frontend/src/features/tipos-componente/**`, `app/(dashboard)/admin/tipos-componente/**` | Delete | Retiro |
| `frontend/src/shared/nav/nav-config.ts` (+test), comentarios de `root-access.ts`, `root-layout-gate.ts` y `feriados-globales` | Modify | Entrada y menciones |
| `AGENTS.md:208` y `:216-220` | Modify | :208 cita `tipoActualFueraDeCatalogo` de `componente-edit-dialog`, que desaparece: pasa a citar la prioridad del ticket (:212). :216-220: los 8 campos quedan en 6, con la aclaración de que los 2 de `tipos-componente` dejaron de existir |
| `backend/ayuda/*.md` | Sin cambios | Pausa vigente; la deuda se anota en el commit y el PR |

---

## Interfaces / Contracts

```ts
// POST /equipos/:id/componentes
export class CreateComponenteHttpDto {
  @IsUUID() insumoId!: string;
  @IsOptional() @IsBoolean() descontarStock?: boolean; // omitido = true
  // descripcion, numeroSerie, capacidad: sin cambios
}
// PATCH /equipos/:id/componentes/:componenteId: solo descripcion, numeroSerie, capacidad

export interface AgregarComponenteDto {
  equipoId: string; insumoId: string;
  descripcion?: string | null; numeroSerie?: string | null; capacidad?: string | null;
}
```

```ts
// frontend
agregarComponenteSchema = z.object({ insumoId: z.string().uuid(...), descontarStock: z.boolean(), /* 3 textos */ });
interface Componente { /* … */ insumoId: string }   // sin tipoComponenteCodigo
```

---

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Unit | Agregar: cada guard con su error y la ausencia de dependencia MASTER. Editar: un `tipoComponenteCodigo` o un `insumoId` sobrantes no cambian nada. Obtener: `tipoActivo` desde la familia | Specs de use case con fakes |
| Unit (borde) | El DTO sin `insumoId` da 400; `"false"` en texto da 400; los campos sobrantes se descartan (`validate(dto, { whitelist: true })`, molde de `insumos.dto.spec.ts:95`). Controller: omitido o `true` llama a Instalar, `false` llama a Agregar | `equipos.dto.spec.ts`, `equipos.controller.spec.ts` |
| Unit (script) | Parseo de flags; un `--apply` sin `--esperadas` o con un número distinto no borra | `limpiar-componentes-sin-insumo.spec.ts` |
| Integración | Script: filas viva, borrada y vinculada; el reporte cuenta 2, un `--apply` con un número incorrecto no borra, con el correcto borra solo las 2 NULL. Migración: aborta con una fila viva, aborta con una fila solo borrada, pasa con la tabla vacía, y al pasar deja NOT NULL, sin columna, sin índice y con la FK | Base tenant **efímera** reproducida hasta `20260928150000` (molde `backfill-correo-clientes.integration.spec.ts`). No usa `soporte_master_test`, así que no lleva lock |
| Integración | Repositorio y concurrencia con fixtures de insumo | `prisma-equipos.integration.spec.ts`, spec de concurrencia |
| E2E | Omitido: componente y SALIDA. `false`: sin movimiento. Sin stock: nada queda escrito. Ruta vieja: 404. Endpoints de `tipos-componente`: 404 | e2e retargeteado; ya trunca `soporte_master_test` con `usarLockMasterTest()` (`:108`). Todo spec nuevo que trunque esa base lo llama |
| Frontend | Casilla marcada por defecto; el payload lleva `descontarStock` explícito en los dos estados; edición sin selector de tipo; navegación sin entrada | MSW + `renderWithProviders` |
| Adversarial (verify) | Quitar el guard de la migración ⇒ rojo; invertir el default ⇒ rojo | `rules.verify` |

---

## Threat Matrix

El único cambio de proceso es un paso de `deploy.ps1` que invoca `node` en solo lectura. Sus
casos seguro y de falla están en ADR-3 (exit 2 ⇒ `AssertOk` corta antes del build) y se cubren
en `deploy.ps1.spec.ts` y `ps1-ascii.spec.ts`.

| Boundary | Applicability |
|---|---|
| Documentation-like paths | N/A: no clasifica ni ejecuta archivos por nombre |
| Git repository selection | N/A: no toca el `git pull` de `deploy.ps1` |
| Commit state | N/A: sin automatización de commits |
| Push state | N/A: sin push |
| PR commands | N/A: sin automatización de PR |

---

## Migration / Rollout

1. Deploy ordinario con WU-1. El dueño corre el reporte en producción y confirma las 12 filas
   (9 vivas y 3 borradas, en Cic Lanus y Santa Cruz).
2. Ventana: `predeploy-dump.ps1 -DryRun`, luego la corrida real (servicios detenidos) → reporte
   → `--apply --esperadas=12` → reporte con exit 0 → `deploy.ps1`.
3. Verificación: `\d componentes_equipo` en un tenant; `tipos_componente` ausente en master.

**Rollback**: código con `git revert` del merge del tracker (y de WU-1 si se quiere). Datos: el
DROP de la columna, el de la tabla MASTER y el borrado de las 12 filas **solo se revierten
restaurando el dump** (runbook, "Restore de datos"). Revertir el código sin restaurar deja
código viejo contra esquema nuevo. Si la precondición corta, no cambió nada. Si igualmente
falla la migración de un tenant (P3009): se limpia ese tenant y se corre
`prisma migrate resolve --rolled-back <migración>` con `DATABASE_URL_TENANT` de ese tenant;
después se re-corre `deploy.ps1`. El runbook lo documenta.

---

## Work Units y presupuesto de revisión

| # | Unidad | Destino | Estimación (líneas +/−) |
|---|---|---|---|
| 1 | Script de limpieza, tests y sección del runbook | `main` | ~330 |
| 2 | demo-seed con repuestos (camino vinculado de hoy) | tracker | ~90 |
| 3 | Alta de un camino, capa de aplicación | tracker | ~380 (reescribe un spec de 536 líneas) |
| 4 | Alta, borde HTTP: `descontarStock`, retiro de la ruta, e2e | tracker | ~350 |
| 5 | Edición y lectura sin tipo; −3 errores | tracker | ~380 |
| 6 | Contrato del esquema tenant: migración, schema, entidad, mapper, specs | tracker | ~400 (riesgo) |
| 7 | Operación: precondición en `deploy.ps1`, runbook, borrado del backfill | tracker | ~200 |
| 8 | Frontend: diálogo único | tracker | ~380 |
| 9 | Frontend: edición y display | tracker | ~300 |
| 10 | Retiro backend de `tipos-componente` | tracker | borrado puro, por encima de 400 |
| 11 | Retiro frontend de `tipos-componente` | tracker | borrado puro |
| 12 | DROP MASTER y `AGENTS.md` | tracker | ~60 |

Orden obligatorio: 3 → 4 (si el tipado obliga a tocar el controller en 3, el cambio mínimo
viaja ahí), 3–5 → 6, 8–9 → 10–11 → 12. Para 10 y 11 se recomienda `size:exception` (la revisión
se reduce a "se borra todo y nada más"); si no, se parten por carpeta. El forecast formal es
trabajo de `sdd-tasks`.

---

## Open Questions

Ninguna bloqueante. Quedan para el orquestador:

- [ ] Confirmar que WU-1 viaja como PR independiente a `main`, fuera de la Feature Branch Chain.
- [ ] Confirmar `size:exception` para los PR de borrado puro (WU-10 y WU-11).

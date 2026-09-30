# Design: stock usado y retiro de componentes con dos desenlaces

## Technical Approach

La condición NUEVO/USADO se agrega como una **dimensión ortogonal al tipo** del movimiento: el
catálogo de tipos, su dirección (`DIRECCION_POR_TIPO_MOVIMIENTO`) y el advisory lock por insumo
no cambian. El repositorio pasa a devolver el desglose por (condición × tipo), el dominio deriva
un saldo por condición con la fórmula de siempre, y cada operación que resta decide sobre el
saldo de **su** condición.

El retiro de un componente deja de ser un borrado lógico sin datos y pasa a ser un caso de uso
transaccional nuevo (`RetirarComponenteUseCase`) con dos destinos. El registro del retiro vive
en columnas de `componentes_equipo`; la instalación con descuento deja un vínculo a su SALIDA,
que es lo que permite saber si una pieza tiene una salida registrada del depósito.

Cinco movimientos, en este orden de dependencia:

1. **Bitácora con condición**: migración de `movimientos_insumo`, entidad, mapper, saldo por
   condición (ADR-1, ADR-2).
2. **Casos de uso de insumos por condición**: entrada, salida y ajuste con `condicion`, regla
   de USADO solo en repuestos (ADR-6), recepción fija en NUEVO, reposición sobre NUEVO.
3. **Borde HTTP de insumos**: `condicion` en los bodies, en el movimiento y en el stock (ADR-7).
4. **Componentes**: migración de `componentes_equipo`, instalación con condición y vínculo a la
   SALIDA, retiro con dos desenlaces, reactivar condicionado (ADR-3, ADR-4, ADR-5).
5. **Frontend** y **runbook** (ADR-8).

Specs de referencia: `specs/stock-insumo-condicion/spec.md` y el delta
`specs/componentes-catalogo-unico/spec.md`. El cambio no implementa un punto de
`docs/roadmap-comercial.md`.

---

## Capa donde cae cada pieza (`rules.design`)

| Pieza | Capa | Por qué ahí |
|---|---|---|
| `CONDICIONES_STOCK`, `CondicionStock`, `CONDICION_STOCK_POR_DEFECTO`, `calcularSaldos()` | domain (`tipo-movimiento-insumo.ts`) | Mismo archivo que el catálogo de tipos y la fórmula: el catálogo y la función que lo lee viven juntos |
| `condicion` en `MovimientoInsumoEntity` | domain | Siempre presente en las props persistidas. En `create()` es opcional con default NUEVO en WU-1 y pasa a obligatoria en WU-3, cuando los casos de uso la deciden (ver Work Units) |
| Regla "USADO solo en repuestos" | application (`validarCondicionAdmitida` en `validar-insumo.service.ts`) | Necesita leer la familia del insumo; la entidad no tiene repositorios |
| Exención de la devolución (insumo o familia deshabilitados, familia dada de baja) | application (`RegistrarEntradaInsumoUseCase.registrarDevolucionDeComponente`) | Es una regla del ORIGEN "retiro de un componente", no de la entrada genérica (ADR-4) |
| Default NUEVO cuando falta la condición | application (DTO de cada caso de uso) | La spec lo pide para la operación, no para la fila |
| Saldo de la condición bajo el lock | application (salida, ajuste) | Ya es donde se decide bajo `lockAndSumByTipo` |
| `DESTINOS_RETIRO_COMPONENTE`, reglas de motivo del retiro, `bajaSinSalidaPrevia` derivada | domain (`componente-equipo.entity.ts`) | El componente conoce su vínculo de instalación; la regla no necesita repositorios |
| Orquestación retiro = ENTRADA USADO + marca de retiro | application (`RetirarComponenteUseCase`, equipos) | Mismo criterio que `InstalarComponenteDesdeDepositoUseCase`: el módulo cuyo endpoint dispara la acción es dueño de la compuerta |
| Marca de retiro condicional (`WHERE deleted_at IS NULL`) | infrastructure (`PrismaComponenteEquipoRepository.retirar`) | Es la exclusión mutua entre dos retiros concurrentes (ADR-4) |
| CHECK de condición, de destino y de coherencia del retiro | infrastructure (migraciones tenant) | Backstop de base; las constantes del dominio se comparan contra el CHECK real |
| `condicion` ignorada con `descontarStock=false` | interface (controller de equipos) | Es enrutamiento por campos del request, igual que ADR-1 del ciclo anterior |
| Zod de diálogos | interface del frontend | Regla derivada: la autoridad es el DTO del backend |

**Autorización, sus dos lugares.** Borde: `@RequiereAcciones('EQUIPOS:BORRADO')` en el
`POST :id/componentes/:componenteId/baja` nuevo; `PATCH …/reactivar` sigue con
`EQUIPOS:MODIFICACION`; `POST :id/componentes` sigue con `EQUIPOS:ALTAS`; los endpoints de
movimientos siguen con `INSUMOS:ALTAS` (entrada y salida) e `INSUMOS:AJUSTAR` (ajuste). Inline:
no hay chequeos dentro de los métodos que cambian. En el frontend, el `<Can permiso="EQUIPOS:BORRADO">`
de `equipo-componentes-section.tsx:138` pasa a envolver la acción que abre el diálogo de retiro,
y el de reactivar (`:154`) suma la condición de destino. Sin permiso nuevo: la consecuencia
asumida (`EQUIPOS:BORRADO` suma stock USADO sin permisos de INSUMOS) está declarada en la spec.

---

## Architecture Decisions

### ADR-1: el repositorio devuelve (condición × tipo) y `calcularStock` no cambia de firma

**Choice**:

```ts
export type SumasPorCondicionYTipo =
  Readonly<Record<CondicionStock, Readonly<Record<TipoMovimientoInsumo, number>>>>;

export interface SaldosInsumo { NUEVO: number; USADO: number; total: number }

export function calcularStock(sumasPorTipo: Readonly<Record<TipoMovimientoInsumo, number>>): number; // sin cambios
export function calcularSaldos(sumas: SumasPorCondicionYTipo): SaldosInsumo; // nueva
```

`calcularSaldos` aplica `calcularStock` a cada condición recorriendo `CONDICIONES_STOCK` y suma
el total en centésimas (`enCentesimas`), nunca en coma flotante. `lockAndSumByTipo()` y
`sumByTipo()` conservan el nombre y cambian el tipo devuelto; `sumarPorTipo()` agrupa por
`['condicion', 'tipo']` y completa los 2×4 ceros desde los dos catálogos. Salida, ajuste y
consulta leen siempre `calcularSaldos(sumas)`.

| Opción | Costo | Decisión |
|---|---|---|
| A. `calcularStock(sumas)` devuelve `{NUEVO, USADO, total}` | Reescribe el spec de la fórmula y todos sus llamadores cambian de tipo de retorno | Rechazada: más diff para el mismo resultado |
| B. Un `calcularStock(sumas, condicion)` con parámetro | La consulta llama dos veces y suma afuera: el total queda como segunda fórmula | Rechazada |
| C. Desglose anidado + `calcularSaldos` que compone la fórmula existente | La fórmula por tipo queda intacta con su spec; el cambio de tipo del puerto rompe en compilación a cada llamador que no indexe por condición | **Elegida** |
| D. Renombrar `lockAndSumByTipo` → `lockAndSumPorCondicion` | Toca cada fake de cada spec sin cambiar conducta | Rechazada: el JSDoc se actualiza, el nombre no |

Para contener el ripple de los fakes se agrega un helper de test
`backend/src/insumos/testing/sumas-movimiento.ts` (`sumasEnCero()`, `sumasCon({ NUEVO: {...} })`).

### ADR-2: dos migraciones tenant aditivas, cada una con su work unit

**Choice**:

- `<ts>_movimientos_insumo_condicion` (WU-1):
  `ALTER TABLE "movimientos_insumo" ADD COLUMN "condicion" VARCHAR(10) NOT NULL DEFAULT 'NUEVO'`
  y `CONSTRAINT "movimientos_insumo_condicion_check" CHECK ("condicion" IN ('NUEVO','USADO'))`.
  El default **se conserva**: el binario viejo sigue insertando durante la ventana y tras un
  rollback. Con default constante, Postgres 11+ no reescribe la tabla.
- `<ts>_componentes_equipo_retiro` (WU-5): columnas nullable `instalacion_movimiento_id UUID`,
  `baja_destino VARCHAR(20)`, `baja_motivo TEXT`, `baja_movimiento_id UUID`,
  `baja_usuario_id UUID`; FK de las dos `*_movimiento_id` a `movimientos_insumo(id)` con
  `ON DELETE RESTRICT`; `UNIQUE` en cada una; y dos CHECK con nombre:

```sql
CONSTRAINT "componentes_equipo_baja_destino_check"
  CHECK ("baja_destino" IN ('STOCK_USADO','DESCARTE')),
CONSTRAINT "componentes_equipo_baja_coherente_check" CHECK (
  ("baja_destino" IS NULL AND "baja_motivo" IS NULL AND "baja_movimiento_id" IS NULL AND "baja_usuario_id" IS NULL)
  OR ("baja_destino" = 'DESCARTE' AND "deleted_at" IS NOT NULL AND "baja_motivo" IS NOT NULL
      AND "baja_movimiento_id" IS NULL AND "baja_usuario_id" IS NOT NULL)
  OR ("baja_destino" = 'STOCK_USADO' AND "deleted_at" IS NOT NULL
      AND "baja_movimiento_id" IS NOT NULL AND "baja_usuario_id" IS NOT NULL))
```

Ninguna fila existente se modifica (escenario "Migración aditiva"): los retiros legados quedan
con todo en NULL y pasan la primera rama del CHECK.

**Índices**: en `movimientos_insumo` **no** se agrega `(insumo_id, condicion)`; el `GROUP BY` ya
filtra por el prefijo de `@@index([insumoId, createdAt])` y el universo por insumo es chico. Los
`UNIQUE` de `componentes_equipo` sirven de índice para "qué componente originó este movimiento"
y garantizan que un movimiento no respalde dos componentes.

| Alternativa | Por qué no |
|---|---|
| Una sola migración con las dos tablas en WU-1 | Las columnas de componentes viajarían tres unidades antes que su código; revertir el retiro dejaría esquema sin dueño |
| Quitar el default después del backfill | Rompe al binario viejo en la ventana de deploy y en un rollback |
| CHECK coherente sin `deleted_at` | Permitiría un componente activo con destino de retiro; con `deleted_at`, el binario viejo **no puede** reactivar un `STOCK_USADO` (la base rechaza), que es un backstop gratuito contra el doble conteo |

### ADR-3: `POST /equipos/:id/componentes/:componenteId/baja`; el `DELETE` se retira

**Choice**: endpoint nuevo con body `{ destino: 'STOCK_USADO' | 'DESCARTE', motivo?: string }`,
`200` con `ComponenteResponseDto`. La ruta `DELETE :id/componentes/:componenteId`,
`EliminarComponenteUseCase` y su spec se borran; en el frontend, `useEliminarComponente` se
reemplaza por `useRetirarComponente` y la papelera abre el diálogo de retiro.

| Opción | Decisión |
|---|---|
| `DELETE` con body | Rechazada: body en `DELETE` es poco portable entre proxies e IIS |
| Conservar `DELETE` como alias del descarte | Rechazada: el descarte exige motivo y el `DELETE` no tiene body |
| Conservar `DELETE` como retiro sin destino | Rechazada: la spec prohíbe retirar sin destino |
| `POST …/baja` y borrar `DELETE` | **Elegida**. Una pestaña con el bundle viejo recibe 404 hasta recargar: mismo costo aceptado en el ciclo anterior con `instalar-desde-deposito` |

### ADR-4: retiro atómico — ENTRADA primero, marca condicional después

**Choice**: `RetirarComponenteUseCase(txRunner, componenteRepo: Pick<'findById' | 'retirar'>,
registrarEntrada: Pick<RegistrarEntradaInsumoUseCase, 'registrarDevolucionDeComponente'>)`.

1. Fuera de la transacción: el componente existe y pertenece al equipo (`ComponenteNoEncontradoError`,
   404); está activo (`ComponenteDadoDeBajaError`, 422); `componente.validarRetiro(destino, motivo)`
   devuelve el motivo normalizado o `MotivoRetiroRequeridoError` (422).
2. Dentro de `txRunner.run()`: con `STOCK_USADO`,
   `registrarEntrada.registrarDevolucionDeComponente({ insumoId, equipoId, usuarioId, motivo })`
   (método dedicado, ver "Deshabilitado" abajo; fija `cantidad: 1` y `condicion: 'USADO'`). Luego
   `componente.retirar({ destino, motivo, usuarioId, bajaMovimientoId })` y
   `componenteRepo.retirar(componente)`, que hace un `updateMany` con
   `WHERE id = ? AND deleted_at IS NULL` y devuelve si tocó la fila.
3. Si la ENTRADA falla o la marca toca 0 filas, se lanza `FalloRetiroDeComponente` (clase interna,
   mismo patrón que `FalloSalidaDeStock`) para que Postgres revierta la ENTRADA; afuera se
   desenvuelve a `Result.fail`. Cualquier otra excepción sigue propagando.

**Por qué este orden.** La FK de `baja_movimiento_id` exige que el movimiento exista al marcar, y
el CHECK coherente exige destino, movimiento y `deleted_at` en la misma sentencia. La exclusión
mutua sale de Postgres: en `READ COMMITTED`, el segundo `UPDATE` espera el lock de fila del
primero y reevalúa `deleted_at IS NULL` sobre la versión comiteada, toca 0 filas y su ENTRADA se
revierte. Dos retiros concurrentes dejan **una** ENTRADA. La ENTRADA no toma el advisory lock
(suma, no decide), así que no hay riesgo de orden de locks.

**Motivo en la ENTRADA**: la ENTRADA lleva el mismo motivo normalizado que `baja_motivo`. Quien
audita el insumo sin ver equipos necesita leer por qué entró un usado; las dos copias se
escriben en la misma transacción y ninguna puede cambiar después (la bitácora es append-only y
reactivar está bloqueado tras `STOCK_USADO`).

**"Sin salida registrada del depósito"** (e3). `InstalarComponenteDesdeDepositoUseCase` vincula la
SALIDA: tras el `execute` de la salida, `componente.vincularInstalacion(salida.id)` y
`componenteRepo.save(componente)` dentro de la misma transacción (el caso de uso suma
`Pick<IComponenteEquipoRepository, 'save'>`). La marca se **deriva** en la entidad:
`bajaSinSalidaPrevia = bajaDestino === 'STOCK_USADO' && instalacionMovimientoId === null`, y la
regla del motivo usa la misma condición.

| Alternativa para saber si salió | Por qué no |
|---|---|
| Booleano `instalado_desde_deposito` | Afirma un hecho que la base no verifica; la FK sí verifica que la SALIDA exista |
| `componente_id` en `movimientos_insumo` | La consulta de equipos tendría que leer la bitácora de insumos por un puerto nuevo |
| Inferir la SALIDA por `equipo_id` + `insumo_id` + cercanía de `created_at` | Heurística; y un backfill en la migración contradice el escenario "Migración aditiva" |
| Columna de marca guardada | Redundante con dos columnas inmutables; derivarla no puede desincronizarse |

**Rótulo** (dueño, 2026-09-30): la marca se muestra como **"sin salida registrada del
depósito"**, en backend, frontend y spec. La marca **no se guarda**: se deriva de
`instalacion_movimiento_id` nulo.

**Filas legadas — consecuencia aceptada**: `instalacion_movimiento_id` NULL significa "no hay
SALIDA vinculada". Vale igual para un componente que vino con el equipo y para uno instalado
**con descuento antes de este ciclo**: los dos muestran "sin salida registrada del depósito" y
exigen motivo para volver al stock. Es el lado seguro frente a fabricar stock sin explicación, y
el rótulo es verdadero en los dos casos (no consta una SALIDA vinculada).

**Deshabilitado** (dueño O1, orquestador D1): una pieza sana retirada de un repuesto
deshabilitado PUEDE volver al stock como USADO. La exención vale **solo en el retiro** y se
implementa como método dedicado de `RegistrarEntradaInsumoUseCase`:
`registrarDevolucionDeComponente({ insumoId, equipoId, usuarioId, motivo })`, que fija
`cantidad: 1`, `condicion: 'USADO'` y exige `equipoId`. Sus guards:

| Guard | `execute()` (entrada manual) | `registrarDevolucionDeComponente()` |
|---|---|---|
| Insumo inexistente o con baja lógica | Rechaza | Rechaza (no se imputa stock a una fila que el catálogo no muestra) |
| Insumo deshabilitado | Rechaza (`INSUMO_DESHABILITADO`) | **Admite** |
| Familia con baja lógica o deshabilitada, USADO | Rechaza (ADR-6) | **Admite**: la pieza existe físicamente |
| Familia con `esRepuesto = false`, USADO | Rechaza (ADR-6) | Rechaza (ADR-6): el alcance de USADO no cambia |

La regla genérica **no se ensancha** y la condición no cambia la elegibilidad de hoy: una
ENTRADA manual sobre un insumo deshabilitado sigue rechazada con cualquier condición, y el
AJUSTE sigue sin exigir habilitado (`validarInsumoElegible` sin `exigirHabilitado`, como hoy). Se elige un método con nombre de origen y no un
booleano en el DTO, por el mismo criterio que ya documenta el caso de uso con `itemCompraId`: una
llave de "saltear validación" no tiene dueño; un método que solo llama el retiro, sí. El método no
se expone por HTTP y el `Pick` del retiro pide solo ese método.

**Usuario**: `baja_usuario_id` (soft ref a `master.usuarios.id`, sin FK cross-DB, igual que
`movimientos_insumo.usuario_id`), desde `@CurrentUser()`.

### ADR-5: reactivar (f2) — guard en el caso de uso, limpieza en la entidad

**Choice**: `ReactivarComponenteUseCase` rechaza con `ComponenteDevueltoAlStockError`
(`COMPONENTE_DEVUELTO_AL_STOCK`, 422) cuando `bajaDestino === 'STOCK_USADO'`. En `DESCARTE` y en
legados, `reactivar()` limpia `deletedAt` **y** las cuatro columnas de retiro, para que un
componente activo nunca informe un destino. El CHECK coherente lo exige. Se pierde el motivo de un
descarte revertido; se acepta porque reactivar existe para deshacer un retiro equivocado y la
spec no pide historial de ciclos (h2).

Alternativa rechazada: conservar las columnas al reactivar. Un componente activo con
`bajaDestino = DESCARTE` obliga a cada lector a cruzar con `deletedAt`, y deja sin backstop de base.

### ADR-6: USADO solo en repuestos — regla de aplicación, error de insumos

**Choice**: `validarCondicionAdmitida(familias, insumo, condicion)` en `validar-insumo.service.ts`.
Con `NUEVO` devuelve ok **sin consultar**; con `USADO` lee la familia y, si no existe, tiene baja
lógica o `esRepuesto` es `false`, devuelve `CondicionUsadoNoAdmitidaError`
(`CONDICION_USADO_NO_ADMITIDA`, 422, mapeada explícita en `insumos.controller.ts`). La llaman
entrada, salida y ajuste, antes de abrir la transacción. Los tres casos de uso suman
`Pick<IFamiliaInsumoRepository, 'findById'>`.

La devolución de un componente (ADR-4) la llama con la opción
`{ admitirFamiliaNoVigente: true }`: una familia con baja lógica o deshabilitada **no** rechaza,
porque la pieza existe físicamente; solo `esRepuesto = false` rechaza. Sin la opción (entrada,
salida y ajuste manuales), la regla es la de arriba. La opción es un parámetro de la función de
servicio, no un campo de ningún DTO: el único que la pasa es `registrarDevolucionDeComponente`.

Rechazadas: en la entidad (no tiene repositorios); un CHECK cruzado (no es expresable entre
tablas); solo en el frontend (la spec exige el backend).

### ADR-7: contratos del borde

- `RegistrarMovimientoInsumoHttpDto`: `@IsOptional() @IsIn(CONDICIONES_STOCK) condicion?`. Lo
  hereda el DTO del ajuste. Un valor fuera del catálogo da 400.
- Recepción de compra: el DTO no declara `condicion` y el `ValidationPipe` global
  (`whitelist`, sin `forbidNonWhitelisted`) la descarta; el caso de uso pasa `'NUEVO'`
  explícito. **Se ignora**, con la misma justificación que ADR-2 del ciclo anterior.
- `CreateComponenteHttpDto`: `@IsOptional() @IsIn(CONDICIONES_STOCK) condicion?`. Con
  `descontarStock=false` el controller **no la pasa** (se ignora): no hay movimiento sobre el
  cual aplicarla, y un 400 castigaría al diálogo que desmarca la casilla después de elegir USADO.
- `StockInsumoResponseDto`: `stock` se conserva como **total**; se agregan
  `saldos: { NUEVO, USADO }` y `admiteUsado: boolean` (familia repuesto). `estadoReposicion` se
  calcula sobre `saldos.NUEVO`. `admiteUsado` viaja resuelto para que el frontend no derive la
  regla de ADR-6 por su cuenta.
- `MovimientoInsumoResponseDto`: suma `condicion`.
- `ComponenteResponseDto` y `ComponenteConTipoResponseDto`: suman `bajaDestino`, `bajaMotivo`,
  `bajaMovimientoId`, `bajaUsuarioId` y `bajaSinSalidaPrevia`.

**Selector del frontend (a1)**: en el alta con descuento y en los diálogos de movimiento, visible
solo si `admiteUsado`. NUEVO preseleccionado. Si exactamente un saldo es mayor que cero, el
selector se fija en ese saldo y se deshabilita. Si la consulta de stock no está disponible (por
ejemplo, sin `INSUMOS:LECTURA`), el selector se muestra habilitado, sin saldos y en NUEVO; el
backend decide.

### ADR-8: una sola entrega, sin feature flag; rollback documentado por estado

**Choice**: el tracker se integra y se despliega en una sola ventana. El runbook suma la sección
"Rollback del tracker `stock-usado-componentes`" con un detector de solo lectura por tenant que
mide los **dos** datos que el binario viejo no sabe leer:

```sql
SELECT
  (SELECT count(*) FROM movimientos_insumo WHERE condicion = 'USADO')          AS movimientos_usado,
  (SELECT count(*) FROM componentes_equipo WHERE baja_destino IS NOT NULL)     AS retiros_con_destino;
```

- **Los dos en 0 en todos los tenants**: `git reset --hard` al commit de rollback. Las
  migraciones quedan: el binario viejo no lee las columnas nuevas e inserta con el default.
- **`movimientos_usado` > 0**: el binario viejo suma los usados al saldo único y puede
  consumirlos como nuevos. El alcance del error es ese número.
- **`retiros_con_destino` > 0**: el binario viejo no escribe las columnas de retiro, así que su
  reactivar sobre **cualquier** componente con destino (`STOCK_USADO` o `DESCARTE`) deja
  `deleted_at` en NULL con `baja_destino` presente y el CHECK `componentes_equipo_baja_coherente_check`
  lo rechaza: 500 en esas filas. Sobre `STOCK_USADO` es deseable (evita el doble conteo); sobre
  `DESCARTE` es una pérdida de función, acotada a esas filas, y los retiros legados siguen
  reactivándose.
- En cualquiera de los dos casos con valor > 0, la vía preferida es corregir hacia adelante. Si el
  revert es inevitable, la vía fiel es restaurar el dump de `predeploy-dump.ps1` (se pierde lo
  escrito después del deploy). Revertir sin restaurar acepta las dos consecuencias de arriba, con
  su alcance ya medido por el detector.

| Alternativa | Por qué no |
|---|---|
| Feature flag de USADO | No elimina el riesgo, solo lo posterga al día en que se enciende; agrega código y tests en backend y frontend, y un ciclo más para retirarlo |
| Dos releases (esquema y lectura primero, escritura de USADO después) | Mismo resultado que el flag con dos ventanas de deploy |
| Una entrega con rollback por estado | **Elegida**: el esquema es compatible hacia atrás salvo en los dos puntos que mide el detector, y el CHECK coherente impide al binario viejo reactivar una pieza devuelta |

### ADR-9: Ayuda

La escritura sigue suspendida. Se corrige solo lo que el cambio vuelve falso:
`backend/ayuda/permisos-y-roles.md:150-154` ("Sin esa casilla la persona no puede registrar
ningún movimiento"). Ya era inexacto desde #153 y el retiro lo vuelve más falso. La corrección
viaja en la WU que publica `POST …/baja` (WU-8) y nombra las tres excepciones: instalar con
`EQUIPOS:ALTAS`, retirar al stock con `EQUIPOS:BORRADO` y recibir una compra con permisos de
compras. `compras-insumos-stock.md` sigue siendo verdadero, porque la recepción entra como NUEVO.
La deuda se anota en el commit y en el PR de las WU 9 a 12.

---

## Data Flow

```
Instalación con descuento
  ComponenteCreateDialog ── insumoId, descontarStock, condicion (NUEVO por defecto)
        │ POST /equipos/:id/componentes
        ▼
  EquiposController ── descontarStock ?? true  (false ⇒ condicion ignorada)
        └─ Instalar ─ tx ─┬ AgregarComponente (guards, save)
                          ├ RegistrarSalida(condicion) ─ lock ─ calcularSaldos()[condicion] ≥ 1 ?
                          └ componente.vincularInstalacion(salida.id) → save

Retiro
  RetiroComponenteDialog ── destino, motivo?
        │ POST /equipos/:id/componentes/:cid/baja
        ▼
  RetirarComponente ── validarRetiro (motivo: DESCARTE o sin SALIDA vinculada)
        └ tx ─┬ [STOCK_USADO] registrarDevolucionDeComponente(USADO, 1, equipoId, motivo)
              └ repo.retirar: UPDATE … WHERE deleted_at IS NULL  (0 filas ⇒ throw ⇒ rollback)

Ficha del insumo
  GET /insumos/:id/stock ── sumByTipo ─ calcularSaldos ─ {stock=total, saldos, estado(NUEVO), admiteUsado}
```

---

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `backend/prisma_tenant/schema.prisma` + 2 migraciones | Modify/Create | ADR-2 |
| `backend/src/insumos/domain/entities/tipo-movimiento-insumo.ts` (+spec) | Modify | `CONDICIONES_STOCK`, `CONDICION_STOCK_POR_DEFECTO`, `calcularSaldos` |
| `.../entities/movimiento-insumo.entity.ts` (+spec), `.../prisma/movimiento-insumo.mapper.ts` | Modify | `condicion` |
| `.../ports/i-movimiento-insumo.repository.ts`, `prisma-movimiento-insumo.repository.ts` (+integración, concurrencia) | Modify | ADR-1 |
| `.../prisma/movimientos-insumo-constraints.integration.spec.ts` | Modify | CHECK de condición contra `CONDICIONES_STOCK` |
| `backend/src/insumos/testing/sumas-movimiento.ts` | Create | Helper de fakes |
| `.../use-cases/registrar-{entrada,salida,ajuste}-insumo.use-case.ts`, `consultar-stock-insumo.use-case.ts` (+specs) | Modify | Condición, ADR-6, reposición sobre NUEVO; `registrarDevolucionDeComponente` en la entrada (ADR-4) |
| `.../services/validar-insumo.service.ts`, `domain/errors/insumos.errors.ts`, `insumos.module.ts` | Modify | ADR-6 |
| `.../interface/dtos/movimientos-insumo.dto.ts`, `controllers/movimientos-insumo.controller.ts`, `insumos.controller.ts` (+specs, e2e) | Modify | ADR-7; exporta `transformarMotivo` |
| `backend/src/compras/application/use-cases/registrar-recepcion-de-item.use-case.ts` (+spec) | Modify | `condicion: 'NUEVO'` explícito |
| `backend/src/equipos/domain/entities/componente-equipo.entity.ts` (+spec), mapper, `equipos.errors.ts` | Modify | Columnas de retiro, `validarRetiro`, `retirar`, `vincularInstalacion`, `reactivar` limpia; +2 errores |
| `.../use-cases/instalar-componente-desde-deposito.use-case.ts` (+spec, concurrencia) | Modify | Condición y vínculo |
| `.../use-cases/retirar-componente.use-case.ts` (+spec, +integración) | Create | ADR-4 |
| `.../use-cases/eliminar-componente.use-case.ts` (+spec) | Delete | ADR-3 |
| `.../use-cases/reactivar-componente.use-case.ts` (+spec) | Modify | ADR-5 |
| `.../ports/i-componente-equipo.repository.ts`, `prisma-componente-equipo.repository.ts` | Modify | `retirar(): Promise<boolean>`; `delete` se elimina. Verificado: su único llamador de producción es `EliminarComponenteUseCase` (`eliminar-equipo.use-case.ts` usa `equipoRepo.delete`, otro puerto) |
| `.../prisma/prisma-equipos.integration.spec.ts` | Modify | `:363` usa `componenteRepo.delete` como fixture de un componente dado de baja: pasa a `retirar` con destino `DESCARTE` |
| `.../interface/dtos/equipos.dto.ts`, `controllers/equipos.controller.ts`, `equipos.module.ts` (+specs, e2e) | Modify | ADR-3, ADR-7 |
| `backend/ayuda/permisos-y-roles.md` | Modify | ADR-9 |
| `frontend/src/features/insumos/{types,schemas}.ts`, `hooks/use-stock-insumo.ts`, `insumo-detail-view.tsx`, `movimiento-*-dialog.tsx` (+tests) | Modify | Dos saldos, columna condición, selector |
| `frontend/src/features/equipos/{types,schemas}.ts`, `hooks/use-equipo-mutations.ts`, `componente-create-dialog.tsx`, `equipo-componentes-section.tsx` (+tests) | Modify | Selector, retiro, rótulos, reactivar |
| `frontend/src/features/equipos/components/componente-retiro-dialog.tsx` (+test) | Create | Diálogo de dos desenlaces |
| `DEPLOY-VPS-runbook.md` | Modify | ADR-8 |

---

## Interfaces / Contracts

```ts
// POST /equipos/:id/componentes/:componenteId/baja   (EQUIPOS:BORRADO)
export class RetirarComponenteHttpDto {
  @IsIn(DESTINOS_RETIRO_COMPONENTE) destino!: DestinoRetiroComponente; // 'STOCK_USADO' | 'DESCARTE'
  @IsOptional() @IsString() @Transform(transformarMotivo)
  @MaxLength(MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH) motivo?: string | null;
}

// IComponenteEquipoRepository
retirar(componente: ComponenteEquipoEntity): Promise<boolean>; // false ⇒ ya estaba retirado
```

Errores nuevos: `CondicionUsadoNoAdmitidaError` (insumos, 422), `MotivoRetiroRequeridoError`
(equipos, 422) y `ComponenteDevueltoAlStockError` (equipos, 422). El catálogo de equipos pasa de
13 a 15 clases.

---

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Unit (dominio) | `calcularSaldos`: saldos independientes, condición vacía en 0, total en centésimas; `validarRetiro` y `bajaSinSalidaPrevia` en sus combinaciones; `reactivar` limpia | Specs puros |
| Unit (aplicación) | Salida y ajuste deciden sobre la condición; USADO en no repuesto da 422 sin consultar con NUEVO; entrada manual USADO sobre insumo deshabilitado sigue rechazada (el ajuste conserva su regla actual); `registrarDevolucionDeComponente` admite insumo deshabilitado y familia dada de baja o deshabilitada, y rechaza `esRepuesto = false`; recepción manda NUEVO; retiro: orden ENTRADA → marca, marca en 0 ⇒ rollback, motivo | Fakes con `sumas-movimiento.ts` |
| Integración | Constraints: CHECK de condición contra `CONDICIONES_STOCK`, CHECK de destino contra `DESTINOS_RETIRO_COMPONENTE` y las tres ramas del CHECK coherente (con `pg_get_constraintdef`); `sumarPorTipo` agrupa por condición; retiro atómico en base real | Base tenant efímera; `soporte_tenant_test` se migra a mano en la WU que trae cada migración |
| Concurrencia | Dos SALIDA USADO de 1 con saldo USADO 1 ⇒ una sola; dos retiros del mismo componente ⇒ una ENTRADA | Molde de `prisma-movimiento-insumo.repository.concurrencia.integration.spec.ts` |
| E2E | Movimientos con condición y 422 de ADR-6; stock con `saldos`; alta con USADO; `…/baja` en los dos destinos, sin permiso ⇒ 403, `DELETE` ⇒ 404; reactivar tras `STOCK_USADO` ⇒ 422 | Todo spec que trunque `soporte_master_test` llama `usarLockMasterTest()` |
| Frontend | Selector fijo con un solo saldo; payload con `condicion` solo con descuento; diálogo de retiro exige motivo en el descarte; invalidación de `["equipo", id]`, `["insumo", insumoId, "stock"]` y `["insumo", insumoId, "movimientos"]`; reactivar oculto tras `STOCK_USADO` | MSW + `renderWithProviders` |
| Adversarial (verify) | Leer el saldo total en vez del de la condición ⇒ rojo; quitar `deleted_at IS NULL` de `retirar` ⇒ rojo en concurrencia | `rules.verify` |

TDD no se inyecta: es una feature.

---

## Threat Matrix

N/A: no hay enrutamiento, shell, subprocesos, automatización de VCS o PR, ni clasificación de
archivos ejecutables. `deploy.ps1` no cambia; el runbook solo suma texto y una consulta de solo
lectura.

---

## Migration / Rollout

1. `predeploy-dump.ps1 -DryRun` y luego la corrida real. El dump es la única vuelta atrás una vez
   que existe un USADO (ADR-8).
2. `deploy.ps1`: pull → builds → `migrate:tenants` aplica las dos migraciones en cada tenant del
   registro → arranque. Backend y frontend van en la misma corrida.
3. Verificación: `\d movimientos_insumo` y `\d componentes_equipo` en un tenant; el detector
   devuelve 0 en sus dos columnas; la ficha de un repuesto muestra NUEVO = stock previo y USADO = 0.

**Rollback**: ver ADR-8. Si una migración falla en un tenant (P3009), se aplica el procedimiento
ya documentado (`prisma migrate resolve --rolled-back`) y se vuelve a correr `deploy.ps1`.

---

## Work Units y presupuesto de revisión

Estimaciones **ya corregidas** por la experiencia del repo (el tamaño real suele duplicar la
estimación ingenua; los borrados cuentan). Cada WU queda en verde y se puede revertir dentro del
tracker `feat/stock-usado-componentes` (Feature Branch Chain, auto-chain).

| # | Unidad | Depende de | Estimación (+/−) |
|---|---|---|---|
| 1 | Bitácora con condición: migración, schema, catálogo, entidad (`condicion` opcional en `create()`, default NUEVO), mapper, constraints | — | ~250 |
| 2 | Saldo por condición: puerto, repo, `calcularSaldos`, llamadores sobre NUEVO, helper de fakes, integración | 1 | ~380 (riesgo: fakes) |
| 3 | Aplicación de insumos: `condicion` obligatoria en `create()` y decidida en entrada, salida y ajuste, ADR-6, `registrarDevolucionDeComponente`, recepción NUEVO, consulta con `saldos`, `admiteUsado` y reposición NUEVO | 2 | ~380 |
| 4 | Borde HTTP de insumos: DTOs, controller, respuestas y e2e | 3 | ~300 |
| 5 | Esquema de componentes: migración, schema, entidad, mapper, constraints, reactivar (ADR-5) | 1 | ~350 |
| 6 | Instalación con condición y vínculo a la SALIDA: DTO, controller, caso de uso, concurrencia, e2e | 3, 5 | ~300 |
| 7 | Retiro, aplicación: `RetirarComponenteUseCase`, repo `retirar`, integración atómica y concurrente | 3, 5 | ~350 |
| 8 | Retiro, borde: `POST …/baja`, borrado de `DELETE` y `EliminarComponenteUseCase`, e2e, Ayuda (ADR-9) | 7 | ~380 (los borrados cuentan) |
| 9 | Frontend insumos: tipos, ficha con dos saldos y columna condición | 4 | ~250 |
| 10 | Frontend insumos: selector en los diálogos de movimiento | 9 | ~330 |
| 11 | Frontend equipos: selector de condición en el alta | 6, 9 | ~250 |
| 12 | Frontend equipos: diálogo de retiro, `useRetirarComponente`, rótulos y reactivar condicionado | 8, 11 | ~400 (riesgo; si se pasa, separar rótulos y reactivar) |
| 12b | (solo si WU-12 se pasa) Rótulos de destino y reactivar condicionado | 12 | ~150 |
| 13 | Runbook: rollback del tracker y detector | 8 | ~80 |

**Por qué WU-1 queda en verde (validación W3).** Si `condicion` fuera obligatoria en
`MovimientoInsumoEntity.create()` desde WU-1, los casos de uso que recién cambian en WU-3 no
compilarían. Por eso en WU-1 `CrearMovimientoInsumoProps.condicion` es **opcional** y `create()`
aplica `CONDICION_STOCK_POR_DEFECTO`; las props persistidas (`MovimientoInsumoProps`) sí la llevan
siempre, y el mapper la lee de la fila. WU-3 la vuelve obligatoria en `create()` y en el mismo
commit hace que cada llamador la pase: el compilador enumera los que faltan. Hasta WU-3 la
conducta es la de hoy, porque todo lo que se escribe es NUEVO.

**Mecanismo de los escenarios de interfaz del retiro (WU-12).** En
`equipo-componentes-section.tsx`, para una fila con `deletedAt`: el rótulo sale de
`bajaDestino` (`STOCK_USADO` ⇒ "Devuelto al stock", `DESCARTE` ⇒ "Descartado", `null` ⇒ el
"Dado de baja" actual); si `bajaSinSalidaPrevia`, se agrega "sin salida registrada del depósito".
El botón Reactivar se renderiza solo si `bajaDestino !== 'STOCK_USADO'`, además del
`<Can permiso="EQUIPOS:MODIFICACION">` actual. Los dos casos se prueban en
`equipo-componentes-section.test.tsx` con fixtures de los tres destinos. El backend es la
autoridad de todas formas: reactivar tras `STOCK_USADO` da 422 (ADR-5).

Los estados intermedios no son desplegables (entre WU-8 y WU-12 el frontend todavía llama al
`DELETE` retirado; los tests de frontend siguen en verde porque usan MSW). Por eso el tracker se
integra a `main` una sola vez, como en el ciclo anterior.

Cortes previstos por si una WU se pasa: WU-2 separa el repo con su integración de los llamadores;
WU-3 separa la consulta de stock; WU-8 separa el borrado del `DELETE`, que es borrado puro, y en
ese caso WU-12 retira el uso del hook viejo. El forecast formal es trabajo de `sdd-tasks`.

---

## Open Questions

Ninguna. Las dos que quedaban las resolvió el dueño el 2026-09-30:

- [x] Una pieza sana de un repuesto deshabilitado puede volver al stock como USADO; la exención
      vale solo en el retiro (ADR-4, ADR-6; escenarios agregados a las dos specs).
- [x] El rótulo es "sin salida registrada del depósito", para piezas que vinieron con el equipo y
      para las instaladas antes de este ciclo (ADR-4; spec y propuesta alineadas).

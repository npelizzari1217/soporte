# Design: seguimiento de repuestos por número de serie

## Technical Approach

Modelo A+B de la exploración: un **modo de seguimiento por insumo** (`NINGUNO` | `SERIE`) y una
tabla **`unidades_insumo`**, una fila por pieza física. Un insumo `NINGUNO` no cambia en nada: el
libro (`movimientos_insumo`), `calcularSaldos()` y el advisory lock por insumo siguen siendo lo que
son. Un insumo `SERIE` suma una capa de identidad encima del libro:

- Cada movimiento de un insumo `SERIE` referencia **una** unidad con cantidad 1; una operación sobre
  N piezas son N movimientos en una transacción.
- El **saldo `SERIE`** que se muestra es el conteo de unidades `EN_DEPOSITO` por condición; lo que
  autoriza una resta ya no es un saldo sino el **estado de la unidad elegida**, leído bajo lock.
- Toda mutación de unidad pasa por **un solo servicio de aplicación**
  (`OperacionesUnidadInsumo`), con forma de lote, que toma el lock del insumo, valida todo antes de
  escribir y deja en la misma transacción el movimiento (si lo hay), el cambio de estado y el evento
  de historial.
- El historial por serial sale de una bitácora propia append-only (`eventos_unidad_insumo`), porque
  cuatro hechos de la vida de una unidad no tienen movimiento de stock (alta sin descuento, descarte
  desde un equipo, reactivación y corrección de serial).

Specs de referencia: `specs/unidades-insumo-serie/spec.md` y el delta
`specs/stock-insumo-condicion/spec.md`; el delta de `componentes-catalogo-unico` debe recoger lo que
fijan ADR-7 y ADR-8. El cambio **no** implementa un punto de `docs/roadmap-comercial.md`.

Respuesta a las preguntas abiertas de la propuesta: D1 → ADR-1 y ADR-5; D2 → ADR-6; D3 → ADR-7;
D4 → ADR-9; D5 → ADR-3; D6 → ADR-4.

---

## Capa donde cae cada pieza (`rules.design`)

| Pieza | Capa | Por qué ahí |
|---|---|---|
| `SEGUIMIENTOS_INSUMO`, `ESTADOS_UNIDAD_INSUMO`, `TIPOS_EVENTO_UNIDAD`, `normalizarSerial()`, `UNIDAD_SERIAL_MAX_LENGTH` | domain (`insumos/domain/entities/unidad-insumo.entity.ts`) | Fuente única que los CHECK, los DTO y el Zod espejan; el spec de constraints compara contra la base |
| Transiciones de estado válidas, "pendiente no sale ni se instala", `unidadId ⇒ cantidad = 1` | domain (`UnidadInsumoEntity`, `MovimientoInsumoEntity`) | Reglas de una sola fila, sin repositorios |
| `InsumoEntity.seguimiento` y `puedeCambiarSeguimiento()` | domain | La regla recibe los conteos ya leídos; no consulta |
| `OperacionesUnidadInsumo` (lote, lock, validar-todo-antes-de-escribir) | application (`insumos/application/services/`) | Orquesta tres repositorios en la transacción del llamador |
| Elección de rama por seguimiento en entrada, salida, ajuste y consulta | application (casos de uso de insumos) | El seguimiento se lee dentro de la transacción (ADR-5) |
| `CambiarSeguimientoInsumoUseCase` | application | Necesita lock, lectura con `FOR UPDATE` y conteos |
| Lectura `FOR SHARE` del seguimiento, CAS de estado, traducción de P2002 a `SerialDuplicadoError` | infrastructure (repos Prisma) | Mecanismos de Postgres |
| CHECK, índices parciales y FKs | infrastructure (una migración tenant) | Backstop; las constantes del dominio se comparan contra la base |
| `seriales`, `unidadId`, `numeroSerie` en los bodies; endpoints de unidades | interface | Enrutamiento por campos del request |
| Zod de diálogos, selector de unidad | interface del frontend | Derivados: la autoridad es el DTO del backend |

**Autorización, sus dos lugares.** Borde: `PATCH /insumos/:id/seguimiento` lleva
`AdminClienteGuard` (mismo gate que el ABM del catálogo); `GET …/unidades` y `GET …/historial`,
`INSUMOS:LECTURA`; `POST …/unidades/:unidadId/serial` (cargar pendiente), `INSUMOS:ALTAS`;
`POST …/unidades/:unidadId/correccion-serial`, `INSUMOS:AJUSTAR` (es explicar una diferencia, igual
que el ajuste). Los endpoints de movimientos, recepción y componentes conservan sus decoradores. Se
eligen dos rutas para el serial y no una con permiso según el estado de la unidad, porque
`@RequiereAcciones` es metadata estática por ruta (ver la cabecera de
`movimientos-insumo.controller.ts`). Inline: ningún chequeo nuevo dentro de los métodos.
Consecuencia asumida, igual que en ciclos anteriores: `EQUIPOS:ALTAS` crea unidades `INSTALADA`
(alta sin descuento) sin permisos de INSUMOS.

---

## Architecture Decisions

### ADR-1: esquema — una migración aditiva con cinco piezas

`<ts>_unidades_insumo_serie` (WU-1):

| Pieza | Definición |
|---|---|
| `unidades_medida.entera` | `BOOLEAN NOT NULL DEFAULT false`; la migración marca `true` en `codigo IN ('UNI','PAR')` y el seeder de tenants también (ADR-3) |
| `insumos.seguimiento` | `VARCHAR(10) NOT NULL DEFAULT 'NINGUNO'`, `CHECK IN ('NINGUNO','SERIE')` |
| `unidades_insumo` | `id`, `insumo_id` FK RESTRICT, `numero_serie VARCHAR(255) NULL` (forma cargada, recortada), `numero_serie_normalizado VARCHAR(255) NULL`, `condicion`, `estado`, `equipo_id` FK RESTRICT NULL, `created_at clock_timestamp()`, `updated_at` |
| `movimientos_insumo.unidad_id` | `UUID NULL` FK RESTRICT; `CHECK (unidad_id IS NULL OR cantidad = 1)`; índice parcial `WHERE unidad_id IS NOT NULL` |
| `componentes_equipo.unidad_id` | `UUID NULL` FK RESTRICT; `CHECK (unidad_id IS NULL OR numero_serie IS NULL)`; `UNIQUE (unidad_id) WHERE unidad_id IS NOT NULL AND deleted_at IS NULL` |
| `eventos_unidad_insumo` | ver ADR-9 |

CHECK con nombre en `unidades_insumo`: condición contra `CONDICIONES_STOCK` y estado contra
`ESTADOS_UNIDAD_INSUMO` = `EN_DEPOSITO`, `INSTALADA`, `ENTREGADA`, `DESCARTADA`;
`(estado = 'INSTALADA') = (equipo_id IS NOT NULL)` (una `ENTREGADA` no refiere equipo: su destino
vive en el movimiento de la SALIDA, ADR-9); `numero_serie IS NOT NULL OR estado = 'EN_DEPOSITO'`
(una pendiente no puede estar instalada, entregada ni descartada); `(numero_serie IS NULL) =
(numero_serie_normalizado IS NULL)`. Unicidad: `UNIQUE (insumo_id, numero_serie_normalizado) WHERE
numero_serie_normalizado IS NOT NULL`, que abarca todos los estados, incluido `DESCARTADA`.

**Serie pendiente = `numero_serie` NULL**, no un flag. Un solo hecho, y el CHECK anterior impide por
construcción instalar, entregar o descartar una pendiente.

**Máquina de estados** (fuente única: `UnidadInsumoEntity`):

| Desde | Hacia | Operación | Movimiento |
|---|---|---|---|
| (nueva) | `EN_DEPOSITO` | entrada, ajuste positivo, recepción, retiro legado | ENTRADA / AJUSTE_POSITIVO |
| (nueva) | `INSTALADA` | alta sin descuento (D3) | — |
| `EN_DEPOSITO` (con serial) | `INSTALADA` | instalar | SALIDA |
| `EN_DEPOSITO` (con serial) | `ENTREGADA` | SALIDA manual | SALIDA |
| `EN_DEPOSITO` (con serial) | `DESCARTADA` | ajuste negativo | AJUSTE_NEGATIVO |
| `INSTALADA` | `EN_DEPOSITO` USADO | retiro `STOCK_USADO` | ENTRADA |
| `INSTALADA` | `DESCARTADA` | retiro `DESCARTE` | — |
| `DESCARTADA` (por retiro) | `INSTALADA` | reactivar | — |

`ENTREGADA` es terminal en este ciclo: no hay operación que la devuelva al depósito.

| Alternativa | Por qué no |
|---|---|
| Flag `serie_pendiente` + serial placeholder | Dos columnas para un hecho; el placeholder ocupa la unicidad |
| Índice único funcional `upper(regexp_replace(numero_serie,'\s','','g'))` | `toUpperCase()` de JS y `upper()` de Postgres difieren fuera de ASCII (`ß`); dos normalizaciones derivan. Con la columna normalizada, la única fuente es `normalizarSerial()` y la base solo compara |
| `componentes_equipo.unidad_id` único sin parcial | Una unidad instalada en E1, devuelta y reinstalada en E2 tendría dos filas de componente; el parcial sobre activos lo admite y conserva el historial del retirado |
| FK compuesta `(unidad_id, insumo_id)` para impedir unidad de otro insumo | Prisma no modela con seguridad una relación que comparte `insumo_id` con otra; una FK solo en SQL sería eliminada por el próximo `migrate dev`. Lo garantiza `OperacionesUnidadInsumo` y lo verifica el spec del invariante |
| Una migración por work unit | Las piezas son inertes con sus defaults y el tracker se integra una sola vez; una migración es una sola migración manual de las bases de test |

### ADR-2: saldo `SERIE` — conteo de unidades para mostrar, estado de la unidad para decidir

**Choice**: `calcularStock()` y `calcularSaldos()` no cambian. Se agrega en el mismo archivo:

```ts
export type ConteoPorCondicion = Readonly<Record<CondicionStock, number>>;
export function saldosDesdeUnidades(conteo: ConteoPorCondicion): SaldosInsumo; // total = suma
```

`ConsultarStockInsumoUseCase` es el **único lector** que ramifica:
`SERIE ? saldosDesdeUnidades(unidadRepo.contarEnDepositoPorCondicion(id)) :
calcularSaldos(movimientoRepo.sumByTipo(id))`. La respuesta suma `seguimiento` y
`pendientesDeSerie`. `estadoReposicion` sigue sobre NUEVO. `INSTALADA`, `ENTREGADA` y `DESCARTADA`
no cuentan.

Salida y ajuste negativo `SERIE` no comparan saldos: autorizan si la unidad elegida está
`EN_DEPOSITO`, con serial, en ese insumo y (si viene) en la condición pedida, leída `FOR UPDATE`
bajo el advisory lock. Rechazan con `UnidadNoDisponibleError` (422), no con
`StockInsuficienteError`.

**Invariante**: para todo insumo `SERIE` y condición, `conteo EN_DEPOSITO == calcularSaldos(libro)`.
Se sostiene porque cada transición que cambia `EN_DEPOSITO` escribe su movimiento en la misma
transacción, y las que no lo cambian (alta instalada, descarte desde equipo, reactivar, serial) no
escriben movimiento. Lo verifica `invariante-serie.integration.spec.ts` con el helper
`insumos/testing/invariante-serie.ts`, que compara las dos fuentes y además que el último evento de
cada unidad coincide con su estado.

| Opción | Decisión |
|---|---|
| Saldo `SERIE` desde el libro y unidades solo como identidad | Rechazada: contradice P9 (el dueño eligió "el saldo cuenta unidades") |
| Una columna de saldo materializada | Rechazada: tercera fuente |
| Conteo para mostrar, estado para decidir, libro como verificación | **Elegida**: no hay segunda fórmula por tipo; un rollback al binario viejo ve el mismo número mientras el invariante valga |

### ADR-3: activación de `SERIE` — endpoint propio, lock, unidad de medida entera

**Choice**: `CambiarSeguimientoInsumoUseCase` (`PATCH /insumos/:id/seguimiento`, body
`{ seguimiento }`). En `txRunner.run()`:

1. `movimientoRepo.bloquearStock(id)` (advisory lock; `lockAndSumByTipo` pasa a llamarlo).
2. `insumoRepo.leerParaCambioDeSeguimiento(id)` con `SELECT … FOR UPDATE`: espera a las entradas en
   vuelo que tienen la fila `FOR SHARE` (ADR-5).
3. Recién entonces lee (nueva instantánea de `READ COMMITTED`) el saldo del libro y el conteo de
   unidades `EN_DEPOSITO` o `INSTALADA`.
4. `NINGUNO → SERIE`: exige `calcularSaldos(...).total === 0` y unidad de medida `entera`.
   `SERIE → NINGUNO` (decisión del dueño): exige cero unidades `EN_DEPOSITO` y cero `INSTALADA`. Las
   `ENTREGADA` y `DESCARTADA` no lo impiden, no se tocan y conservan su historial.
   Error: `SeguimientoNoModificableError` (422) con el motivo.

El alta (`POST /insumos`) acepta `seguimiento` con la única regla de la unidad entera (saldo 0 por
construcción). `EditarInsumoUseCase` rechaza cambiar la unidad de medida de un insumo `SERIE` a una
no entera (`UnidadMedidaNoEnteraError`, 422). El `PATCH /insumos/:id` general **no** toca
`seguimiento`: el agregado se guarda con escrituras anidadas que no pueden correr bajo el lock.

**Unidad entera (D5)**: atributo `entera` en `unidades_medida`, sembrado en `UNI` y `PAR`, de solo
lectura en este ciclo. Una lista cerrada por código se rechaza porque `codigo` es editable
(`EditarUnidadMedidaUseCase`): renombrar `UNI` rompería un insumo `SERIE` vigente. La validación de
cantidad entera en cada operación `SERIE` no depende de la unidad de medida: la exige
`OperacionesUnidadInsumo` (`CantidadNoEnteraError`, 422).

### ADR-4: `OperacionesUnidadInsumo` — la única puerta de las unidades, con forma de lote

```ts
export interface ContextoUnidad { usuarioId: string; motivo?: string | null }
export interface ItemEnEquipo { unidadId: string; equipoId: string }

export class OperacionesUnidadInsumo {
  ingresar(insumoId: string, piezas: { numeroSerie: string | null }[],
    o: ContextoUnidad & { condicion: CondicionStock; tipo: 'ENTRADA' | 'AJUSTE_POSITIVO';
      itemCompraId?: string | null; equipoId?: string | null }): Promise<Result<UnidadConMovimiento[], DomainError>>;
  sacarDelDeposito(insumoId: string, unidadIds: string[],
    o: ContextoUnidad & { tipo: 'SALIDA' | 'AJUSTE_NEGATIVO'; condicion?: CondicionStock;
      equipoId?: string | null; sectorId?: string | null }): Promise<Result<UnidadConMovimiento[], DomainError>>; // SALIDA → ENTREGADA; AJUSTE_NEGATIVO → DESCARTADA
  instalar(items: ItemEnEquipo[], o: ContextoUnidad): Promise<Result<UnidadConMovimiento[], DomainError>>;          // EN_DEPOSITO → INSTALADA + SALIDA
  devolverAlDeposito(items: ItemEnEquipo[], o: ContextoUnidad): Promise<Result<UnidadConMovimiento[], DomainError>>; // INSTALADA → EN_DEPOSITO USADO + ENTRADA USADO
  descartarInstaladas(items: ItemEnEquipo[], o: ContextoUnidad): Promise<Result<UnidadInsumoEntity[], DomainError>>; // INSTALADA → DESCARTADA, sin movimiento
  reinstalar(items: ItemEnEquipo[], o: ContextoUnidad): Promise<Result<UnidadInsumoEntity[], DomainError>>;          // DESCARTADA → INSTALADA, sin movimiento
  altaInstalada(insumoId: string, numeroSerie: string, equipoId: string, o: ContextoUnidad & { condicion: CondicionStock }): Promise<Result<UnidadInsumoEntity, DomainError>>;
  cargarSerial(unidadId: string, numeroSerie: string, o: ContextoUnidad): Promise<Result<UnidadInsumoEntity, DomainError>>;
  corregirSerial(unidadId: string, numeroSerie: string, o: ContextoUnidad): Promise<Result<UnidadInsumoEntity, DomainError>>; // motivo obligatorio
}
```

Contrato común:

- **Exige transacción activa** (lanza si `enTransaccion` no es `true`, mismo criterio que
  `lockAndSumByTipo`). No abre la suya: `run()` es re-entrante sin savepoint, y un `Result.fail`
  devuelto tras una escritura dejaría la mitad del lote en la transacción del llamador.
- **Validar todo, después escribir.** Toma los advisory locks de los insumos involucrados en orden
  de id, lee las unidades con `FOR UPDATE` en orden de id (sin deadlock entre lotes), valida cada
  una y solo entonces escribe. Un `Result.fail` nunca sigue a una escritura; el llamador lo convierte
  en excepción dentro de su `run()` (patrón `FalloSalidaDeStock`). Una violación de unicidad (P2002)
  es la única falla posterior a escribir: el repo la traduce a `SerialDuplicadoError` **lanzado**
  como `FalloOperacionDeUnidad` (exportada), y el caso de uso la desenvuelve afuera.
- La transición es un CAS (`UPDATE … WHERE id = ? AND estado = ?`); 0 filas bajo `FOR UPDATE` es un
  bug y lanza.
- `insumoId` de cada unidad debe coincidir con el del movimiento (sustituye a la FK compuesta de
  ADR-1). El insumo debe ser `SERIE`.

Esto cubre D6: la baja de equipo completo llamará `devolverAlDeposito` o `descartarInstaladas` con
todas las unidades `INSTALADA` del equipo y un `motivo` compartido; el catálogo cerrado de motivos
queda para ese ciclo. Ese ciclo no produce `ENTREGADA`: la entrega es propia de la SALIDA manual
desde el depósito (`sacarDelDeposito`). Rechazado: una operación por unidad con transacción propia (el lote no sería atómico) y
métodos en la entidad `InsumoEntity` (necesitan repositorios).

### ADR-5: movimientos `SERIE` — el seguimiento se lee dentro de la transacción

| Caso de uso | `NINGUNO` | `SERIE` |
|---|---|---|
| Entrada manual | Como hoy; rechaza `seriales` (`UnidadNoAdmitidaError`) | `seriales` obligatorio, `length === cantidad`, sin pendientes (`SerialesNoCoincidenError`) → `ingresar` |
| Ajuste positivo | Como hoy | Igual que la entrada, `tipo: 'AJUSTE_POSITIVO'`; el motivo ya lo exige la entidad |
| Salida | Como hoy; rechaza `unidadId` | `unidadId` obligatorio (`UnidadRequeridaError`), `cantidad` 1 → `sacarDelDeposito`; la unidad queda `ENTREGADA` (decisión del dueño) |
| Ajuste negativo | Como hoy | Igual que la salida, con motivo; la unidad queda `DESCARTADA` |

**Destino de la entrega.** El DTO de la salida ya trae `sectorId`, `equipoId` (trazabilidad) y
`motivo`; no hay campo de destinatario y este ciclo no lo agrega. El destino queda en el movimiento
SALIDA y el evento `ENTREGA` lo referencia por `movimiento_id` (ADR-9); quien quiera nombrar a una
persona lo escribe en el motivo. Un `equipoId` en la salida no instala la unidad: para eso está el
alta de componente.
| Consulta de stock | `calcularSaldos` | `saldosDesdeUnidades` (ADR-2) |

`condicion` en salida y ajuste negativo `SERIE`: opcional; si viene y no coincide con la unidad,
`UnidadNoDisponibleError`. El frontend no la envía.

**La carrera con la activación.** La entrada no toma el advisory lock (su JSDoc explica por qué) y
por eso podría asentar un movimiento sin unidad justo cuando otro usuario activa `SERIE`. Se cierra
así: la entrada pasa a abrir transacción siempre y lee el seguimiento con
`insumoRepo.leerSeguimientoParaMovimiento(id)` (`SELECT seguimiento … FOR SHARE`). Los `FOR SHARE`
no se bloquean entre sí, así que las entradas no se serializan; la activación (ADR-3) toma
`FOR UPDATE` y espera. Salida y ajuste leen el seguimiento después del advisory lock, que la
activación también toma. Costo: una ida y vuelta más por entrada `NINGUNO`. Rechazado: un trigger
de Postgres (regla de negocio fuera del dominio) y tomar el advisory lock en toda entrada (contradice
la decisión vigente de no serializar recepciones).

### ADR-6: recepción de compra `SERIE` (D1, D2)

`RegistrarRecepcionDeItemDto` suma `seriales?: string[]`. Con insumo `SERIE`, dentro de la misma
transacción de hoy: el delta debe ser entero (`CantidadNoEnteraError`, 422, rechaza toda la
recepción); `seriales.length ≤ delta` (si no, `SerialesNoCoincidenError`); se llama
`registrarEntradaInsumo.execute({ …, seriales, completarConPendientes: true })`, que rellena con
unidades pendientes hasta el delta. `completarConPendientes` no es un campo del DTO HTTP de la
entrada manual: lo pasa solo la recepción, junto a `itemCompraId`, por el mismo criterio de origen
que ya documenta el caso de uso. Delta cero: no crea nada (idempotencia intacta). Una recepción
parcial crea solo las unidades de su delta. La recepción queda completa aunque haya pendientes;
los seriales se completan después desde la ficha (`cargarSerial`, evento `SERIAL_CARGADO`, sin
movimiento ni motivo).

Rechazado: recepción "abierta" que no crea unidades hasta tener seriales (el saldo no subiría con
mercadería físicamente en depósito, y el delta acumulado no sabría qué falta crear).

### ADR-7: equipos — instalar, alta sin descuento, retiro y reactivar

- **Instalar con descuento** (`InstalarComponenteDesdeDepositoUseCase`): con `unidadId`, dentro de
  la transacción, `agregarComponente` (componente con `unidadId`, `numeroSerie` NULL) →
  `operaciones.instalar([{ unidadId, equipoId }])` → `vincularInstalacion(salida.id)`. Sin
  `unidadId`, el camino de hoy; si el insumo es `SERIE`, la salida lo rechaza con
  `UnidadRequeridaError`. `numeroSerie` y `condicion` del body se ignoran con `unidadId`.
- **Alta sin descuento (D3)**: con insumo `SERIE`, `numeroSerie` es obligatorio;
  `operaciones.altaInstalada()` crea la unidad `INSTALADA` con la condición indicada (NUEVO por
  defecto; con `descontarStock: false` la condición no se ignora cuando el insumo es `SERIE`,
  porque es un dato de la unidad), sin movimiento, con evento
  `ALTA_INSTALADA`, y el componente nace con `unidadId`. Con `NINGUNO`, como hoy.
- **Retiro `STOCK_USADO`**: `registrarDevolucionDeComponente` suma `unidadId?` y `numeroSerie?`
  y ramifica: componente con unidad → `devolverAlDeposito` (la unidad vuelve USADO con su serial);
  componente **legado** de un insumo hoy `SERIE` → `numeroSerie` obligatorio en el body del retiro
  e `ingresar` USADO con `equipoId`; **no** admite serie pendiente: sin serial,
  `SerialRequeridoError` (422) y no cambia nada (decisión del dueño). El diálogo precarga el serial
  con el `numeroSerie` de texto del componente cuando no está vacío y es válido (recortado, 1–255;
  la unicidad la decide el backend); si no, el campo queda vacío y obligatorio. Insumo `NINGUNO`,
  como hoy. Sus guards de insumo y familia (ADR-4 del ciclo anterior) no cambian.
- **Retiro `DESCARTE`**: con unidad, `descartarInstaladas` (sin movimiento).
- **Reactivar**: pasa a correr en transacción; con unidad, `reinstalar`. Si el insumo ya no es
  `SERIE`, `SeguimientoNoModificableError`: reinstalar crearía una unidad viva en un insumo
  `NINGUNO`. Se conserva la asimetría vigente: tras `STOCK_USADO` sigue rechazado.
- **Editar componente**: con unidad, `numeroSerie` en el PATCH se rechaza con
  `SerialDeUnidadNoEditableError` (422): se corrige desde la unidad (ADR-9). Legado, como hoy.
- **Lectura**: `PrismaComponenteEquipoRepository` incluye `unidad.numeroSerie` y el mapper lo expone
  como `numeroSerie` del componente; `save()` escribe NULL en `numero_serie` cuando hay unidad. Una
  sola fuente del serial, sin tocar los lectores del frontend.

### ADR-8: contratos del borde

| Contrato | Cambio |
|---|---|
| `CreateInsumoHttpDto` / respuesta | `seguimiento?` (`@IsIn(SEGUIMIENTOS_INSUMO)`) / `seguimiento` |
| `UnidadMedidaResponseDto` | `entera` |
| `RegistrarMovimientoInsumoHttpDto` (lo hereda el ajuste) | `seriales?: string[]` (`@ArrayMaxSize(100)`, cada uno recortado, 1–255), `unidadId?: uuid` |
| Recepción de compra | `seriales?: string[]` |
| `StockInsumoResponseDto` | `seguimiento`, `pendientesDeSerie` |
| `MovimientoInsumoResponseDto` | `unidadId`, `numeroSerie` (include) |
| `GET /insumos/:id/unidades?estado=&disponibles=` | `UnidadInsumoResponseDto[]` (`id`, `numeroSerie`, `condicion`, `estado`, `equipoId`, `equipoNombre`); `disponibles=true` = `EN_DEPOSITO` con serial |
| `GET /insumos/:id/unidades/:unidadId/historial` | `EventoUnidadResponseDto[]` cronológico |
| `POST …/unidades/:unidadId/serial` | `{ numeroSerie }` |
| `POST …/unidades/:unidadId/correccion-serial` | `{ numeroSerie, motivo }` (`transformarMotivo`, 500) |
| `CreateComponenteHttpDto` | `unidadId?`; con `descontarStock=false` el controller pasa `condicion` solo para que el caso de uso la aplique a la unidad de un insumo `SERIE` (D3); con `NINGUNO` se sigue ignorando |
| `RetirarComponenteHttpDto` | `numeroSerie?` (solo retiro legado de insumo `SERIE`) |
| `ComponenteResponseDto` | `unidadId`; `numeroSerie` resuelto (ADR-7) |

Errores nuevos (insumos): `SerialDuplicadoError` (409), `UnidadNoDisponibleError`,
`UnidadRequeridaError`, `UnidadNoAdmitidaError`, `SerialesNoCoincidenError`, `SerialRequeridoError`,
`CantidadNoEnteraError`, `SeguimientoNoModificableError`, `UnidadMedidaNoEnteraError`,
`UnidadNoEncontradaError` (404) — 422 salvo indicación. Equipos: `SerialDeUnidadNoEditableError`.
Todos con mapeo explícito en su controller.

### ADR-9: historial y corrección — bitácora propia `eventos_unidad_insumo` (D4)

Tabla append-only: `id`, `unidad_id` FK, `tipo` (`CHECK` contra `TIPOS_EVENTO_UNIDAD`: `INGRESO`,
`ALTA_INSTALADA`, `SERIAL_CARGADO`, `CORRECCION_SERIAL`, `INSTALACION`, `RETIRO_A_DEPOSITO`,
`DESCARTE`, `ENTREGA`, `BAJA_DE_DEPOSITO`, `REACTIVACION`), `movimiento_id` FK `UNIQUE` NULL, `equipo_id` FK
NULL, `serial_anterior`, `serial_nuevo`, `motivo`, `usuario_id` (soft ref), `created_at
clock_timestamp()`; índice `(unidad_id, created_at)`. El puerto solo tiene `insert` y
`listarPorUnidad`. La corrección de serial es un evento `CORRECCION_SERIAL` con los dos seriales,
motivo y usuario: el registro auditado **es** el historial.

| Alternativa | Por qué no |
|---|---|
| Historial derivado del libro | El libro no ve alta sin descuento, descarte desde equipo, reactivar ni correcciones |
| Derivado de libro + componentes + tabla de correcciones | Tres fuentes unidas por fecha; el orden entre ellas no es confiable |
| Tabla solo de correcciones | Resuelve P8 pero no P7 |

El evento referencia el movimiento por id; no copia cantidad ni condición. `ENTREGA` (SALIDA manual,
la unidad queda `ENTREGADA`) y `BAJA_DE_DEPOSITO` (AJUSTE_NEGATIVO, queda `DESCARTADA`) llevan
siempre `movimiento_id`; el historial muestra el destino de la entrega leyendo `sector_id`,
`equipo_id` y `motivo` de ese movimiento, sin copiarlos al evento.

### ADR-10: una entrega, rollback por estado

El tracker se integra a `main` y se despliega una vez (los estados intermedios no son desplegables:
el backend exige `seriales` antes de que el frontend los envíe). Runbook, sección "Rollback del
tracker `repuestos-numero-de-serie`", con detector de solo lectura por tenant:

```sql
SELECT (SELECT count(*) FROM insumos WHERE seguimiento = 'SERIE') AS insumos_serie,
       (SELECT count(*) FROM unidades_insumo)                   AS unidades;
```

- **Ambos en 0**: revertir el código es gratis; la migración queda (defaults inertes).
- **> 0**: preferir corregir hacia adelante. El binario viejo suma el libro (coincide mientras valga
  el invariante) pero asienta salidas sin unidad en insumos `SERIE`, rompiendo el invariante, y su
  edición del serial de un componente con unidad choca con el CHECK (500 acotado a esas filas). La
  vía fiel es restaurar el dump de `predeploy-dump.ps1`; revertir sin restaurar exige, antes de
  volver a desplegar el ciclo, conciliar con
  `SELECT … FROM movimientos_insumo m JOIN insumos i ON i.id = m.insumo_id WHERE i.seguimiento =
  'SERIE' AND m.unidad_id IS NULL`.

### ADR-11: Ayuda

Escritura suspendida. Revisado: `equipos-listado.md:11` (serial del equipo), `compras-insumos-stock.md`
(la recepción sigue subiendo el stock por delta) y `permisos-y-roles.md:145-184` (los ajustes siguen
pidiendo `AJUSTAR` y motivo) siguen siendo verdaderos. `sdd-apply` repite la búsqueda en la WU de
cada superficie; si algo queda falso, se corrige en esa WU. Deuda anotada en commit y PR de las WU
12 a 17.

---

## Data Flow

```
Entrada / recepción SERIE
  Diálogo o recepción ── seriales[] ──▶ RegistrarEntrada.execute
     tx ─┬ leerSeguimientoParaMovimiento (FOR SHARE) = SERIE
         └ Operaciones.ingresar ─ lock insumo ─ valida ─┬ INSERT unidad (serial normalizado | NULL)
                                                        ├ INSERT movimiento (unidadId, cantidad 1)
                                                        └ INSERT evento INGRESO
Instalar
  ComponenteCreateDialog ── unidadId ──▶ Instalar ─ tx ─┬ AgregarComponente (unidadId)
                                                       ├ Operaciones.instalar ─ lock ─ FOR UPDATE
                                                       │   EN_DEPOSITO→INSTALADA + SALIDA + evento
                                                       └ vincularInstalacion(salida.id)
Ficha
  GET /stock ── SERIE ? conteo EN_DEPOSITO : calcularSaldos(libro)
  GET /unidades · GET /historial ◀── eventos_unidad_insumo
```

---

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `backend/prisma_tenant/schema.prisma` + `migrations/<ts>_unidades_insumo_serie/` | Modify/Create | ADR-1 |
| `backend/src/clientes/infrastructure/tenant-seeder.adapter.ts` (+integración) | Modify | `entera` en el piso sembrado (`UNIDADES_MEDIDA`) |
| `backend/src/insumos/domain/entities/unidad-insumo.entity.ts`, `evento-unidad-insumo.entity.ts` (+specs) | Create | Catálogos, normalización, transiciones |
| `.../entities/insumo.entity.ts`, `unidad-medida.entity.ts`, `movimiento-insumo.entity.ts`, `tipo-movimiento-insumo.ts` (+specs) | Modify | `seguimiento`, `entera`, `unidadId`, `saldosDesdeUnidades` |
| `.../ports/i-unidad-insumo.repository.ts`, `i-evento-unidad-insumo.repository.ts` | Create | Puertos |
| `.../ports/i-insumo.repository.ts`, `i-movimiento-insumo.repository.ts` | Modify | Lecturas `FOR SHARE`/`FOR UPDATE`; `bloquearStock` |
| `.../prisma/prisma-unidad-insumo.repository.ts`, `prisma-evento-unidad-insumo.repository.ts`, mappers (+integración) | Create | ADR-1, ADR-4 |
| `.../prisma/*-constraints.integration.spec.ts` | Modify/Create | CHECK contra catálogos |
| `.../application/services/operaciones-unidad-insumo.service.ts` (+spec, +integración de lote) | Create | ADR-4 |
| `.../use-cases/registrar-{entrada,salida,ajuste}-insumo.use-case.ts`, `consultar-stock-insumo.use-case.ts` (+specs) | Modify | ADR-2, ADR-5 |
| `.../use-cases/cambiar-seguimiento-insumo.use-case.ts`, `listar-unidades-insumo`, `consultar-historial-unidad`, `cargar-serial-unidad`, `corregir-serial-unidad` (+specs) | Create | ADR-3, ADR-8, ADR-9 |
| `.../use-cases/crear-insumo.use-case.ts`, `editar-insumo.use-case.ts` (+specs) | Modify | ADR-3 |
| `.../application/services/invariante-serie.integration.spec.ts`, `insumos/testing/invariante-serie.ts` | Create | ADR-2 |
| `.../interface/dtos/*`, `controllers/insumos.controller.ts`, `movimientos-insumo.controller.ts`, `unidades-insumo.controller.ts` (+specs, e2e) | Modify/Create | ADR-8 |
| `backend/src/compras/.../registrar-recepcion-de-item.use-case.ts`, DTO, controller (+spec, e2e) | Modify | ADR-6 |
| `backend/src/equipos/domain/entities/componente-equipo.entity.ts`, mapper, repo, `equipos.errors.ts` | Modify | `unidadId`, serial resuelto |
| `.../use-cases/{instalar-componente-desde-deposito,agregar-componente,retirar-componente,reactivar-componente,editar-componente}.use-case.ts` (+specs, integración) | Modify | ADR-7 |
| `.../interface/dtos/equipos.dto.ts`, `equipos.controller.ts` (+e2e) | Modify | ADR-8 |
| `frontend/src/features/insumos/{types,schemas}.ts`, `insumo-form-dialog.tsx`, `insumo-detail-view.tsx` | Modify | Seguimiento, sección de unidades |
| `frontend/src/features/insumos/components/{unidades-insumo-section,unidad-historial-dialog,unidad-serial-dialog,selector-unidad,seriales-input}.tsx`, `hooks/use-unidades-insumo.ts` (+tests) | Create | ADR-8 |
| `frontend/src/features/insumos/components/movimiento-*-dialog.tsx` (+tests) | Modify | Seriales y selector de unidad |
| `frontend/src/features/compras/components/registrar-avance-dialog.tsx`, schemas (+tests) | Modify | Seriales en la recepción |
| `frontend/src/features/equipos/components/componente-create-dialog.tsx`, `componente-retiro-dialog.tsx`, `componente-edit-dialog.tsx`, types (+tests) | Modify | Unidad, serial D3, retiro legado |
| `DEPLOY-VPS-runbook.md` | Modify | ADR-10 |

---

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Unit (dominio) | `normalizarSerial` (mayúsculas, espacios internos, vacío); transiciones válidas e inválidas; pendiente no instala; `unidadId ⇒ cantidad 1`; `saldosDesdeUnidades`; `puedeCambiarSeguimiento` | Specs puros |
| Unit (aplicación) | Ramas `NINGUNO`/`SERIE` de cada caso de uso; validar-todo-antes-de-escribir (un fallo en la unidad 2 no escribe la 1); recepción fraccional, parcial y con pendientes; D3; retiro legado con serial; reactivar con insumo ya `NINGUNO` | Fakes; `sumas-movimiento.ts` |
| Integración | CHECK y catálogos con `pg_get_constraintdef`; índice único con serial normalizado y en `DESCARTADA`; CAS; P2002 → `SerialDuplicadoError`; lote que revierte entero; **invariante** paso a paso (escenario de la spec) | Base tenant efímera; `soporte_tenant_test` migrada a mano en WU-1 |
| Concurrencia | Mismo serial en dos entradas ⇒ una; misma unidad en dos instalaciones o salidas ⇒ una; activación contra entrada en vuelo ⇒ la activación ve el saldo y rechaza | Molde de `prisma-movimiento-insumo.repository.concurrencia.integration.spec.ts` |
| E2E | Endpoints nuevos con y sin permiso (403); 409 de serial; 422 de cada error; recepción con seriales; alta de componente con unidad y D3 | Todo spec que trunque `soporte_master_test` llama `usarLockMasterTest()` |
| Frontend | Selector de unidad solo con disponibles; cantidad fija en 1; N inputs de serial; recepción con blancos; alta con unidad o serial según seguimiento; retiro legado precargado; invalidación de `["insumo", id, "unidades"]` además de stock y movimientos | MSW + `renderWithProviders` |
| Adversarial (verify) | Quitar el `FOR UPDATE` ⇒ rojo en concurrencia; contar `INSTALADA` o `ENTREGADA` en el saldo ⇒ rojo en el invariante; salida que deja `DESCARTADA` ⇒ rojo; quitar el `FOR SHARE` ⇒ rojo en activación | `rules.verify` |

TDD no se inyecta: es una feature.

---

## Threat Matrix

N/A: no hay enrutamiento, shell, subprocesos, automatización de VCS o PR, ni clasificación de
archivos ejecutables. `deploy.ps1` no cambia; el runbook suma texto y una consulta de solo lectura.

---

## Migration / Rollout

1. `predeploy-dump.ps1 -DryRun` y la corrida real.
2. `deploy.ps1`: pull → builds → `migrate:tenants` → arranque; backend y frontend en la misma
   corrida.
3. Verificación: `\d unidades_insumo` en un tenant; el detector en 0; `unidades_medida` con `entera`
   en `UNI` y `PAR` (un tenant que renombró `UNI` debe marcarse a mano: se lista con
   `SELECT codigo, entera FROM unidades_medida`).
4. El dueño activa `SERIE` insumo por insumo, con saldo cero.

**Bases locales** (WU-1): `DATABASE_URL_TENANT=postgresql://soporte:soporte@localhost:5432/soporte_tenant_test
pnpm migrate:tenant` y `pnpm migrate:tenants` para las de desarrollo. Rollback: ADR-10.

---

## Work Units y presupuesto de revisión

Estimaciones **ya corregidas** (el real del repo es 2–3 veces la estimación ingenua; renombres,
reescrituras de spec y borrados cuentan). Feature Branch Chain sobre el tracker
`feat/repuestos-numero-de-serie`, auto-chain; cada WU queda en verde y se revierte sola.

| # | Unidad | Depende de | Estimación (+/−) |
|---|---|---|---|
| 1 | Migración, `schema.prisma`, catálogos de dominio, seed de `entera`, spec de constraints, migración manual de bases locales | — | ~300 |
| 2 | Dominio: `UnidadInsumoEntity`, evento, `seguimiento`, `entera`, `unidadId` en el movimiento, mappers | 1 | ~380 |
| 3 | Persistencia: repos de unidad y evento, `bloquearStock`, lecturas `FOR SHARE`/`FOR UPDATE`, integración y concurrencia de serial | 2 | ~380 (corte: repo de eventos aparte) |
| 4 | Operaciones de depósito: `ingresar`, `sacarDelDeposito` (`ENTREGADA` / `DESCARTADA`), `cargarSerial`, `corregirSerial`, helper del invariante | 3 | ~380 |
| 5 | Operaciones de equipo: `instalar`, `devolverAlDeposito`, `descartarInstaladas`, `reinstalar`, `altaInstalada`, integración de lote | 4 | ~350 |
| 6 | Seguimiento del catálogo: alta, `CambiarSeguimientoInsumoUseCase`, guard de edición, borde y e2e | 3 | ~350 |
| 7a | Entrada y ajuste positivo `SERIE` (transacción + `FOR SHARE`) | 4, 6 | ~330 |
| 7b | Salida, ajuste negativo y consulta `SERIE`; spec del invariante | 7a | ~350 |
| 8 | Borde HTTP de insumos: DTOs, endpoints de unidades, historial y serial, e2e | 7b | ~380 |
| 9 | Recepción `SERIE` (compras) | 7a | ~250 |
| 10 | Equipos: entidad, mapper con serial resuelto, editar, instalar con unidad, D3, borde, e2e | 5, 7b | ~400 (corte: D3 aparte) |
| 11 | Equipos: retiro con unidad y legado con serial, reactivar en transacción, concurrencia | 10 | ~350 |
| 12 | Frontend: tipos, schemas, seguimiento en el ABM | 6 | ~300 |
| 13 | Frontend: sección de unidades e historial en la ficha | 8, 12 | ~350 |
| 14 | Frontend: cargar y corregir serial | 13 | ~250 |
| 15 | Frontend: seriales y selector de unidad en los diálogos de movimiento | 13 | ~400 (corte: entrada/ajuste+ y salida/ajuste−) |
| 16 | Frontend: seriales en la recepción | 9, 12 | ~250 |
| 17 | Frontend: equipos (unidad o serial en el alta, serial en el retiro legado) | 11, 13 | ~350 |
| 18 | Runbook: rollback y detector | 11 | ~80 |

Orden de la cadena: 1, 2, 3, 4, 5, 6, 7a, 7b, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18. El forecast
formal es trabajo de `sdd-tasks`.

**Por qué cada WU queda en verde.** Hasta WU-6 ningún insumo puede ser `SERIE` por HTTP y todo lo
nuevo es inerte (defaults). `unidadId` es opcional en `MovimientoInsumoEntity.create()` desde WU-2,
así que ningún llamador cambia antes de su WU. Las ramas `SERIE` de cada caso de uso entran con sus
tests en la misma WU.

---

## Open Questions

Ninguna bloquea. Resueltas por el dueño el 2026-09-30 y ya reflejadas en las tres specs:

- [x] La SALIDA manual `SERIE` deja la unidad `ENTREGADA` (estado nuevo, fuera del depósito, con su
      destino en el historial); el AJUSTE_NEGATIVO la deja `DESCARTADA` (ADR-1, ADR-5, ADR-9).
- [x] Retirar al stock un componente legado de un insumo hoy `SERIE` exige serial, precargado desde el
      serial de texto cuando es válido, sin serie pendiente; reactivar un componente con unidad exige
      que el insumo siga `SERIE` (ADR-7).
- [x] `SERIE → NINGUNO` solo sin unidades `EN_DEPOSITO` ni `INSTALADA`; las `ENTREGADA` y
      `DESCARTADA` conservan su historial (ADR-3).

Decisiones del diseño que siguen a la vista:

- [ ] `ENTREGADA` es terminal en este ciclo: una pieza entregada que vuelve no tiene camino de
      reingreso (la unicidad abarca todos los estados).
- [ ] `entera` no es editable en el ABM de unidades de medida en este ciclo: una unidad creada por un
      tenant no admite `SERIE` hasta un ciclo que la exponga.
- [ ] Una pieza dada de baja por ajuste negativo y luego encontrada no puede reingresar con su serial
      (la unicidad abarca `DESCARTADA`, por spec); recuperarla queda fuera de alcance.

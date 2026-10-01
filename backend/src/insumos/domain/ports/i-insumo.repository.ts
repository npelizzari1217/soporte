import { InsumoEntity } from '../entities/insumo.entity';
import type { SeguimientoInsumo } from '../entities/unidad-insumo.entity';

/**
 * Prefijo de la serie de `codigo` autogenerado (issue #162). Las dos series
 * son independientes y correlativas dentro del tenant: `REP` para los
 * insumos nacidos en una familia de repuestos, `INS` para el resto. El
 * prefijo dice DÓNDE NACIÓ el insumo, no dónde está — no se recalcula si el
 * insumo cambia de familia después.
 */
export type PrefijoCodigoInsumo = 'INS' | 'REP';

/**
 * ConflictoCodigoAlternativo — un par `(codigo, fabricante)` ya tomado, junto
 * con el insumo que lo tiene. El `insumoId` viaja porque el mensaje de error
 * necesita distinguir el choque con otro insumo del choque con el que se está
 * editando, y sin él habría que volver a consultar.
 */
export interface ConflictoCodigoAlternativo {
  codigo: string;
  fabricante: string | null;
  insumoId: string;
}

/**
 * Proyección de solo lectura: la familia de un insumo, sin el agregado.
 * NO es `InsumoEntity` ni `FamiliaInsumoEntity` a propósito — no se puede
 * pasar a ningún `save()`, así que no puede borrar listas en silencio.
 * `activo` y `deletedAt` viajan CRUDOS: colapsarlos acá metería una regla de
 * presentación en el repositorio; quien decide es el caso de uso.
 *
 * Ref: sdd/repuestos-autoridad-catalogo (ADR-3) — la resuelve
 * `findFamiliasDeInsumos()`, para que `ObtenerEquipoUseCase` muestre el tipo
 * de un componente vinculado desde el catálogo del tenant, no desde MASTER.
 */
export interface FamiliaDeInsumo {
  insumoId: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  deletedAt: Date | null;
}

/**
 * Proyección de solo lectura de una fila del catálogo para el reporte de
 * stock. NO es `InsumoEntity`: no se puede pasar a `save()`. `stockMinimo`
 * viaja ya como `number` (la columna es `Decimal`) y `null` si el insumo no
 * tiene punto de reposición. `activo` viaja crudo: el reporte incluye los
 * deshabilitados y deja que la presentación los distinga.
 */
export interface FilaCatalogoStock {
  insumoId: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  seguimiento: SeguimientoInsumo;
  stockMinimo: number | null;
  familia: { id: string; nombre: string; esRepuesto: boolean };
  unidadMedida: { codigo: string; nombre: string; entera: boolean };
}

/** Filtros de catálogo del reporte de stock; ambos opcionales. */
export interface FiltrosCatalogoStock {
  familiaId?: string;
  esRepuesto?: boolean;
}

/**
 * IInsumoRepository — puerto de acceso al catálogo de insumos del tenant.
 * `InsumoEntity` es la raíz del agregado: todos estos métodos lo devuelven o
 * lo persisten COMPLETO —con sus códigos alternativos Y con su
 * compatibilidad—, nunca por separado.
 *
 * Que el agregado viaje entero no es prolijidad: una lectura que trajera una
 * de esas listas vacía y un `save()` posterior la persistirían vacía, borrando
 * lo guardado sin un solo error ni log.
 *
 * **Excepción a esa regla, explícita**: `findFamiliasDeInsumos()` devuelve una
 * proyección (`FamiliaDeInsumo`) que NO es `InsumoEntity` y por lo tanto no es
 * pasable a `save()` — el peligro que la regla de arriba previene no existe
 * ahí (sdd/repuestos-autoridad-catalogo, ADR-3).
 */
export interface IInsumoRepository {
  /**
   * Busca un insumo por id, con sus códigos alternativos y su compatibilidad.
   * Retorna `null` si no existe.
   */
  findById(id: string): Promise<InsumoEntity | null>;

  /**
   * Busca un insumo por su `codigo`, que llega YA normalizado
   * (`trim().toUpperCase()`) desde la capa de aplicación — el repositorio no
   * normaliza.
   *
   * NO filtra por `activo` ni por `deletedAt` a propósito: el índice
   * `insumos_codigo_key` no es parcial, así que un código sigue tomado aunque
   * su insumo esté deshabilitado o dado de baja. Filtrar acá haría que la
   * capa de aplicación diera por libre un código que el INSERT después
   * rechaza con un 23505.
   *
   * Trae el agregado completo, con sus códigos alternativos y su
   * compatibilidad.
   */
  findByCodigo(codigo: string): Promise<InsumoEntity | null>;

  /**
   * Resuelve, en UNA consulta, cuáles de los pares dados ya están tomados en
   * el tenant. El UNIQUE `(codigo, fabricante)` es GLOBAL —no por insumo—, así
   * que la comparación es contra todo el catálogo.
   *
   * Va en una sola consulta y no en una por par porque la lista de un insumo
   * puede tener decenas de códigos y el alta haría una ida y vuelta por cada
   * uno.
   *
   * @param pares Pares a verificar, con `codigo` y `fabricante` YA normalizados.
   * @param excluyendoInsumoId Insumo que se está editando: sus propios códigos no son un choque consigo mismo. Se omite en el alta.
   * @returns Solo los pares tomados, con el insumo que los tiene. Vacío si no hay ninguno.
   */
  findConflictosDeCodigoAlternativo(
    pares: ReadonlyArray<{ codigo: string; fabricante: string | null }>,
    excluyendoInsumoId?: string,
  ): Promise<ConflictoCodigoAlternativo[]>;

  /**
   * Retorna los insumos vigentes del tenant (`deletedAt: null`) con sus
   * códigos alternativos y su compatibilidad, ordenados por código. INCLUYE
   * los deshabilitados (`activo: false`): son los que el administrador
   * necesita ver para volver a habilitarlos.
   *
   * `esRepuesto` filtra por la marca de la FAMILIA del insumo (WU-1,
   * `FamiliaInsumoEntity.esRepuesto`), NO por un campo propio del insumo —
   * `Insumo` no tiene esa columna. `false` trae los consumibles, `true` los
   * repuestos de equipo. `undefined` (el parámetro se omite) NO filtra: trae
   * TODOS. Ese default es a propósito y está documentado en
   * `ListarInsumosUseCase` — no es "devuelve todo por descuido".
   *
   * **Este método tiene DOS comportamientos, a propósito, y `soloVinculables`
   * es el que elige entre ellos (WU-3, sdd/repuestos-vinculo-componente):**
   *
   * - `soloVinculables` AUSENTE (el comportamiento de siempre): mira el
   *   catálogo COMPLETO, habilitados y deshabilitados por igual. Es lo que el
   *   ABM (`InsumosListView`/`RepuestosListView`) necesita para que el
   *   administrador pueda encontrar y reactivar algo deshabilitado — filtrar
   *   acá rompería esa pantalla.
   * - `soloVinculables: true`: trae SOLO los insumos que
   *   `AgregarComponenteUseCase` aceptaría vincular a un componente —
   *   `activo: true` Y `familia.activo: true`, las DOS condiciones que ese
   *   use case exige por separado (`InsumoRepuestoInexistenteError` y
   *   `FamiliaInsumoDeshabilitadaError`). Es lo que necesita un selector que
   *   OFRECE algo para elegir: mostrar una opción que el backend va a
   *   rechazar es peor que no mostrarla, porque el rechazo llega recién al
   *   guardar, por algo que la pantalla ya tenía en la mano.
   *
   * @param esRepuesto Filtro por familia; ausente trae repuestos y consumibles por igual.
   * @param soloVinculables `true` restringe a los insumos vinculables (habilitados, de familia habilitada); ausente no aplica ese filtro.
   */
  findAllActive(esRepuesto?: boolean, soloVinculables?: boolean): Promise<InsumoEntity[]>;

  /**
   * Los insumos vigentes compatibles con un modelo de equipo, ordenados por
   * código. Es la consulta que responde "¿qué insumo le va a este modelo?".
   * Excluye la baja lógica; INCLUYE los deshabilitados, con el mismo criterio
   * que `findAllActive`.
   *
   * @param modeloEquipoId Id del modelo de equipo por el que se filtra.
   * @returns Los insumos compatibles, cada uno con el agregado completo. Vacío si no hay ninguno.
   */
  findAllByModeloEquipo(modeloEquipoId: string): Promise<InsumoEntity[]>;

  /**
   * Resuelve, en UNA consulta, la familia de cada insumo pedido —
   * `insumoId → { codigo, nombre, activo, deletedAt }` de la familia a la que
   * pertenece. Es la lectura que necesita el DETALLE de un equipo para
   * mostrar el nombre/estado de un componente vinculado a un repuesto SIN
   * consultar MASTER (sdd/repuestos-autoridad-catalogo, ADR-2/ADR-3): el
   * catálogo del tenant es la autoridad del camino vinculado.
   *
   * Va en una sola consulta y no en una por insumo porque el detalle trae
   * TODOS los componentes de un equipo (activos y dados de baja) y una
   * resolución por componente sería N+1.
   *
   * @param insumoIds Ids de insumo a resolver.
   * @returns Mapa `insumoId → FamiliaDeInsumo`. Lista vacía ⇒ mapa vacío, sin
   *   ir a la base. Un id inexistente simplemente no aparece en el mapa: la
   *   ausencia no es un error.
   */
  findFamiliasDeInsumos(insumoIds: readonly string[]): Promise<Map<string, FamiliaDeInsumo>>;

  /**
   * Upsert del agregado COMPLETO por id: el insumo, su lista de códigos
   * alternativos y su compatibilidad, que REEMPLAZAN a las guardadas. Va junto
   * y no en tres llamadas porque una lista a medio escribir dejaría el
   * catálogo con códigos que ya no pertenecen a nadie y con compatibilidades
   * que el usuario ya había sacado.
   *
   * Las dos listas son reemplazo, no fusión: lo que no viene en el agregado se
   * borra de la base. Por eso el insumo que se guarda tiene que venir de una
   * lectura de este mismo puerto —que las trae completas— o de una
   * construcción que las resuelva enteras.
   */
  save(insumo: InsumoEntity): Promise<void>;

  /**
   * Lee el `seguimiento` del insumo con `FOR SHARE` (L1 de ADR-12,
   * sdd/repuestos-numero-de-serie). Lo toma todo caso de uso de stock o de
   * unidades ANTES de decidir la rama: mientras la transacción viva, nadie
   * puede cambiar el seguimiento (el cambio pide `FOR NO KEY UPDATE`, que
   * choca con este lock).
   *
   * Exige transacción activa y lanza si no la hay.
   *
   * @param id Id del insumo.
   * @returns El seguimiento, o `null` si el insumo no existe.
   * @throws Error si no hay una transacción activa del tenant.
   */
  leerSeguimientoParaMovimiento(id: string): Promise<SeguimientoInsumo | null>;

  /**
   * Toma la fila del insumo con `FOR NO KEY UPDATE` (L1 de ADR-12) para
   * cambiarle el seguimiento, y devuelve `seguimiento` y `unidadMedidaId`
   * leídos bajo el lock. Espera a las entradas y salidas en vuelo (que tienen
   * L1 `FOR SHARE`) sin tener todavía L2, y por eso no hay ciclo.
   *
   * Exige transacción activa y lanza si no la hay.
   *
   * @param id Id del insumo.
   * @returns Los dos campos, o `null` si el insumo no existe.
   * @throws Error si no hay una transacción activa del tenant.
   */
  bloquearParaCambioDeSeguimiento(
    id: string,
  ): Promise<{ seguimiento: SeguimientoInsumo; unidadMedidaId: string } | null>;

  /**
   * ÚNICO escritor de `insumos.seguimiento` (W3): `save()` no lo escribe en el
   * UPDATE, para que guardar una entidad leída antes de un cambio no lo pise
   * con el valor viejo. Va después de `bloquearParaCambioDeSeguimiento()`.
   *
   * @param id Id del insumo.
   * @param valor Nuevo seguimiento.
   * @throws Error si el insumo no existe (0 filas afectadas).
   */
  cambiarSeguimiento(id: string, valor: SeguimientoInsumo): Promise<void>;

  /**
   * Cuenta los insumos vigentes con seguimiento `SERIE` que usan la unidad de
   * medida. Lo usa `EditarUnidadMedida` para decidir si `entera` se puede
   * desmarcar; va DESPUÉS de tomar la fila de la unidad (L0 de ADR-12) y no
   * toma ningún lock propio.
   *
   * @param unidadMedidaId Id de la unidad de medida.
   * @returns Cantidad de insumos `SERIE` no eliminados que la usan.
   */
  contarSeriePorUnidadMedida(unidadMedidaId: string): Promise<number>;

  /**
   * Retorna la última secuencia de la SERIE `prefijo` (`INS` o `REP`) usada en
   * `codigo` (formato `{PREFIJO}-{SEQ4}`, ej. `INS-0007`). `0` si la serie
   * todavía no tiene ningún código con ese formato en el tenant.
   *
   * Concurrencia (issue #162, mismo patrón que
   * `PrismaTicketRepository.findLastSecuencia`/
   * `PrismaCompraRepository.findLastSecuencia`): ANTES de leer, adquiere un
   * advisory lock transaccional de Postgres
   * (`pg_advisory_xact_lock(hashtext(...))`) scopeado a la SERIE
   * (`insumo-codigo:INS` / `insumo-codigo:REP`), no al insumo. Un
   * `SELECT ... FOR UPDATE` sobre un `MAX()` agregado no lockea nada, y
   * bloquear la última fila existente no protege el PRIMER código de la
   * serie —no hay fila previa que lockear—. El advisory lock serializa TODA
   * la sección crítica (lectura de secuencia + INSERT del insumo) para la
   * misma serie, incluso cuando todavía no existe ningún código con ese
   * prefijo. Se libera solo al cerrar la transacción (commit o rollback).
   *
   * **CRÍTICO — el lock SOLO sirve si esta lectura y el `save()` subsiguiente
   * corren DENTRO de la MISMA transacción** (`ITenantTransactionRunner.run`,
   * como hace `CrearInsumoUseCase` en su rama de autogeneración). Invocado
   * fuera de una transacción explícita, Postgres abre una transacción
   * implícita de una sola sentencia: el lock se adquiere y libera de
   * inmediato, sin efecto de serialización.
   *
   * Solo cuenta un código que matchea EXACTO el formato `{prefijo}-DDDD` (4
   * dígitos): un código escrito a mano con el mismo prefijo pero otra forma
   * —`INS-ABCD`, `INS-12345`— no participa de la serie, para que un código
   * manual no corrompa la detección del "último" vía un orden alfabético que
   * no es numérico.
   *
   * @param prefijo Serie a consultar (`INS` o `REP`).
   * @returns La última secuencia numérica usada en esa serie; `0` si ninguna.
   */
  findLastSecuenciaCodigo(prefijo: PrefijoCodigoInsumo): Promise<number>;

  /**
   * Lista el catálogo para el reporte de stock en UNA consulta, con la familia
   * y la unidad de medida, ordenado por `codigo` ascendente.
   *
   * Excluye los insumos con baja lógica (`deletedAt` no nulo) e INCLUYE los
   * deshabilitados y los de una familia deshabilitada. Los filtros se aplican
   * en la base. Sin lock.
   *
   * @param filtros Familia y/o tipo (consumible o repuesto) a filtrar.
   * @returns Las filas del catálogo, sin saldos.
   */
  listarParaReporteStock(filtros: FiltrosCatalogoStock): Promise<FilaCatalogoStock[]>;
}

/** Token de inyección de dependencias para IInsumoRepository en NestJS. */
export const INSUMO_REPOSITORY = Symbol('INSUMO_REPOSITORY');

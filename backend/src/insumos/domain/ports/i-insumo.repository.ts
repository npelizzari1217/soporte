import { InsumoEntity } from '../entities/insumo.entity';

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
 * IInsumoRepository — puerto de acceso al catálogo de insumos del tenant.
 * `InsumoEntity` es la raíz del agregado: todos estos métodos lo devuelven o
 * lo persisten COMPLETO —con sus códigos alternativos Y con su
 * compatibilidad—, nunca por separado.
 *
 * Que el agregado viaje entero no es prolijidad: una lectura que trajera una
 * de esas listas vacía y un `save()` posterior la persistirían vacía, borrando
 * lo guardado sin un solo error ni log.
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
   * @param esRepuesto Filtro por familia; ausente trae repuestos y consumibles por igual.
   */
  findAllActive(esRepuesto?: boolean): Promise<InsumoEntity[]>;

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
}

/** Token de inyección de dependencias para IInsumoRepository en NestJS. */
export const INSUMO_REPOSITORY = Symbol('INSUMO_REPOSITORY');

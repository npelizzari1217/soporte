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
 * lo persisten CON sus códigos alternativos, nunca por separado.
 */
export interface IInsumoRepository {
  /** Busca un insumo por id, con sus códigos alternativos. Retorna `null` si no existe. */
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
   * códigos alternativos, ordenados por código. INCLUYE los deshabilitados
   * (`activo: false`): son los que el administrador necesita ver para volver a
   * habilitarlos.
   */
  findAllActive(): Promise<InsumoEntity[]>;

  /**
   * Upsert del agregado COMPLETO por id: el insumo y su lista de códigos
   * alternativos, que reemplaza a la guardada. Va junto y no en dos llamadas
   * porque una lista a medio escribir dejaría el catálogo con códigos que ya
   * no pertenecen a nadie.
   */
  save(insumo: InsumoEntity): Promise<void>;
}

/** Token de inyección de dependencias para IInsumoRepository en NestJS. */
export const INSUMO_REPOSITORY = Symbol('INSUMO_REPOSITORY');

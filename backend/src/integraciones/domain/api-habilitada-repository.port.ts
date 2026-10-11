/**
 * Escritura de `clientes.api_habilitada` (master). Es la UNICA via que la escribe: el `save()`
 * general de clientes la omite (JD-5), asi que una entidad leida antes de que ROOT apagara la API
 * no puede volver a prenderla al guardarse.
 */
export interface IApiHabilitadaRepository {
  /** UPDATE dirigido de la columna. Devuelve false si el cliente no existe. */
  fijar(clienteId: string, habilitada: boolean): Promise<boolean>;
}

export const API_HABILITADA_REPOSITORY = Symbol('IApiHabilitadaRepository');

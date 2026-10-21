/** Entrada de `IPermisosPorTipoDeCliente.aplicarPlantilla`. */
export interface AplicarPlantillaPorTipoInput {
  /** Cliente cuya base de tenant recibe las filas. */
  clienteId: string;
  /** Id del usuario en master. */
  usuarioId: string;
  /** Celdas master de la plantilla del rol, como códigos `MODULO:ACCION`. */
  celdas: readonly string[];
  /** `true` reemplaza las filas por tipo del usuario; `false` escribe solo si no tiene ninguna. */
  sobrescribir: boolean;
}

/**
 * IPermisosPorTipoDeCliente — puerto que escribe los permisos por tipo de ticket derivados de la
 * plantilla de un rol en la base del tenant de `clienteId` (odd/tasks/permisos-por-tipo-ticket.md,
 * T4c, D1). Dominio puro: la implementación (`PermisosPorTipoDeClienteAdapter`) resuelve el
 * tenant y bindea su `TenantContext`, así que funciona con o sin un request HTTP en curso.
 */
export interface IPermisosPorTipoDeCliente {
  /**
   * Aplica la plantilla en el tenant del cliente.
   *
   * @param input Cliente, usuario, celdas de la plantilla y si se pisan las filas existentes.
   * @throws Error si el cliente no existe o la base del tenant falla; quien llama decide cómo
   *   informarlo.
   */
  aplicarPlantilla(input: AplicarPlantillaPorTipoInput): Promise<void>;
}

/** Token de inyección de dependencias para IPermisosPorTipoDeCliente en NestJS. */
export const PERMISOS_POR_TIPO_DE_CLIENTE = Symbol('PERMISOS_POR_TIPO_DE_CLIENTE');

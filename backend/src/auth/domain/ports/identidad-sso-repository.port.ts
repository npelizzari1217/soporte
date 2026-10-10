import { ProveedorSso } from '../sso/proveedores-sso';

/**
 * IIdentidadSsoRepository — puerto de los vinculos usuario <-> cuenta de un proveedor SSO
 * (sdd/login-sso, ADR-4). El vinculo se identifica por `subject`, nunca por email.
 */
export type ResultadoVinculo = 'VINCULADO' | 'OTRA_CUENTA';

export interface IIdentidadSsoRepository {
  /** Id del usuario vinculado a ese sujeto del proveedor, o `null` si no hay vinculo. */
  buscarUsuarioPorSujeto(proveedor: ProveedorSso, subject: string): Promise<string | null>;
  /**
   * Gana el primer escritor: `INSERT ... ON CONFLICT DO NOTHING` y relectura de
   * `(usuario_id, proveedor)`. `OTRA_CUENTA` si el usuario ya vinculo otro sujeto del proveedor
   * o si ese sujeto pertenece a otro usuario.
   */
  vincular(usuarioId: string, proveedor: ProveedorSso, subject: string): Promise<ResultadoVinculo>;
  /** Borra los vinculos del usuario y devuelve cuantos eran. */
  eliminarTodasDeUsuario(usuarioId: string): Promise<number>;
}

export const IDENTIDAD_SSO_REPOSITORY = Symbol('IIdentidadSsoRepository');

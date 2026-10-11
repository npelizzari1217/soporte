import { UsuarioEntity } from '../../auth/domain/entities/usuario.entity';
import { MembresiaEntity } from '../../auth/domain/entities/membresia.entity';

/**
 * Altas idempotentes del usuario de integracion y su membresia (JD-7). Dos habilitaciones
 * simultaneas del mismo cliente ven las dos "no existe" y las dos insertan: aca la segunda no
 * falla, no inserta nada, y el caso de uso relee lo que quedo.
 */
export interface IUsuarioIntegracionRepository {
  /** Inserta el usuario salvo que su email ya exista. Nunca falla por el email repetido. */
  crearUsuarioSiNoExiste(usuario: UsuarioEntity): Promise<void>;
  /** Inserta la membresia salvo que ya exista para (usuario, cliente, rol). Idem. */
  crearMembresiaSiNoExiste(membresia: MembresiaEntity): Promise<void>;
}

export const USUARIO_INTEGRACION_REPOSITORY = Symbol('IUsuarioIntegracionRepository');

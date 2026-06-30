import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';

/** DTO de entrada para ListarUsuariosUseCase. */
export interface ListarUsuariosDto {
  /** Resuelto server-side por TenantGuard. NUNCA del body HTTP. */
  clienteId: string;
}

/**
 * ListarUsuariosUseCase — retorna los usuarios del tenant resuelto.
 *
 * Flujo:
 * 1. Delega a IUsuarioRepository.findByClienteId(clienteId).
 *    El repositorio excluye soft-deleted (deleted_at IS NOT NULL).
 *    El repositorio incluye usuarios con activo=FALSE (administrador los ve).
 * 2. Retorna la lista directamente (mapeo a DTO sin password_hash lo hace el controller).
 *
 * Invariante de seguridad:
 * - password_hash NUNCA en la respuesta: el mapeo a DTO de respuesta (sin passwordHash)
 *   ocurre en la capa de presentación (UsuariosController), NO aquí.
 *
 * Spec ref: clientes-tenancy/GET /usuarios
 * Tarea: T3.5
 */
export class ListarUsuariosUseCase {
  constructor(private readonly usuarioRepo: IUsuarioRepository) {}

  async execute(dto: ListarUsuariosDto): Promise<UsuarioEntity[]> {
    return this.usuarioRepo.findByClienteId(dto.clienteId);
  }
}

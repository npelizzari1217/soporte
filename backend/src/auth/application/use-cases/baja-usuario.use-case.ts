import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { UsuarioNoEncontradoError } from '../../domain/errors/auth.errors';

/** DTO de entrada para BajaUsuarioUseCase. */
export interface BajaUsuarioDto {
  usuarioId: string;
}

/**
 * BajaUsuarioUseCase — da de baja lógica a un usuario y revoca todas sus sesiones.
 *
 * Flujo (en la misma operación lógica):
 * 1. Carga usuario por id → 404 si no existe.
 * 2. usuario.suspend(): setea activo=false + deleted_at=now().
 * 3. refreshTokenRepo.revokeAllByUsuarioId: revoca masivamente todos sus tokens.
 * 4. usuarioRepo.save: persiste el usuario modificado.
 *
 * La fila del usuario permanece en DB (soft delete). Las soft refs en DBs tenant
 * (asignado_id, solicitante_id) siguen apuntando a un UUID válido.
 *
 * Nota: no se usa una transacción distribuida (master no tiene transacciones cross-repo
 * en este diseño). Los dos writes son atómicamente independientes; el riesgo de
 * inconsistencia parcial es mínimo y aceptado en este PR (ver PR-06 para wiring final).
 *
 * Tarea: 2.B.8
 */
export class BajaUsuarioUseCase {
  constructor(
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
  ) {}

  async execute(dto: BajaUsuarioDto): Promise<Result<void, DomainError>> {
    // 1. Cargar usuario
    const usuario = await this.usuarioRepo.findById(dto.usuarioId);
    if (!usuario) {
      return Result.fail(new UsuarioNoEncontradoError(dto.usuarioId));
    }

    // 2. Soft delete del usuario (activo=false + deleted_at=now)
    usuario.suspend();

    // 3. Revocar masivamente todos los refresh tokens del usuario
    await this.refreshTokenRepo.revokeAllByUsuarioId(dto.usuarioId);

    // 4. Persistir el usuario modificado
    await this.usuarioRepo.save(usuario);

    return Result.ok(undefined as unknown as void);
  }
}

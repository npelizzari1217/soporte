import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IMasterTransactionRunner } from '../../../shared/domain/ports/i-master-transaction-runner';
import { UsuarioNoEncontradoError, AutoBajaProhibidaError } from '../../domain/errors/auth.errors';

/** DTO de entrada para BajaUsuarioUseCase. */
export interface BajaUsuarioDto {
  usuarioId: string;
  /**
   * ID del usuario que realiza la baja (desde JWT.sub).
   * Requerido para el check de self-baja.
   * Spec ref: T3.6 — AutoBajaProhibidaError si usuarioId === requesterId.
   */
  requesterId: string;
  /**
   * ID del tenant resuelto por TenantGuard (desde JWT.cliente_id o X-Tenant-Id).
   * Requerido para el check de cross-tenant.
   * Spec ref: T3.6 — UsuarioNoEncontradoError si usuario.clienteId !== clienteId.
   */
  clienteId: string;
}

/**
 * BajaUsuarioUseCase — da de baja lógica a un usuario y revoca todas sus sesiones.
 *
 * Flujo (atómico vía MasterTransactionRunner):
 * 0. Self-baja guard: si usuarioId === requesterId → AutoBajaProhibidaError (422).
 * 1. Carga usuario por id → UsuarioNoEncontradoError si no existe.
 * 2. Cross-tenant guard: si usuario.clienteId !== dto.clienteId → UsuarioNoEncontradoError.
 *    (Misma respuesta que "no encontrado" para evitar info leakage sobre otros tenants.)
 * 3. Idempotencia: si ya tiene deleted_at IS NOT NULL → retorna OK sin re-ejecutar.
 * 4. usuario.suspend(): setea activo=false + deleted_at=now().
 * 5. Dentro de una transacción MASTER:
 *    a. usuarioRepo.save: persiste el usuario modificado (activo=false PRIMERO).
 *    b. refreshTokenRepo.revokeAllByUsuarioId: revoca masivamente todos sus tokens.
 *
 * ORDEN DENTRO DE LA TRANSACCIÓN (seguridad ante fallo parcial):
 * - save() va ANTES de revokeAllByUsuarioId(). La transacción garantiza atomicidad:
 *   si revokeAll falla, el save también se revierte → estado consistente.
 *
 * MASTER tables (no tenant): se usa MasterTransactionRunner (no TenantTransactionRunner).
 *
 * Tarea: 2.B.8 + PR-06 W2 (transactional) + T3.6 (cross-tenant, self-baja, idempotencia)
 */
export class BajaUsuarioUseCase {
  constructor(
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly masterTxRunner: IMasterTransactionRunner,
  ) {}

  async execute(dto: BajaUsuarioDto): Promise<Result<void, DomainError>> {
    // 0. Guard: un usuario no puede darse de baja a sí mismo
    if (dto.usuarioId === dto.requesterId) {
      return Result.fail(new AutoBajaProhibidaError());
    }

    // 1. Cargar usuario (fuera de la transacción — solo lectura)
    const usuario = await this.usuarioRepo.findById(dto.usuarioId);
    if (!usuario) {
      return Result.fail(new UsuarioNoEncontradoError(dto.usuarioId));
    }

    // 2. Guard cross-tenant: el usuario objetivo debe pertenecer al tenant del requester.
    //    Responde con UsuarioNoEncontradoError (misma que "no existe") para evitar
    //    información leakage sobre usuarios de otros tenants.
    if (usuario.clienteId !== dto.clienteId) {
      return Result.fail(new UsuarioNoEncontradoError(dto.usuarioId));
    }

    // 3. Idempotencia: si ya fue dado de baja, retorna OK sin re-ejecutar operaciones
    if (usuario.isDeleted()) {
      return Result.ok(undefined as unknown as void);
    }

    // 4. Soft delete del usuario (en memoria — sin escritura aún)
    usuario.suspend();

    // 5. Escrituras atómicas dentro de la transacción MASTER
    await this.masterTxRunner.run(async () => {
      // a. Persistir usuario modificado PRIMERO (activo=false toma efecto en DB)
      await this.usuarioRepo.save(usuario);

      // b. Revocar masivamente todos los refresh tokens del usuario
      await this.refreshTokenRepo.revokeAllByUsuarioId(dto.usuarioId);
    });

    return Result.ok(undefined as unknown as void);
  }
}

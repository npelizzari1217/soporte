import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IMasterTransactionRunner } from '../../../shared/domain/ports/i-master-transaction-runner';
import { UsuarioNoEncontradoError } from '../../domain/errors/auth.errors';

/** DTO de entrada para BajaUsuarioUseCase. */
export interface BajaUsuarioDto {
  usuarioId: string;
}

/**
 * BajaUsuarioUseCase — da de baja lógica a un usuario y revoca todas sus sesiones.
 *
 * Flujo (atómico vía MasterTransactionRunner):
 * 1. Carga usuario por id → 404 si no existe.
 * 2. usuario.suspend(): setea activo=false + deleted_at=now().
 * 3. Dentro de una transacción MASTER:
 *    a. usuarioRepo.save: persiste el usuario modificado (activo=false PRIMERO).
 *    b. refreshTokenRepo.revokeAllByUsuarioId: revoca masivamente todos sus tokens.
 *
 * ORDEN DENTRO DE LA TRANSACCIÓN (seguridad ante fallo parcial):
 * - save() va ANTES de revokeAllByUsuarioId(). La transacción garantiza atomicidad:
 *   si revokeAll falla, el save también se revierte → estado consistente.
 * - Sin transacción, el orden importaría (save primero era la estrategia pre-PR-06);
 *   con transacción, ambas escrituras son atómicas.
 *
 * MASTER tables (no tenant): se usa MasterTransactionRunner (no TenantTransactionRunner).
 * TenantTransactionRunner usa TenantContext (tenant DB), inapropiado para tablas master.
 * MasterTransactionRunner usa MasterContext + PrismaService.getMasterClient().$transaction.
 * Repos MASTER usan MasterContext.getClient() cuando hay transacción activa.
 *
 * La fila del usuario permanece en DB (soft delete). Las soft refs en DBs tenant
 * (asignado_id, solicitante_id) siguen apuntando a un UUID válido.
 *
 * Tarea: 2.B.8 + PR-06 carried-over W2 (transactional)
 */
export class BajaUsuarioUseCase {
  constructor(
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly masterTxRunner: IMasterTransactionRunner,
  ) {}

  async execute(dto: BajaUsuarioDto): Promise<Result<void, DomainError>> {
    // 1. Cargar usuario (fuera de la transacción — solo lectura)
    const usuario = await this.usuarioRepo.findById(dto.usuarioId);
    if (!usuario) {
      return Result.fail(new UsuarioNoEncontradoError(dto.usuarioId));
    }

    // 2. Soft delete del usuario (en memoria — sin escritura aún)
    usuario.suspend();

    // 3. Escrituras atómicas dentro de la transacción MASTER
    await this.masterTxRunner.run(async () => {
      // a. Persistir usuario modificado PRIMERO (activo=false toma efecto en DB)
      await this.usuarioRepo.save(usuario);

      // b. Revocar masivamente todos los refresh tokens del usuario
      await this.refreshTokenRepo.revokeAllByUsuarioId(dto.usuarioId);
    });

    return Result.ok(undefined as unknown as void);
  }
}

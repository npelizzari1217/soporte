import { Result } from '../../../shared/domain/result';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IDispositivoConfiableRepository } from '../../domain/ports/dispositivo-confiable-repository.port';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import {
  MembresiaNoEncontradaError,
  UsuarioNoDisponibleError,
} from '../../domain/errors/auth.errors';

/**
 * Input de `ResetearPasswordUsuarioTenantUseCase`. `clienteId` es OBLIGATORIO
 * y SIEMPRE lo deriva el controller de `actor.cliente_id` (JWT) — es el
 * mecanismo de aislamiento: el reset solo se permite si `usuarioId` tiene una
 * membresía ACTIVA en ESE cliente (molde `EditarUsuarioTenantUseCase`).
 */
export interface ResetearPasswordUsuarioTenantInput {
  clienteId: string;
  usuarioId: string;
  /** Plaintext. No se loguea, no se imprime, no vuelve en la respuesta. */
  password: string;
}

export type ResetearPasswordUsuarioTenantError =
  MembresiaNoEncontradaError | UsuarioNoDisponibleError;

/**
 * ResetearPasswordUsuarioTenantUseCase — establece una contraseña nueva para
 * un usuario del propio tenant, en nombre de un ADMINISTRADOR o ROOT
 * (`PATCH /usuarios/:id/password`, sdd/reset-de-contrasena-por-admin, ADR-2).
 *
 * Compone dos precedentes ya entregados:
 * - De `EditarUsuarioTenantUseCase` (`:52-63`): el scoping por membresía
 *   activa que produce el aislamiento multi-tenant, y el MISMO error tanto si
 *   el usuario no existe como si existe en otro cliente — sin esto, el
 *   endpoint enumeraría usuarios entre inquilinos.
 * - De `CambiarPasswordUseCase` (`:61-84`): las reglas duras del manejo de
 *   credenciales — hashear ÚNICAMENTE vía `usuario.hashPassword()`, `save()`
 *   como punto de no retorno, y revocar sesiones DESPUÉS de persistir sin
 *   propagar un fallo de revocación (ADR-4).
 *
 * Deliberadamente NO toma de `CambiarPasswordUseCase` (ADR-2): no verifica
 * `passwordActual` (el admin no la conoce) ni compara `passwordNueva` contra
 * nada — no hay una "actual" con la que comparar.
 *
 * Guarda de disponibilidad (ADR-5): un usuario global inactivo o soft-deleted
 * se rechaza con `UsuarioNoDisponibleError`, igual que hace `LoginUseCase`
 * (`:111`) antes de verificar la contraseña. Sin esto, el admin comunicaría
 * una contraseña que nunca deja loguearse — el incidente documentado en
 * `scripts/reset-password.ts:6-19`.
 *
 * Flujo — el orden importa:
 * 1. `findActivaByUsuarioYCliente(usuarioId, clienteId)` → null →
 *    `MembresiaNoEncontradaError`.
 * 2. `findById(usuarioId)` → null → el MISMO `MembresiaNoEncontradaError`
 *    (defensa; no debería pasar si hay membresía, y no enumera entre
 *    inquilinos).
 * 3. `!usuario.activo || usuario.isDeleted()` → `UsuarioNoDisponibleError`.
 * 4. `usuario.hashPassword(password, hashProvider)` (`usuario.entity.ts:191`)
 *    — ÚNICA vía. Prohibido invocar `argon2` directo.
 * 5. `dispositivoRepo.revocarTodosDe(usuarioId)` ANTES de guardar (fail-closed,
 *    D5): si lanza, se propaga y `save` nunca corre. No desactiva el 2FA.
 * 6. `usuarioRepo.save(usuario)` — punto de no retorno.
 * 7. `try { revokeAllByUsuarioId(usuarioId) } catch { logger.error(...) }` —
 *    NO propaga el fallo, NUNCA loguea el plaintext.
 */
export class ResetearPasswordUsuarioTenantUseCase {
  constructor(
    private readonly usuarioRepo: Pick<IUsuarioRepository, 'findById' | 'save'>,
    private readonly membresiaRepo: Pick<IMembresiaRepository, 'findActivaByUsuarioYCliente'>,
    private readonly hashProvider: IHashProvider,
    private readonly refreshTokenRepo: Pick<IRefreshTokenRepository, 'revokeAllByUsuarioId'>,
    private readonly dispositivoRepo: Pick<IDispositivoConfiableRepository, 'revocarTodosDe'>,
    private readonly logger: ILogger,
  ) {}

  async execute(
    input: ResetearPasswordUsuarioTenantInput,
  ): Promise<Result<void, ResetearPasswordUsuarioTenantError>> {
    const membresia = await this.membresiaRepo.findActivaByUsuarioYCliente(
      input.usuarioId,
      input.clienteId,
    );
    if (!membresia) {
      return Result.fail(new MembresiaNoEncontradaError());
    }

    const usuario = await this.usuarioRepo.findById(input.usuarioId);
    if (!usuario) {
      return Result.fail(new MembresiaNoEncontradaError());
    }

    if (!usuario.activo || usuario.isDeleted()) {
      return Result.fail(new UsuarioNoDisponibleError());
    }

    await usuario.hashPassword(input.password, this.hashProvider);
    await this.dispositivoRepo.revocarTodosDe(input.usuarioId);
    await this.usuarioRepo.save(usuario);

    try {
      await this.refreshTokenRepo.revokeAllByUsuarioId(input.usuarioId);
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Fallo al revocar sesiones tras reset de contraseña por admin: usuarioId=${input.usuarioId} error=${detalle}`,
      );
    }

    return Result.ok(undefined as unknown as void);
  }
}

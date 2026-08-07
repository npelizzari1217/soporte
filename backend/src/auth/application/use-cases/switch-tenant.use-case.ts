import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { ITokenService, JwtPayload } from '../../domain/ports/i-token.service';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { resolverScope } from './resolver-scope';

/** DTO de entrada para SwitchTenantUseCase. */
export interface SwitchTenantDto {
  /** Payload del JWT actual del usuario autenticado (viene del JwtAuthGuard). */
  actor: JwtPayload;
  /** Cliente al que se quiere saltar. */
  clienteId: string;
}

/** DTO de salida: solo el nuevo access token (R10 — el switch NO rota refresh). */
export interface SwitchTenantResult {
  accessToken: string;
}

/**
 * SwitchTenantUseCase — re-emite el access token scopeado a otro cliente
 * (R10). Único mecanismo de salto de tenant, para TODOS los usuarios
 * (incl. root) — ADR-4: se descarta el header `X-Tenant-Id` de soporte1.
 *
 * Flujo:
 * 1. Delega en `resolverScope` (única fuente de verdad de autz de tenant,
 *    compartida con login/refresh): root → cualquier cliente activo/vivo;
 *    normal → EXIGE membresía activa en `clienteId`; sin ella →
 *    `ClienteNoAutorizado`.
 * 2. Si autorizado, re-carga `membresias[]` completo del actor (mismo shape
 *    que login/refresh — ADR-3, alimenta el switcher del front) y firma un
 *    nuevo access token.
 * 3. Audita el salto vía `ILogger.log` con formato
 *    `SWITCH TENANT | usuario={sub} | from={cliente_id} | to={clienteId} | at={ISO}`
 *    — SOLO en el camino de éxito (un intento rechazado no es un salto real).
 * 4. NO toca `IRefreshTokenRepository` — el refresh token no se rota en el
 *    switch (eso es exclusivo de `RefreshTokenUseCase`, R8).
 */
export class SwitchTenantUseCase {
  constructor(
    private readonly membresiaRepo: IMembresiaRepository,
    private readonly clienteRepo: IClienteRepository,
    private readonly tokenService: ITokenService,
    private readonly logger: ILogger,
  ) {}

  async execute(dto: SwitchTenantDto): Promise<Result<SwitchTenantResult, DomainError>> {
    const scopeResult = await resolverScope(
      { usuarioId: dto.actor.sub, isGlobalAdmin: dto.actor.is_global_admin },
      dto.clienteId,
      this.membresiaRepo,
      this.clienteRepo,
    );

    if (scopeResult.isFail()) {
      return Result.fail(scopeResult.getError());
    }
    const scope = scopeResult.getValue();

    const membresiasActivas = await this.membresiaRepo.findActivasByUsuario(dto.actor.sub);

    const payload: JwtPayload = {
      sub: dto.actor.sub,
      cliente_id: scope.clienteId,
      rol: scope.rol,
      permisos: scope.permisos,
      is_global_admin: dto.actor.is_global_admin,
      cliente_nombre: scope.clienteNombre,
      membresias: membresiasActivas.map((m) => ({
        cliente_id: m.clienteId,
        nombre: m.clienteNombre,
        rol: m.rolCodigo,
      })),
    };
    const accessToken = this.tokenService.signJwt(payload);

    this.logger.log(
      `SWITCH TENANT | usuario=${dto.actor.sub} | from=${dto.actor.cliente_id ?? 'null'} | to=${dto.clienteId} | at=${new Date().toISOString()}`,
    );

    return Result.ok({ accessToken });
  }
}

import * as crypto from 'crypto';
import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { ITokenService, JwtPayload, VERSION_PAYLOAD_JWT } from '../../domain/ports/i-token.service';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { resolverScope } from './resolver-scope';

/** DTO de entrada para SwitchTenantUseCase. */
export interface SwitchTenantDto {
  /** Payload del JWT actual del usuario autenticado (viene del JwtAuthGuard). */
  actor: JwtPayload;
  /** Cliente al que se quiere saltar. */
  clienteId: string;
  /**
   * Refresh token crudo vigente (cookie `rt`, reenviada por el BFF —
   * fix #168). Opcional para no romper compatibilidad durante el rollout:
   * si no viene (front viejo, o usuario todavía sin refresh emitido), el
   * switch sigue emitiendo el access token igual, solo que no puede
   * mantener al día el scope del refresh (mismo comportamiento pre-fix).
   */
  refreshToken?: string;
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
 *    nuevo access token. `nombre`/`apellido` se propagan TAL CUAL del payload
 *    decodificado entrante (`dto.actor`, ya verificado por JwtAuthGuard) —
 *    son identidad global, no cambian al saltar de tenant, y no ameritan una
 *    carga extra a DB. Defensivo: tokens emitidos ANTES de este campo pueden
 *    no traerlo durante la ventana de rollout → default `''` (se repuebla
 *    solo en el próximo login).
 * 3. Audita el salto vía `ILogger.log` con formato
 *    `SWITCH TENANT | usuario={sub} | from={cliente_id} | to={clienteId} | at={ISO}`
 *    — SOLO en el camino de éxito (un intento rechazado no es un salto real).
 * 4. Si `dto.refreshToken` viene presente, actualiza EN EL LUGAR el
 *    `clienteId` del refresh token vigente (fix #168 — reemplaza el punto 4
 *    original, que decía que el switch no tocaba `IRefreshTokenRepository`).
 *    NO es una rotación: `tokenHash`/`expiresAt` no cambian, y la rotación
 *    sigue siendo exclusiva de `RefreshTokenUseCase` (R8) — ese límite no se
 *    mueve. Antes de este fix, el refresh token conservaba el `clienteId`
 *    con el que fue emitido en el LOGIN; como `RefreshTokenUseCase` lee ese
 *    campo como "única fuente de verdad" del scope, a los 15 minutos (TTL
 *    del access token) el usuario perdía el tenant recién elegido.
 *
 *    Elección de diseño: se agregó `RefreshTokenEntity.actualizarClienteId`
 *    (comportamiento de dominio) en vez de un método nuevo en
 *    `IRefreshTokenRepository` — el puerto ya expone `findByHash` + `save`
 *    (upsert), que alcanzan para leer, mutar el scope en la entidad y
 *    persistir sin ampliar el contrato del puerto.
 *
 *    Guardas defensivas ANTES de mutar (ninguna hace fallar el switch: el
 *    access token ya es válido igual, solo se salteca la persistencia del
 *    refresh si algo no cierra):
 *    - Token no encontrado (hash sin match) → no-op.
 *    - `usuarioId` del token no coincide con `dto.actor.sub` → no-op (nunca
 *      se pisa el scope de un refresh ajeno).
 *    - Token ya revocado o expirado → no-op (mutarlo no tendría efecto:
 *      `RefreshTokenUseCase` lo rechaza ANTES de leer `clienteId`).
 *    Ninguna de estas guardas debilita `resolverScope`: el `clienteId` que
 *    se persiste es SIEMPRE `scope.clienteId`, ya validado arriba — nunca el
 *    `dto.clienteId` crudo.
 */
export class SwitchTenantUseCase {
  constructor(
    private readonly membresiaRepo: IMembresiaRepository,
    private readonly clienteRepo: IClienteRepository,
    private readonly tokenService: ITokenService,
    private readonly logger: ILogger,
    private readonly permisosRepo: IMatrizPermisosRepository,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
  ) {}

  async execute(dto: SwitchTenantDto): Promise<Result<SwitchTenantResult, DomainError>> {
    const scopeResult = await resolverScope(
      { usuarioId: dto.actor.sub, isGlobalAdmin: dto.actor.is_global_admin },
      dto.clienteId,
      this.membresiaRepo,
      this.clienteRepo,
      this.permisosRepo,
    );

    if (scopeResult.isFail()) {
      return Result.fail(scopeResult.getError());
    }
    const scope = scopeResult.getValue();

    const membresiasActivas = await this.membresiaRepo.findActivasByUsuario(dto.actor.sub);

    const payload: JwtPayload = {
      v: VERSION_PAYLOAD_JWT,
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
      modulos: scope.modulos,
      // Identidad global: se propaga del payload entrante ya verificado, sin
      // carga extra a DB. Defensivo para tokens pre-rollout que aún no la
      // traen (ver docstring de la clase).
      nombre: dto.actor.nombre ?? '',
      apellido: dto.actor.apellido ?? '',
    };
    const accessToken = this.tokenService.signJwt(payload);

    // Fix #168: mantiene al día el scope del refresh token vigente (ver
    // punto 4 del docstring de la clase).
    //
    // TODO ESTE BLOQUE ES BEST-EFFORT Y NO PUEDE VOLTEAR EL SWITCH. El salto
    // ya está autorizado y el access token ya está firmado: lo que sigue solo
    // evita que el tenant se pierda dentro de 15 minutos.
    //
    // Las guardas lógicas (token ausente, de otro usuario, revocado, vencido)
    // salen por el `if` sin hacer nada. Pero `findByHash` y `save` van a la
    // BASE, y una base que tose LANZA — no devuelve falso. Sin este catch, el
    // arreglo que existe para que no pierdas el inquilino te impediría
    // ELEGIRLO: un hipo en `refresh_tokens` —una tabla que antes de este fix
    // ni participaba del switch— tiraría abajo toda la operación.
    //
    // El peor caso con el catch es exactamente el comportamiento previo al
    // fix: el scope no se actualiza y el tenant se pierde al renovar. Molesto
    // y conocido, no bloqueante.
    if (dto.refreshToken) {
      try {
        const tokenHash = crypto.createHash('sha256').update(dto.refreshToken).digest('hex');
        const refreshTokenEntity = await this.refreshTokenRepo.findByHash(tokenHash);
        if (
          refreshTokenEntity &&
          refreshTokenEntity.usuarioId === dto.actor.sub &&
          !refreshTokenEntity.isRevoked() &&
          !refreshTokenEntity.isExpired()
        ) {
          refreshTokenEntity.actualizarClienteId(scope.clienteId);
          await this.refreshTokenRepo.save(refreshTokenEntity);
        }
      } catch (error) {
        // Se registra y se sigue. Silenciarlo del todo dejaría el bug #168
        // volviendo en sordina, sin nada que lo explique en el log.
        // Mismo criterio que `CambiarPasswordUseCase` con `revokeAllByUsuarioId`
        // (ver JSDoc de `ILogger.error`): degradación silenciosa que sale por
        // stderr, no mezclada con la auditoría normal del salto.
        const detalle = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `SWITCH TENANT | no se pudo persistir el scope del refresh token | usuario=${dto.actor.sub} | to=${dto.clienteId} | el salto continua | causa=${detalle}`,
        );
      }
    }

    this.logger.log(
      `SWITCH TENANT | usuario=${dto.actor.sub} | from=${dto.actor.cliente_id ?? 'null'} | to=${dto.clienteId} | at=${new Date().toISOString()}`,
    );

    return Result.ok({ accessToken });
  }
}

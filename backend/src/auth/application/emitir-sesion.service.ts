import * as crypto from 'crypto';
import { DomainError, Result } from '../../shared/domain/result';
import { IClienteRepository } from '../../clientes/domain/ports/i-cliente.repository';
import { RefreshTokenEntity } from '../domain/entities/refresh-token.entity';
import { UsuarioEntity } from '../domain/entities/usuario.entity';
import { IMatrizPermisosRepository } from '../domain/ports/i-matriz-permisos.repository';
import { IMembresiaRepository, MembresiaResuelta } from '../domain/ports/i-membresia.repository';
import { IRefreshTokenRepository } from '../domain/ports/i-refresh-token.repository';
import { ITokenService, JwtPayload, VERSION_PAYLOAD_JWT } from '../domain/ports/i-token.service';
import { resolverScope } from './use-cases/resolver-scope';

/** Duración del refresh token: 7 días en milisegundos (R7). */
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SesionEmitida {
  accessToken: string;
  refreshToken: string;
}

/**
 * EmitirSesionService — pasos 5-6 del login, extraídos sin cambio de conducta
 * (sdd/verificacion-dos-pasos L1): los comparte el login y la continuación tras el segundo paso.
 *
 * 5. `resolverScope` (única fuente de verdad de autz de tenant) valida el `clienteId` objetivo.
 * 6. Firma el JWT y genera un refresh token aleatorio, persistiendo SOLO su SHA-256 (R7).
 */
export class EmitirSesionService {
  constructor(
    private readonly membresiaRepo: IMembresiaRepository,
    private readonly clienteRepo: IClienteRepository,
    private readonly tokenService: ITokenService,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly permisosRepo: IMatrizPermisosRepository,
  ) {}

  async emitir(
    usuario: UsuarioEntity,
    membresiasActivas: MembresiaResuelta[],
    clienteIdObjetivo: string | null,
  ): Promise<Result<SesionEmitida, DomainError>> {
    const scopeResult = await resolverScope(
      { usuarioId: usuario.id, isGlobalAdmin: usuario.isGlobalAdmin },
      clienteIdObjetivo,
      this.membresiaRepo,
      this.clienteRepo,
      this.permisosRepo,
    );
    if (scopeResult.isFail()) return Result.fail(scopeResult.getError());
    const scope = scopeResult.getValue();

    const payload: JwtPayload = {
      v: VERSION_PAYLOAD_JWT,
      sub: usuario.id,
      cliente_id: scope.clienteId,
      rol: scope.rol,
      permisos: scope.permisos,
      is_global_admin: usuario.isGlobalAdmin,
      cliente_nombre: scope.clienteNombre,
      membresias: membresiasActivas.map((m) => ({
        cliente_id: m.clienteId,
        nombre: m.clienteNombre,
        rol: m.rolCodigo,
      })),
      modulos: scope.modulos,
      // Identidad global del usuario (constante entre tenants): la entidad ya está cargada.
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      cliente_logo_v: scope.clienteLogoVersion,
    };
    const accessToken = this.tokenService.signJwt(payload);

    // Refresh token: random hex + SHA-256 para almacenamiento (R7).
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await this.refreshTokenRepo.save(
      RefreshTokenEntity.create({
        usuarioId: usuario.id,
        tokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        revokedAt: null,
        // Opción B (decisión #2025): el refresh token nace con el cliente_id ya resuelto.
        clienteId: scope.clienteId,
      }),
    );
    return Result.ok({ accessToken, refreshToken: rawToken });
  }
}

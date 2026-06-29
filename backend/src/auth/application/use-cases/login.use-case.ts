import * as crypto from 'crypto';
import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { ITokenService, JwtPayload } from '../../domain/ports/i-token.service';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import { CredencialesInvalidasError, ClienteInactivoError } from '../../domain/errors/auth.errors';

/** Duración del refresh token: 7 días en milisegundos. */
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * DUMMY_HASH — hash argon2id pre-calculado para defensa de timing side-channel.
 *
 * Usado en los paths de error rápidos (usuario no encontrado, inactivo, soft-deleted)
 * para evitar que un atacante infiera si un email existe midiendo el tiempo de respuesta.
 * Con argon2id real (~100ms), la diferencia entre "no encontrado" (sin hash) y "password
 * incorrecto" (con hash) sería detectable vía timing attack.
 *
 * Solución: llamar hashProvider.verify(password, DUMMY_HASH) antes del early return.
 * El resultado se descarta — solo importa consumir el tiempo de cómputo de argon2id.
 *
 * NOTA: regenerar con `argon2.hash('__dummy_soporte__')` si cambian los parámetros.
 * Este valor fue pre-calculado con @node-rs/argon2 v2 defaults (m=19456, t=2, p=1).
 * Exportado para que los tests puedan verificar que es el valor exacto usado.
 */
export const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$WVRkm58tIpvqVSK9R5bK1A$rjXmVHNzlxSXRGSZFgXe4KPBQ1WvC6HNIuXBxZUmrAg';

/** DTO de entrada para el LoginUseCase. */
export interface LoginDto {
  email: string;
  password: string;
}

/** DTO de salida cuando el login es exitoso. */
export interface LoginResult {
  /** JWT de acceso firmado (short-lived). */
  accessToken: string;
  /**
   * Refresh token en crudo (random hex).
   * La capa de presentación debe enviarlo como httpOnly cookie.
   * En DB solo se persiste su SHA-256 hash.
   */
  refreshToken: string;
}

/**
 * LoginUseCase — autentica un usuario y emite JWT + refresh token.
 *
 * Flujo:
 * 1. Busca usuario por email → 401 si no existe o está inactivo/soft-deleted.
 * 2. Verifica password via IHashProvider → 401 si incorrecto.
 * 3. Verifica que el cliente esté activo → 403 si no.
 * 4. Calcula permisos efectivos (unión de los permisos de todos los roles, deduplicados).
 * 5. Firma JWT con payload { sub, cliente_id, email, roles, permisos, cliente_nombre }.
 * 6. Genera refresh token aleatorio, almacena su SHA-256 en refresh_tokens.
 * 7. Retorna { accessToken, refreshToken: rawToken }.
 *
 * Decisión de diseño:
 * - El check de cliente activo usa IClienteRepository (cross-feature, mismo dominio).
 * - SHA-256 del refresh token se computa con Node crypto (stdlib, sin framework).
 * - Los permisos viajan en el JWT para que los guards no consulten DB por request.
 *
 * Tarea: 2.B.2
 */
export class LoginUseCase {
  constructor(
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly clienteRepo: IClienteRepository,
    private readonly hashProvider: IHashProvider,
    private readonly tokenService: ITokenService,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
  ) {}

  async execute(dto: LoginDto): Promise<Result<LoginResult, DomainError>> {
    // 1. Buscar usuario por email
    const usuario = await this.usuarioRepo.findByEmail(dto.email);

    // Defensa de timing side-channel (W1):
    // Siempre llamamos hashProvider.verify() para normalizar el tiempo de respuesta
    // independientemente de si el usuario existe, está activo o fue soft-deleted.
    // Con argon2id real (~100ms), la omisión crearía un canal de timing que permite
    // inferir si un email está registrado. El resultado de verify() se descarta.
    if (!usuario || !usuario.activo || usuario.isDeleted()) {
      await this.hashProvider.verify(dto.password, DUMMY_HASH);
      return Result.fail(new CredencialesInvalidasError());
    }

    // 2. Verificar password vía IHashProvider (argon2id en producción)
    const passwordOk = await usuario.verifyPassword(dto.password, this.hashProvider);
    if (!passwordOk) {
      return Result.fail(new CredencialesInvalidasError());
    }

    // 3. Verificar que el cliente (tenant) esté activo
    const cliente = await this.clienteRepo.findById(usuario.clienteId);
    if (!cliente || !cliente.activo) {
      return Result.fail(new ClienteInactivoError());
    }

    // 4. Calcular permisos efectivos: unión de permisos de todos los roles, deduplicados
    const allPermisos = usuario.roles.flatMap((r) => r.permisos.map((p) => p.codigo));
    const permisos = [...new Set(allPermisos)];
    const roles = usuario.roles.map((r) => r.codigo);

    // 5. Firmar JWT con payload completo
    const payload: JwtPayload = {
      sub: usuario.id,
      cliente_id: usuario.clienteId,
      email: usuario.email,
      roles,
      permisos,
      cliente_nombre: cliente.nombre,
      is_global_admin: usuario.isGlobalAdmin,
    };
    const accessToken = this.tokenService.signJwt(payload);

    // 6. Generar refresh token: random hex + SHA-256 para almacenamiento
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const refreshTokenEntity = RefreshTokenEntity.create({
      usuarioId: usuario.id,
      tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revokedAt: null,
    });

    await this.refreshTokenRepo.save(refreshTokenEntity);

    return Result.ok({ accessToken, refreshToken: rawToken });
  }
}

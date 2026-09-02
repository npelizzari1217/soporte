import * as crypto from 'crypto';
import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { ITokenService, JwtPayload, VERSION_PAYLOAD_JWT } from '../../domain/ports/i-token.service';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import {
  CredencialesInvalidasError,
  SinMembresiaActivaError,
} from '../../domain/errors/auth.errors';
import { resolverScope } from './resolver-scope';

/** Duración del refresh token: 7 días en milisegundos (R7). */
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * DUMMY_HASH — hash argon2id pre-calculado para defensa de timing side-channel.
 *
 * Usado en los paths de error rápidos (usuario no encontrado, inactivo,
 * soft-deleted) para evitar que un atacante infiera si un email existe
 * midiendo el tiempo de respuesta. Con argon2id real (~100ms), la diferencia
 * entre "no encontrado" (sin hash) y "password incorrecto" (con hash) sería
 * detectable vía timing attack.
 *
 * Solución: llamar hashProvider.verify(password, DUMMY_HASH) antes del early
 * return. El resultado se descarta — solo importa consumir el tiempo de
 * cómputo de argon2id.
 *
 * Regenerado para este proyecto con `@node-rs/argon2` (m=19456, t=2, p=1),
 * mismos parámetros que Argon2HashProvider — ver R2/R7. Exportado para que
 * los tests puedan verificar que es el valor exacto usado.
 */
export const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$gumKwzTcG/om3XTQQ+RICg$lMgxUKwTtdos4G45L1thwc+YadQPbPVPeJRKNFITRJk';

/** DTO de entrada para el LoginUseCase. */
export interface LoginDto {
  email: string;
  password: string;
  /** Cliente elegido explícitamente (R5). Ausente = auto-resolución (R4). */
  clienteId?: string;
}

/** Vista de una membresía para el selector de cliente del front (R4, R27). */
export interface MembresiaView {
  cliente_id: string;
  nombre: string;
  rol: string;
}

/**
 * LoginResult — resultado del login.
 * - `tokens`: credenciales válidas y scope resuelto → JWT + refresh emitidos.
 * - `selection`: usuario normal con >1 membresías activas y sin `clienteId`
 *   explícito → el front debe mostrar el selector y re-postear con el
 *   `clienteId` elegido (R4, R27). NO se emiten tokens en este caso.
 */
export type LoginResult =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'selection'; membresias: MembresiaView[] };

/**
 * LoginUseCase — autentica un usuario global y resuelve el scope de tenant.
 *
 * Flujo (R3, R4, R5, R6, R7):
 * 1. Busca el usuario por email (identidad global, sin cliente_id) → 401 si
 *    no existe / inactivo / soft-deleted, SIEMPRE ejecutando
 *    `hashProvider.verify(password, DUMMY_HASH)` antes del early-return
 *    (defensa timing side-channel, R3).
 * 2. Verifica el password vía `IHashProvider` → 401 si incorrecto.
 * 3. Resuelve las membresías ACTIVAS del usuario (siempre — alimentan
 *    `membresias[]` del JWT y el selector cuando aplica).
 * 4. Determina el `clienteId` objetivo:
 *    - `dto.clienteId` explícito → se usa tal cual (R5, valida vía
 *      `resolverScope`).
 *    - Root sin `clienteId` → token MASTER (`clienteId = null`).
 *    - Normal sin `clienteId`, 0 membresías → 403 `SinMembresiaActiva`.
 *    - Normal sin `clienteId`, 1 membresía → auto-selecciona esa membresía.
 *    - Normal sin `clienteId`, >1 membresías → responde `{kind:'selection'}`
 *      SIN emitir tokens (el front re-postea con el `clienteId` elegido).
 * 5. Delega en `resolverScope` (única fuente de verdad de autz de tenant,
 *    compartida con switch/refresh — PR4) para validar el `clienteId`
 *    objetivo y resolver rol/permisos/nombre del cliente.
 * 6. Firma el JWT con el payload nuevo (`rol` singular, `membresias[]`
 *    completo — R6, `nombre`/`apellido` de la UsuarioEntity ya cargada) y
 *    genera un refresh token aleatorio, persistiendo SOLO su SHA-256 (R7).
 */
export class LoginUseCase {
  constructor(
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly membresiaRepo: IMembresiaRepository,
    private readonly clienteRepo: IClienteRepository,
    private readonly hashProvider: IHashProvider,
    private readonly tokenService: ITokenService,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly permisosRepo: IMatrizPermisosRepository,
  ) {}

  async execute(dto: LoginDto): Promise<Result<LoginResult, DomainError>> {
    // 1. Buscar usuario por email (identidad global)
    const usuario = await this.usuarioRepo.findByEmail(dto.email);

    // Defensa de timing side-channel (R3): siempre llamamos hashProvider.verify()
    // para normalizar el tiempo de respuesta independientemente de si el
    // usuario existe, está activo o fue soft-deleted. El resultado se descarta.
    if (!usuario || !usuario.activo || usuario.isDeleted()) {
      await this.hashProvider.verify(dto.password, DUMMY_HASH);
      return Result.fail(new CredencialesInvalidasError());
    }

    // 2. Verificar password vía IHashProvider (argon2id en producción)
    const passwordOk = await usuario.verifyPassword(dto.password, this.hashProvider);
    if (!passwordOk) {
      return Result.fail(new CredencialesInvalidasError());
    }

    // 3. Resolver membresías activas — siempre, alimentan membresias[] del JWT
    // y el selector del front (R4, R6).
    const membresiasActivas = await this.membresiaRepo.findActivasByUsuario(usuario.id);

    // 4. Determinar el clienteId objetivo
    let clienteIdObjetivo: string | null;

    if (dto.clienteId !== undefined) {
      // R5: selección explícita — resolverScope valida autorización.
      clienteIdObjetivo = dto.clienteId;
    } else if (usuario.isGlobalAdmin) {
      // R4: root sin clienteId → token MASTER.
      clienteIdObjetivo = null;
    } else if (membresiasActivas.length === 0) {
      // R4: normal sin ninguna membresía activa.
      return Result.fail(new SinMembresiaActivaError());
    } else if (membresiasActivas.length === 1) {
      // R4: normal con exactamente 1 membresía → auto-selección.
      clienteIdObjetivo = membresiasActivas[0].clienteId;
    } else {
      // R4: normal con >1 membresías → el front debe mostrar el selector.
      return Result.ok({
        kind: 'selection',
        membresias: membresiasActivas.map((m) => ({
          cliente_id: m.clienteId,
          nombre: m.clienteNombre,
          rol: m.rolCodigo,
        })),
      });
    }

    // 5. resolverScope: única fuente de verdad de autz de tenant
    const scopeResult = await resolverScope(
      { usuarioId: usuario.id, isGlobalAdmin: usuario.isGlobalAdmin },
      clienteIdObjetivo,
      this.membresiaRepo,
      this.clienteRepo,
      this.permisosRepo,
    );

    if (scopeResult.isFail()) {
      return Result.fail(scopeResult.getError());
    }
    const scope = scopeResult.getValue();

    // 6. Firmar JWT con el payload nuevo (ADR-3, `v` — ADR-P7/WU-7.1)
    const payload: JwtPayload = {
      v: VERSION_PAYLOAD_JWT,
      sub: usuario.id,
      cliente_id: scope.clienteId,
      rol: scope.rol,
      permisos: scope.permisos,
      is_global_admin: usuario.isGlobalAdmin,
      cliente_nombre: scope.clienteNombre,
      // Zona operativa del tenant (D3/D11) — sale del MISMO resolverScope
      // que resuelve cliente_nombre, nunca de una consulta propia.
      zona_horaria: scope.zonaHoraria,
      membresias: membresiasActivas.map((m) => ({
        cliente_id: m.clienteId,
        nombre: m.clienteNombre,
        rol: m.rolCodigo,
      })),
      modulos: scope.modulos,
      // Identidad global del usuario (constante entre tenants) — la
      // UsuarioEntity ya está cargada en este flujo, sin query extra.
      nombre: usuario.nombre,
      apellido: usuario.apellido,
    };
    const accessToken = this.tokenService.signJwt(payload);

    // Generar refresh token: random hex + SHA-256 para almacenamiento (R7)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const refreshTokenEntity = RefreshTokenEntity.create({
      usuarioId: usuario.id,
      tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revokedAt: null,
      // Opción B (decisión #2025): el refresh token nace con el cliente_id
      // ya resuelto por resolverScope — PR4 lo reusa tal cual, sin pista.
      clienteId: scope.clienteId,
    });

    await this.refreshTokenRepo.save(refreshTokenEntity);

    return Result.ok({ kind: 'tokens', accessToken, refreshToken: rawToken });
  }
}

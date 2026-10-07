import * as crypto from 'crypto';
import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { ITokenService } from '../../domain/ports/i-token.service';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import {
  CredencialesInvalidasError,
  SinMembresiaActivaError,
} from '../../domain/errors/auth.errors';
import { ILimitadorIntentos } from '../../domain/ports/limitador-intentos.port';
import { normalizarEmail } from '../../domain/tfa/formato-codigo';
import { EmitirSesionService } from '../emitir-sesion.service';
import { ITfaRepository } from '../../domain/ports/tfa-repository.port';
import { IDesafioLoginRepository } from '../../domain/ports/desafio-login-repository.port';
import { esObligado2fa } from '../../domain/tfa/es-obligado-2fa';
import { IDispositivoConfiableRepository } from '../../domain/ports/dispositivo-confiable-repository.port';
import { hashTokenDispositivo } from '../tfa/token-dispositivo';

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
  /** IP del navegador para el limitador (I4). Ausente = `sin-ip`. */
  ip?: string;
  /** Token del dispositivo confiable que el BFF lee de su cookie `td` (D3). */
  dispositivoConfiable?: string;
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
 *   explícito → el front muestra el selector y elige con el `ticket` (o re-postea con el
 *   `clienteId`, R4, R27). NO se emiten tokens en este caso.
 * - `needs2fa` / `needsEnrolamiento2fa`: la contraseña es válida pero falta el segundo paso
 *   (L1, L3, L4, L5). El `desafio` no es un token de sesión.
 */
export type LoginResult =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'selection'; membresias: MembresiaView[]; ticket: string }
  | { kind: 'needs2fa'; desafio: string; recordarDisponible: boolean }
  | { kind: 'needsEnrolamiento2fa'; desafio: string };

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
  private readonly emitirSesion: EmitirSesionService;

  constructor(
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly membresiaRepo: IMembresiaRepository,
    private readonly clienteRepo: IClienteRepository,
    private readonly hashProvider: IHashProvider,
    private readonly tokenService: ITokenService,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly permisosRepo: IMatrizPermisosRepository,
    private readonly limitador: ILimitadorIntentos,
    private readonly tfaRepo: ITfaRepository,
    private readonly desafios: IDesafioLoginRepository,
    private readonly dispositivos: IDispositivoConfiableRepository,
  ) {
    this.emitirSesion = new EmitirSesionService(
      membresiaRepo,
      clienteRepo,
      tokenService,
      refreshTokenRepo,
      permisosRepo,
    );
  }

  async execute(dto: LoginDto): Promise<Result<LoginResult, DomainError>> {
    // 0. Limitador (I1, I5): la reserva es el fallo provisional. Bloqueado devuelve lo mismo
    // que una credencial invalida, con el mismo costo de argon2 (DUMMY_HASH), sin pista.
    const hashEmail = crypto.createHash('sha256').update(normalizarEmail(dto.email)).digest('hex');
    const claveLimite = `pwd:${hashEmail}:${dto.ip ?? 'sin-ip'}`;
    const reserva = await this.limitador.reservar(claveLimite);
    if (reserva === null) {
      await this.hashProvider.verify(dto.password, DUMMY_HASH);
      return Result.fail(new CredencialesInvalidasError());
    }

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
    // Exito de contrasena: el contador vuelve a cero (I2). Solo los fallos cuentan.
    await this.limitador.liberar(claveLimite);

    // 3. Resolver membresías activas — siempre, alimentan membresias[] del JWT
    // y el selector del front (R4, R6).
    const membresiasActivas = await this.membresiaRepo.findActivasByUsuario(usuario.id);

    // 3b. Segundo paso (L1, L3, L4, L5): con la contrasena valida y antes de cualquier sesion.
    // Si lo hay, `clienteId` se ignora: el cliente se elige despues, con el ticket (L7).
    // La politica por cliente ya cuenta aca: `esObligado2fa` recibe `clienteRequiere2fa` de cada
    // membresia activa. Como `requiere_2fa` nace en false, hasta WU-7 (ruta para activarla) solo
    // ROOT obliga en la practica.
    const estadoTfa = await this.tfaRepo.obtener(usuario.id);
    if (estadoTfa?.secretoCifrado != null) {
      // Un dispositivo confiable valido omite el desafio, nunca la contrasena (D3). ROOT no
      // lo tiene aunque lo envie, ni siquiera si lo emitieron antes de que fuera ROOT (D4).
      const omiteDesafio =
        !usuario.isGlobalAdmin &&
        dto.dispositivoConfiable !== undefined &&
        (await this.dispositivos.esValido(
          usuario.id,
          hashTokenDispositivo(dto.dispositivoConfiable),
          new Date(),
        ));
      if (!omiteDesafio) {
        return Result.ok({
          kind: 'needs2fa',
          desafio: await this.desafios.crear(usuario.id, 'VERIFICAR'),
          recordarDisponible: !usuario.isGlobalAdmin,
        });
      }
    } else if (esObligado2fa(usuario.isGlobalAdmin, membresiasActivas)) {
      return Result.ok({
        kind: 'needsEnrolamiento2fa',
        desafio: await this.desafios.crear(usuario.id, 'ENROLAR'),
      });
    }

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
      // R4: normal con >1 membresías → el front debe mostrar el selector (ticket de un solo uso).
      return Result.ok({
        kind: 'selection',
        ticket: await this.desafios.crear(usuario.id, 'SELECCIONAR'),
        membresias: membresiasActivas.map((m) => ({
          cliente_id: m.clienteId,
          nombre: m.clienteNombre,
          rol: m.rolCodigo,
        })),
      });
    }

    // 5-6. Scope, JWT y refresh token: EmitirSesionService (sin cambio de conducta).
    const sesion = await this.emitirSesion.emitir(usuario, membresiasActivas, clienteIdObjetivo);
    if (sesion.isFail()) return Result.fail(sesion.getError());
    const { accessToken, refreshToken } = sesion.getValue();
    return Result.ok({ kind: 'tokens', accessToken, refreshToken });
  }
}

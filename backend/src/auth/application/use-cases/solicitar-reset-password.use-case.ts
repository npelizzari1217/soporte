import * as crypto from 'crypto';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IPasswordResetTokenRepository } from '../../domain/ports/i-password-reset-token.repository';
import { ICorreoDeCliente } from '../../domain/ports/i-correo-de-cliente.port';
import { PasswordResetTokenEntity } from '../../domain/entities/password-reset-token.entity';
import { templateResetPassword } from '../../domain/templates/reset-password-email.template';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';

/** TTL del token de reseteo: 60 minutos (ADR-3 del design). */
const VIGENCIA_TOKEN_MS = 60 * 60 * 1000;
const VIGENCIA_MINUTOS = 60;

/** Resultado interno, solo para el log de auditoría — nunca condiciona la respuesta HTTP. */
type ResultadoSolicitud =
  | 'CUENTA_INEXISTENTE'
  | 'CUENTA_NO_DISPONIBLE'
  | 'MEMBRESIAS_0'
  | 'MEMBRESIAS_N'
  | 'CLIENTE_SIN_CORREO'
  | 'CLIENTE_NO_DISPONIBLE'
  | 'MAIL_DESPACHADO';

/**
 * SolicitarResetPasswordUseCase — solicitud de reseteo por olvido (WU-5).
 * Corre SIEMPRE diferido por `ITareasSegundoPlano` (ADR-2): el controller
 * (WU-7) ya respondió 204 antes de invocar `ejecutar`, así que nada acá
 * puede filtrar información por timing ni bifurcar una respuesta.
 *
 * Flujo: `findByEmail` (sin usuario/inactivo/soft-deleted → fin) →
 * `findActivasByUsuario` (≠1 → fin, misma query que `LoginUseCase`) →
 * `correo.estado(clienteId)` (≠`LISTO` → fin, sin token) → revoca vigentes →
 * `randomBytes(32)` → persiste solo el SHA-256 (TTL 60 min) → envía el mail
 * con el link desde `appBaseUrl` (NUNCA `Host`).
 *
 * Atrapa TODO internamente y nunca lanza (ADR-2, defensa en profundidad
 * sobre el catch genérico de `TareasSegundoPlano`).
 *
 * Ref spec: Requirements 1, 3, 4, 11, 12. Ref design: ADR-2/3/4/7. Tarea: 5.1, 5.2.
 */
export class SolicitarResetPasswordUseCase {
  constructor(
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly membresiaRepo: IMembresiaRepository,
    private readonly tokenRepo: IPasswordResetTokenRepository,
    private readonly correoDeCliente: ICorreoDeCliente,
    private readonly logger: ILogger,
    /** `entorno.APP_BASE_URL` (ADR-7): `application/` no lee `process.env`. */
    private readonly appBaseUrl: string,
  ) {}

  async ejecutar(email: string): Promise<void> {
    try {
      const usuario = await this.usuarioRepo.findByEmail(email);
      if (!usuario) {
        this.log('CUENTA_INEXISTENTE');
        return;
      }
      if (!usuario.activo || usuario.isDeleted()) {
        this.log('CUENTA_NO_DISPONIBLE', usuario.id);
        return;
      }

      const membresias = await this.membresiaRepo.findActivasByUsuario(usuario.id);
      if (membresias.length === 0) {
        this.log('MEMBRESIAS_0', usuario.id);
        return;
      }
      if (membresias.length > 1) {
        this.log('MEMBRESIAS_N', usuario.id);
        return;
      }

      const clienteId = membresias[0].clienteId;
      const estado = await this.correoDeCliente.estado(clienteId);
      if (estado === 'SIN_CORREO') {
        this.log('CLIENTE_SIN_CORREO', usuario.id, clienteId);
        return;
      }
      if (estado === 'CLIENTE_NO_DISPONIBLE') {
        this.log('CLIENTE_NO_DISPONIBLE', usuario.id, clienteId);
        return;
      }

      await this.tokenRepo.revocarVigentesDeUsuario(usuario.id);

      const tokenCrudo = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(tokenCrudo).digest('hex');

      const token = PasswordResetTokenEntity.create({
        usuarioId: usuario.id,
        clienteId,
        tokenHash,
        expiresAt: new Date(Date.now() + VIGENCIA_TOKEN_MS),
        usedAt: null,
        revokedAt: null,
      });
      await this.tokenRepo.save(token);

      const plantilla = templateResetPassword({
        nombre: usuario.nombre,
        token: tokenCrudo,
        appBaseUrl: this.appBaseUrl,
        vigenciaMinutos: VIGENCIA_MINUTOS,
      });
      await this.correoDeCliente.enviar(clienteId, { to: usuario.email, ...plantilla });

      this.log('MAIL_DESPACHADO', usuario.id, clienteId);
    } catch (error) {
      // Nunca propaga (ADR-2). Solo el tipo del error: el `.message` de una
      // excepción de infra o de correo puede traer el email del destinatario.
      const tipo = error instanceof Error ? error.name : typeof error;
      this.logger.error(`RESET_PASSWORD_SOLICITUD_ERROR | error=${tipo}`);
    }
  }

  private log(resultado: ResultadoSolicitud, usuarioId?: string, clienteId?: string): void {
    const partes = [`RESET_PASSWORD_SOLICITUD | resultado=${resultado}`];
    if (usuarioId) {
      partes.push(`usuarioId=${usuarioId}`);
    }
    if (clienteId) {
      partes.push(`clienteId=${clienteId}`);
    }
    this.logger.log(partes.join(' | '));
  }
}

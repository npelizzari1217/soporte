import * as crypto from 'crypto';
import { Result, DomainError } from '../../../shared/domain/result';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IPasswordResetTokenRepository } from '../../domain/ports/i-password-reset-token.repository';
import { IDispositivoConfiableRepository } from '../../domain/ports/dispositivo-confiable-repository.port';
import { ICorreoDeCliente } from '../../domain/ports/i-correo-de-cliente.port';
import { ITareasSegundoPlano } from '../../../shared/domain/ports/i-tareas-segundo-plano.port';
import { templateResetConfirmado } from '../../domain/templates/reset-password-email.template';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { ResetLinkInvalidoError } from '../../domain/errors/recuperacion-password.errors';

/**
 * ConfirmarResetPasswordUseCase — confirmación del reseteo de contraseña por
 * olvido (WU-6). A diferencia de `SolicitarResetPasswordUseCase`, corre
 * síncrono dentro del handler: el token YA es la autorización, así que la
 * única pieza que se difiere con `ITareasSegundoPlano` es el mail de
 * confirmación.
 *
 * Orden estricto (ADR-5): `findByHash` (sin fila/usado/revocado/vencido →
 * `ResetLinkInvalidoError`) → `findById` (inexistente/inactivo/soft-deleted
 * → MISMO error, sin consumir el token) → `usuario.hashPassword()` en
 * memoria (NUNCA `argon2` directo, mismo criterio que `CambiarPasswordUseCase`
 * y lo que el incidente de `scripts/reset-password.ts` hace estructuralmente
 * imposible acá) → `dispositivoRepo.revocarTodosDe` (fail-closed, D5: si lanza, token y hash
 * quedan intactos) → `consumirSiVigente` (CAS; `false` → MISMO error, el hash
 * en memoria se descarta) → `usuarioRepo.save` (punto de no retorno) →
 * `revokeAllByUsuarioId` en `try/catch`, sin propagar → `tareas.lanzar(...)`
 * con el mail de aviso por `token.clienteId`, misma pareja `estado` →
 * `enviar` que la solicitud (ADR-4).
 *
 * Las 5 causas de rechazo (4 del token + cuenta no disponible) devuelven el
 * mismo `ResetLinkInvalidoError`. Ningún log lleva el token crudo, el
 * plaintext ni el `.message` de una excepción (puede traer el email, mismo
 * criterio que WU-5): solo ids y el TIPO del error.
 *
 * Ref spec: Requirements 5, 6, 7, 8, 9, 10. Ref design: ADR-4, ADR-5. Tarea: 6.3.
 */
export class ConfirmarResetPasswordUseCase {
  constructor(
    private readonly tokenRepo: IPasswordResetTokenRepository,
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly hashProvider: IHashProvider,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly dispositivoRepo: Pick<IDispositivoConfiableRepository, 'revocarTodosDe'>,
    private readonly correoDeCliente: ICorreoDeCliente,
    private readonly tareas: ITareasSegundoPlano,
    private readonly logger: ILogger,
  ) {}

  async ejecutar(tokenCrudo: string, passwordNueva: string): Promise<Result<void, DomainError>> {
    const tokenHash = crypto.createHash('sha256').update(tokenCrudo).digest('hex');
    const token = await this.tokenRepo.findByHash(tokenHash);
    if (!token || token.isUsed() || token.isRevoked() || token.isExpired()) {
      return Result.fail(new ResetLinkInvalidoError());
    }

    const usuario = await this.usuarioRepo.findById(token.usuarioId);
    if (!usuario || !usuario.activo || usuario.isDeleted()) {
      // Sin consumir el token: el CAS del paso 4 todavía no corrió.
      return Result.fail(new ResetLinkInvalidoError());
    }

    await usuario.hashPassword(passwordNueva, this.hashProvider);

    // Fail-closed (D5): los dispositivos se revocan ANTES del CAS. Si lanza, el
    // token y el hash quedan intactos y el usuario puede reintentar. El reset
    // por mail NO desactiva el 2FA.
    await this.dispositivoRepo.revocarTodosDe(usuario.id);

    const consumido = await this.tokenRepo.consumirSiVigente(token.id);
    if (!consumido) {
      // El CAS perdió (uso concurrente, o una revocación/vencimiento entre
      // el findByHash y acá). El hash en memoria se descarta: nunca se
      // llama a save().
      return Result.fail(new ResetLinkInvalidoError());
    }

    try {
      await this.usuarioRepo.save(usuario);
    } catch (error) {
      // El CAS ya quemó el token: el usuario tiene que pedir otro link (riesgo
      // aceptado en el diseño). Se deja rastro con ids y el tipo del error, y
      // se propaga.
      const tipo = error instanceof Error ? error.name : typeof error;
      this.logger.error(
        `RESET_PASSWORD_CONFIRMACION_SAVE_ERROR | usuarioId=${usuario.id} | error=${tipo}`,
      );
      throw error;
    }

    try {
      await this.refreshTokenRepo.revokeAllByUsuarioId(usuario.id);
    } catch (error) {
      // Nunca propaga: la contraseña ya cambió con éxito. Solo el TIPO del
      // error — su `.message` puede traer el email del destinatario.
      const tipo = error instanceof Error ? error.name : typeof error;
      this.logger.error(
        `RESET_PASSWORD_CONFIRMACION_REVOKE_ERROR | usuarioId=${usuario.id} | error=${tipo}`,
      );
    }

    this.tareas.lanzar('reset-password.confirmacion', async () => {
      try {
        const estado = await this.correoDeCliente.estado(token.clienteId);
        if (estado === 'LISTO') {
          const plantilla = templateResetConfirmado({ nombre: usuario.nombre });
          await this.correoDeCliente.enviar(token.clienteId, { to: usuario.email, ...plantilla });
        }
      } catch (error) {
        const tipo = error instanceof Error ? error.name : typeof error;
        this.logger.error(
          `RESET_PASSWORD_CONFIRMACION_MAIL_ERROR | usuarioId=${usuario.id} | clienteId=${token.clienteId} | error=${tipo}`,
        );
      }
    });

    return Result.ok(undefined as unknown as void);
  }
}

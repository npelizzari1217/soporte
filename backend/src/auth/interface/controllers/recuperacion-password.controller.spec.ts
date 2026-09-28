/**
 * recuperacion-password.controller.spec.ts — WU-7 (tarea 7.3) + WU-8 (tarea
 * 8.2).
 *
 * Unit test: instancia el controller directamente con `ITareasSegundoPlano`,
 * `SolicitarResetPasswordUseCase` y `ConfirmarResetPasswordUseCase`
 * mockeados (sin bootstrapear NestJS ni pasar por guards/ValidationPipe —
 * eso lo cubre el e2e de este mismo módulo). Cubre la superficie de abuso
 * "La solicitud hace trabajo de la rama antes de responder" (design, tabla
 * "Superficie de abuso"): el handler de `forgotPassword` debe encolar la
 * tarea vía `tareas.lanzar` y NUNCA invocar `ejecutar` de forma síncrona.
 *
 * Ref spec: sdd/auth-reseteo-por-olvido/spec, Requirement "La solicitud no
 * filtra información por tiempo de respuesta", "Confirmar con un token
 * inválido responde igual sin importar la causa". Ref design: ADR-2, ADR-5.
 * Tarea: 7.3, 8.2.
 */
import { BadRequestException } from '@nestjs/common';
import { RecuperacionPasswordController } from './recuperacion-password.controller';
import { ITareasSegundoPlano } from '../../../shared/domain/ports/i-tareas-segundo-plano.port';
import { SolicitarResetPasswordUseCase } from '../../application/use-cases/solicitar-reset-password.use-case';
import { ConfirmarResetPasswordUseCase } from '../../application/use-cases/confirmar-reset-password.use-case';
import { Result } from '../../../shared/domain/result';
import { ResetLinkInvalidoError } from '../../domain/errors/recuperacion-password.errors';

type Ctor = ConstructorParameters<typeof RecuperacionPasswordController>;

describe('RecuperacionPasswordController — POST /auth/forgot-password (7.3)', () => {
  function buildController() {
    const ejecutar = vi.fn().mockResolvedValue(undefined);
    const solicitar = { ejecutar } as unknown as SolicitarResetPasswordUseCase;

    const lanzar = vi.fn();
    const tareas: ITareasSegundoPlano = { lanzar };

    const ejecutarConfirmar = vi.fn().mockResolvedValue(Result.ok(undefined));
    const confirmar = { ejecutar: ejecutarConfirmar } as unknown as ConfirmarResetPasswordUseCase;

    const controller = new RecuperacionPasswordController(
      tareas as unknown as Ctor[0],
      solicitar as unknown as Ctor[1],
      confirmar as unknown as Ctor[2],
    );

    return { controller, lanzar, ejecutar, ejecutarConfirmar };
  }

  it('[abuso: trabajo de rama antes de responder] encola la tarea vía tareas.lanzar y NO invoca ejecutar de forma síncrona', () => {
    const { controller, lanzar, ejecutar } = buildController();

    const resultado = controller.forgotPassword({ email: 'test@example.com' });

    expect(lanzar).toHaveBeenCalledTimes(1);
    expect(lanzar).toHaveBeenCalledWith('reset-password.solicitud', expect.any(Function));
    expect(ejecutar).not.toHaveBeenCalled();
    // 204 vía @HttpCode: el handler no arma cuerpo de respuesta.
    expect(resultado).toBeUndefined();
  });

  it('el callback encolado, al invocarse, llama a ejecutar con el email del DTO', async () => {
    const { controller, lanzar, ejecutar } = buildController();

    controller.forgotPassword({ email: 'otro@example.com' });

    const [etiqueta, tarea] = lanzar.mock.calls[0] as [string, () => Promise<void>];
    expect(etiqueta).toBe('reset-password.solicitud');

    await tarea();

    expect(ejecutar).toHaveBeenCalledTimes(1);
    expect(ejecutar).toHaveBeenCalledWith('otro@example.com');
  });
});

describe('RecuperacionPasswordController — POST /auth/reset-password (8.2)', () => {
  function buildController() {
    const ejecutar = vi.fn().mockResolvedValue(undefined);
    const solicitar = { ejecutar } as unknown as SolicitarResetPasswordUseCase;

    const lanzar = vi.fn();
    const tareas: ITareasSegundoPlano = { lanzar };

    const ejecutarConfirmar = vi.fn();
    const confirmar = { ejecutar: ejecutarConfirmar } as unknown as ConfirmarResetPasswordUseCase;

    const controller = new RecuperacionPasswordController(
      tareas as unknown as Ctor[0],
      solicitar as unknown as Ctor[1],
      confirmar as unknown as Ctor[2],
    );

    return { controller, ejecutarConfirmar };
  }

  it('éxito: llama a ejecutar(token, passwordNueva) y no lanza', async () => {
    const { controller, ejecutarConfirmar } = buildController();
    ejecutarConfirmar.mockResolvedValue(Result.ok(undefined));

    await expect(
      controller.resetPassword({ token: 'token-crudo', passwordNueva: 'ClaveNueva123' }),
    ).resolves.toBeUndefined();

    expect(ejecutarConfirmar).toHaveBeenCalledWith('token-crudo', 'ClaveNueva123');
  });

  it('[abuso: causa del rechazo expuesta] rechazo del use case se traduce a BadRequestException con el mensaje único', async () => {
    const { controller, ejecutarConfirmar } = buildController();
    ejecutarConfirmar.mockResolvedValue(Result.fail(new ResetLinkInvalidoError()));

    await expect(
      controller.resetPassword({ token: 'token-vencido', passwordNueva: 'ClaveNueva123' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.resetPassword({ token: 'token-vencido', passwordNueva: 'ClaveNueva123' }),
    ).rejects.toThrow('El link de reseteo no es válido o ya venció.');
  });
});

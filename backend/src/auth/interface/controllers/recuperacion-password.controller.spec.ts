/**
 * recuperacion-password.controller.spec.ts — WU-7, tarea 7.3.
 *
 * Unit test: instancia el controller directamente con `ITareasSegundoPlano`
 * y `SolicitarResetPasswordUseCase` mockeados (sin bootstrapear NestJS ni
 * pasar por guards/ValidationPipe — eso lo cubre el e2e de este mismo
 * módulo). Cubre la superficie de abuso "La solicitud hace trabajo de la
 * rama antes de responder" (design, tabla "Superficie de abuso"): el
 * handler debe encolar la tarea vía `tareas.lanzar` y NUNCA invocar
 * `ejecutar` de forma síncrona.
 *
 * Ref spec: sdd/auth-reseteo-por-olvido/spec, Requirement "La solicitud no
 * filtra información por tiempo de respuesta". Ref design: ADR-2. Tarea: 7.3.
 */
import { RecuperacionPasswordController } from './recuperacion-password.controller';
import { ITareasSegundoPlano } from '../../../shared/domain/ports/i-tareas-segundo-plano.port';
import { SolicitarResetPasswordUseCase } from '../../application/use-cases/solicitar-reset-password.use-case';

type Ctor = ConstructorParameters<typeof RecuperacionPasswordController>;

describe('RecuperacionPasswordController — POST /auth/forgot-password (7.3)', () => {
  function buildController() {
    const ejecutar = vi.fn().mockResolvedValue(undefined);
    const solicitar = { ejecutar } as unknown as SolicitarResetPasswordUseCase;

    const lanzar = vi.fn();
    const tareas: ITareasSegundoPlano = { lanzar };

    const controller = new RecuperacionPasswordController(
      tareas as unknown as Ctor[0],
      solicitar as unknown as Ctor[1],
    );

    return { controller, lanzar, ejecutar };
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

import { Result } from '../../../shared/domain/result';
import { SegundoPasoRechazadoError, TfaNoDisponibleError } from '../../domain/errors/tfa.errors';
import { IDesafioLoginRepository } from '../../domain/ports/desafio-login-repository.port';
import {
  ConfirmarEnrolamientoLoginUseCase,
  IniciarEnrolamientoLoginUseCase,
  VerificarDesafioUseCase,
} from './desafio-login.use-cases';
import { ConfirmarSecretoTfa, IniciarSecretoTfa } from './tfa-cuenta.use-cases';
import { VerificadorCodigoTfa } from './verificador-codigo-tfa';

const rechazado = () => Result.fail(new SegundoPasoRechazadoError());

describe('use cases de desafio de login', () => {
  const desafios = {
    buscarSinVerificar: vi.fn(),
    verificar: vi.fn(),
  } as unknown as Record<'buscarSinVerificar' | 'verificar', ReturnType<typeof vi.fn>>;
  const verificador = { verificar: vi.fn() };
  const iniciar = { execute: vi.fn() };
  const confirmar = { execute: vi.fn() };
  const repo = desafios as unknown as IDesafioLoginRepository;

  beforeEach(() => {
    vi.resetAllMocks();
    desafios.buscarSinVerificar.mockResolvedValue({ usuarioId: 'u1' });
    desafios.verificar.mockResolvedValue('ticket-1');
  });

  describe('VerificarDesafioUseCase', () => {
    const uc = () =>
      new VerificarDesafioUseCase(repo, verificador as unknown as VerificadorCodigoTfa);

    it('acepta el codigo (TOTP o recuperacion, lo decide el verificador) y devuelve el ticket', async () => {
      verificador.verificar.mockResolvedValue(Result.ok(undefined));
      const r = await uc().execute('d', '123456');
      expect(r.getValue()).toEqual({ usuarioId: 'u1', ticket: 'ticket-1' });
      expect(desafios.buscarSinVerificar).toHaveBeenCalledWith('d', 'VERIFICAR');
      expect(desafios.verificar).toHaveBeenCalledWith('d', 'VERIFICAR', 'u1');
    });

    it('un desafio invalido se valida antes de reservar y no consume cupo', async () => {
      desafios.buscarSinVerificar.mockResolvedValue(null);
      const r = await uc().execute('d', '123456');
      expect(r.getError()).toBeInstanceOf(SegundoPasoRechazadoError);
      expect(verificador.verificar).not.toHaveBeenCalled();
    });

    it('codigo erroneo o bloqueo dan el mismo rechazo y no rotan el desafio', async () => {
      verificador.verificar.mockResolvedValue(rechazado());
      const r = await uc().execute('d', '000000');
      expect(r.getError()).toEqual(new SegundoPasoRechazadoError());
      expect(desafios.verificar).not.toHaveBeenCalled();
    });

    it('si la rotacion pierde la carrera, el mismo rechazo', async () => {
      verificador.verificar.mockResolvedValue(Result.ok(undefined));
      desafios.verificar.mockResolvedValue(null);
      expect((await uc().execute('d', '123456')).getError()).toBeInstanceOf(
        SegundoPasoRechazadoError,
      );
    });
  });

  describe('enrolamiento', () => {
    it('iniciar sirve solo con un ENROLAR sin verificar y delega en el secreto pendiente', async () => {
      const uc = new IniciarEnrolamientoLoginUseCase(repo, iniciar as unknown as IniciarSecretoTfa);
      iniciar.execute.mockResolvedValue(Result.ok({ otpauthUri: 'otpauth://x', claveManual: 'K' }));
      expect((await uc.execute('d')).getValue()).toEqual({
        otpauthUri: 'otpauth://x',
        claveManual: 'K',
      });
      expect(desafios.buscarSinVerificar).toHaveBeenCalledWith('d', 'ENROLAR');
      expect(iniciar.execute).toHaveBeenCalledWith('u1');

      desafios.buscarSinVerificar.mockResolvedValue(null);
      expect((await uc.execute('d')).getError()).toBeInstanceOf(SegundoPasoRechazadoError);
    });

    it('iniciar sin clave maestra propaga el 503', async () => {
      const uc = new IniciarEnrolamientoLoginUseCase(repo, iniciar as unknown as IniciarSecretoTfa);
      iniciar.execute.mockResolvedValue(Result.fail(new TfaNoDisponibleError()));
      expect((await uc.execute('d')).getError()).toBeInstanceOf(TfaNoDisponibleError);
    });

    it('confirmar activa, devuelve los 10 codigos y el ticket', async () => {
      const uc = new ConfirmarEnrolamientoLoginUseCase(
        repo,
        confirmar as unknown as ConfirmarSecretoTfa,
      );
      const codigos = Array.from({ length: 10 }, (_, i) => `C${i}`);
      confirmar.execute.mockResolvedValue(Result.ok({ codigosRecuperacion: codigos }));
      const r = await uc.execute('d', '123456');
      expect(r.getValue()).toEqual({ codigosRecuperacion: codigos, ticket: 'ticket-1' });
      expect(desafios.verificar).toHaveBeenCalledWith('d', 'ENROLAR', 'u1');
    });

    it('un codigo rechazado (o repetido) no rota el desafio', async () => {
      const uc = new ConfirmarEnrolamientoLoginUseCase(
        repo,
        confirmar as unknown as ConfirmarSecretoTfa,
      );
      confirmar.execute.mockResolvedValue(rechazado());
      expect((await uc.execute('d', '123456')).getError()).toBeInstanceOf(
        SegundoPasoRechazadoError,
      );
      expect(desafios.verificar).not.toHaveBeenCalled();
    });

    it('confirmar con un desafio invalido no toca el limitador', async () => {
      const uc = new ConfirmarEnrolamientoLoginUseCase(
        repo,
        confirmar as unknown as ConfirmarSecretoTfa,
      );
      desafios.buscarSinVerificar.mockResolvedValue(null);
      expect((await uc.execute('d', '123456')).isFail()).toBe(true);
      expect(confirmar.execute).not.toHaveBeenCalled();
    });
  });
});

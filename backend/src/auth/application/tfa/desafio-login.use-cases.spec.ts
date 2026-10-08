import { Result } from '../../../shared/domain/result';
import { SegundoPasoRechazadoError, TfaNoDisponibleError } from '../../domain/errors/tfa.errors';
import { unstubbed } from '../../../testing/mocks';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { IDesafioLoginRepository } from '../../domain/ports/desafio-login-repository.port';
import { IDispositivoConfiableRepository } from '../../domain/ports/dispositivo-confiable-repository.port';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { DISPOSITIVO_CONFIABLE_DURACION_MS } from '../../domain/tfa/tfa.constants';
import { hashTokenDispositivo } from './token-dispositivo';
import {
  ConfirmarEnrolamientoLoginUseCase,
  IniciarEnrolamientoLoginUseCase,
  VerificarDesafioUseCase,
} from './desafio-login.use-cases';
import { ConfirmarSecretoTfa, IniciarSecretoTfa } from './tfa-cuenta.use-cases';
import { VerificadorCodigoTfa } from './verificador-codigo-tfa';

const rechazado = () =>
  Result.fail<void, SegundoPasoRechazadoError>(new SegundoPasoRechazadoError());

describe('use cases de desafio de login', () => {
  const desafios = {
    crear: unstubbed('crear'),
    buscarSinVerificar: vi.fn(),
    verificar: vi.fn(),
    buscarTicket: unstubbed('buscarTicket'),
    consumir: unstubbed('consumir'),
  } satisfies IDesafioLoginRepository;
  // Object.create evita construir el verificador real: solo importa `verificar`.
  const verificador: VerificadorCodigoTfa = Object.create(VerificadorCodigoTfa.prototype);
  const verificar = vi.spyOn(verificador, 'verificar');
  const iniciar: IniciarSecretoTfa = Object.create(IniciarSecretoTfa.prototype);
  const iniciarExecute = vi.spyOn(iniciar, 'execute');
  const confirmar: ConfirmarSecretoTfa = Object.create(ConfirmarSecretoTfa.prototype);
  const confirmarExecute = vi.spyOn(confirmar, 'execute');
  const repo: IDesafioLoginRepository = desafios;
  const usuarios = {
    findByEmail: unstubbed('findByEmail'),
    findById: vi.fn(),
    create: unstubbed('create'),
    save: unstubbed('save'),
  } satisfies IUsuarioRepository;
  const dispositivos = {
    crear: vi.fn(),
    esValido: unstubbed('esValido'),
    renovar: unstubbed('renovar'),
    revocarTodosDe: unstubbed('revocarTodosDe'),
  } satisfies IDispositivoConfiableRepository;
  const usuario = (isGlobalAdmin: boolean) =>
    UsuarioEntity.create({
      email: 'a@test.local',
      nombre: 'A',
      apellido: 'B',
      passwordHash: 'x',
      activo: true,
      isGlobalAdmin,
    });

  beforeEach(() => {
    vi.resetAllMocks();
    desafios.buscarSinVerificar.mockResolvedValue({ usuarioId: 'u1' });
    desafios.verificar.mockResolvedValue('ticket-1');
  });

  describe('VerificarDesafioUseCase', () => {
    const uc = () => new VerificarDesafioUseCase(repo, verificador, usuarios, dispositivos);

    it('acepta el codigo (TOTP o recuperacion, lo decide el verificador) y devuelve el ticket', async () => {
      verificar.mockResolvedValue(Result.ok(undefined));
      const r = await uc().execute('d', '123456');
      expect(r.getValue()).toEqual({ usuarioId: 'u1', ticket: 'ticket-1' });
      expect(desafios.buscarSinVerificar).toHaveBeenCalledWith('d', 'VERIFICAR');
      expect(desafios.verificar).toHaveBeenCalledWith('d', 'VERIFICAR', 'u1');
    });

    it('un desafio invalido se valida antes de reservar y no consume cupo', async () => {
      desafios.buscarSinVerificar.mockResolvedValue(null);
      const r = await uc().execute('d', '123456');
      expect(r.getError()).toBeInstanceOf(SegundoPasoRechazadoError);
      expect(verificar).not.toHaveBeenCalled();
    });

    it('codigo erroneo o bloqueo dan el mismo rechazo y no rotan el desafio', async () => {
      verificar.mockResolvedValue(rechazado());
      const r = await uc().execute('d', '000000');
      expect(r.getError()).toEqual(new SegundoPasoRechazadoError());
      expect(desafios.verificar).not.toHaveBeenCalled();
    });

    describe('confianza automatica del dispositivo (D4, decision 2026-10-08)', () => {
      beforeEach(() => {
        verificar.mockResolvedValue(Result.ok(undefined));
        usuarios.findById.mockResolvedValue(usuario(false));
      });

      it('un usuario normal recibe el token crudo, sin pedirlo, y se guarda solo su hash por 30 dias', async () => {
        const antes = Date.now();
        const r = await uc().execute('d', '123456');
        const token = r.getValue().dispositivoConfiable;
        expect(token).toMatch(/^[0-9a-f]{64}$/);
        const [usuarioId, hash, expiraAt] = dispositivos.crear.mock.calls[0];
        expect(usuarioId).toBe('u1');
        expect(hash).toBe(hashTokenDispositivo(token as string));
        expect(hash).not.toBe(token);
        expect(expiraAt.getTime() - antes).toBeGreaterThanOrEqual(
          DISPOSITIVO_CONFIABLE_DURACION_MS,
        );
        expect(expiraAt.getTime() - Date.now()).toBeLessThanOrEqual(
          DISPOSITIVO_CONFIABLE_DURACION_MS,
        );
      });

      it('ROOT nunca recibe dispositivo: el codigo se le pide siempre (D4)', async () => {
        usuarios.findById.mockResolvedValue(usuario(true));
        const r = await uc().execute('d', '123456');
        expect(r.getValue()).toEqual({ usuarioId: 'u1', ticket: 'ticket-1' });
        expect(dispositivos.crear).not.toHaveBeenCalled();
      });

      it('si el codigo falla no se emite dispositivo', async () => {
        verificar.mockResolvedValue(rechazado());
        await uc().execute('d', '000000');
        expect(dispositivos.crear).not.toHaveBeenCalled();
      });
    });

    it('si la rotacion pierde la carrera, el mismo rechazo', async () => {
      verificar.mockResolvedValue(Result.ok(undefined));
      desafios.verificar.mockResolvedValue(null);
      expect((await uc().execute('d', '123456')).getError()).toBeInstanceOf(
        SegundoPasoRechazadoError,
      );
    });
  });

  describe('enrolamiento', () => {
    it('iniciar sirve solo con un ENROLAR sin verificar y delega en el secreto pendiente', async () => {
      const uc = new IniciarEnrolamientoLoginUseCase(repo, iniciar);
      iniciarExecute.mockResolvedValue(Result.ok({ otpauthUri: 'otpauth://x', claveManual: 'K' }));
      expect((await uc.execute('d')).getValue()).toEqual({
        otpauthUri: 'otpauth://x',
        claveManual: 'K',
      });
      expect(desafios.buscarSinVerificar).toHaveBeenCalledWith('d', 'ENROLAR');
      expect(iniciarExecute).toHaveBeenCalledWith('u1');

      desafios.buscarSinVerificar.mockResolvedValue(null);
      expect((await uc.execute('d')).getError()).toBeInstanceOf(SegundoPasoRechazadoError);
    });

    it('iniciar sin clave maestra propaga el 503', async () => {
      const uc = new IniciarEnrolamientoLoginUseCase(repo, iniciar);
      iniciarExecute.mockResolvedValue(Result.fail(new TfaNoDisponibleError()));
      expect((await uc.execute('d')).getError()).toBeInstanceOf(TfaNoDisponibleError);
    });

    it('confirmar activa, devuelve los 10 codigos y el ticket', async () => {
      const uc = new ConfirmarEnrolamientoLoginUseCase(repo, confirmar);
      const codigos = Array.from({ length: 10 }, (_, i) => `C${i}`);
      confirmarExecute.mockResolvedValue(Result.ok({ codigosRecuperacion: codigos }));
      const r = await uc.execute('d', '123456');
      expect(r.getValue()).toEqual({ codigosRecuperacion: codigos, ticket: 'ticket-1' });
      expect(desafios.verificar).toHaveBeenCalledWith('d', 'ENROLAR', 'u1');
    });

    it('un codigo rechazado (o repetido) no rota el desafio', async () => {
      const uc = new ConfirmarEnrolamientoLoginUseCase(repo, confirmar);
      confirmarExecute.mockResolvedValue(Result.fail(new SegundoPasoRechazadoError()));
      expect((await uc.execute('d', '123456')).getError()).toBeInstanceOf(
        SegundoPasoRechazadoError,
      );
      expect(desafios.verificar).not.toHaveBeenCalled();
    });

    it('confirmar con un desafio invalido no toca el limitador', async () => {
      const uc = new ConfirmarEnrolamientoLoginUseCase(repo, confirmar);
      desafios.buscarSinVerificar.mockResolvedValue(null);
      expect((await uc.execute('d', '123456')).isFail()).toBe(true);
      expect(confirmarExecute).not.toHaveBeenCalled();
    });
  });
});

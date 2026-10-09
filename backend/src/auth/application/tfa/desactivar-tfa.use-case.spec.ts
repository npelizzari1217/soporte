import { Result } from '../../../shared/domain/result';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { unstubbed } from '../../../testing/mocks';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { SegundoPasoRechazadoError, Tfa2faObligatorioError } from '../../domain/errors/tfa.errors';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { ITfaRepository } from '../../domain/ports/tfa-repository.port';
import { DesactivarTfaUseCase } from './desactivar-tfa.use-case';
import { VerificadorCodigoTfa } from './verificador-codigo-tfa';

const usuario = (isGlobalAdmin = false) =>
  UsuarioEntity.create({
    email: 'a@test.local',
    nombre: 'A',
    apellido: 'B',
    passwordHash: 'x',
    activo: true,
    isGlobalAdmin,
  });

describe('DesactivarTfaUseCase', () => {
  const tfa = {
    obtener: unstubbed('obtener'),
    guardarPendiente: unstubbed('guardarPendiente'),
    promoverPendiente: unstubbed('promoverPendiente'),
    registrarPaso: unstubbed('registrarPaso'),
    reemplazarCodigos: unstubbed('reemplazarCodigos'),
    obtenerCodigosDisponibles: unstubbed('obtenerCodigosDisponibles'),
    consumirCodigo: unstubbed('consumirCodigo'),
    contarCodigosRestantes: unstubbed('contarCodigosRestantes'),
    eliminarTodo: vi.fn(),
  } satisfies ITfaRepository;
  const usuarios = {
    findByEmail: unstubbed('findByEmail'),
    findManyByEmailInsensitive: unstubbed('findManyByEmailInsensitive'),
    findById: vi.fn(),
    create: unstubbed('create'),
    save: unstubbed('save'),
  } satisfies IUsuarioRepository;
  const membresias = {
    findActivasByUsuario: vi.fn(),
    findActivaByUsuarioYCliente: unstubbed('findActivaByUsuarioYCliente'),
    findActivasByCliente: unstubbed('findActivasByCliente'),
    findClientesDeTodasByUsuario: unstubbed('findClientesDeTodasByUsuario'),
    findByUsuarioYCliente: unstubbed('findByUsuarioYCliente'),
    create: unstubbed('create'),
    save: unstubbed('save'),
  } satisfies IMembresiaRepository;
  const refresh = {
    findByHash: unstubbed('findByHash'),
    revokeAllByUsuarioId: vi.fn(),
    save: unstubbed('save'),
  } satisfies IRefreshTokenRepository;
  const logger = { log: unstubbed('log'), error: vi.fn() } satisfies ILogger;
  // Object.create evita construir el verificador real: solo importa `verificar`.
  const verificador: VerificadorCodigoTfa = Object.create(VerificadorCodigoTfa.prototype);
  const verificar = vi.spyOn(verificador, 'verificar');
  const uc = () =>
    new DesactivarTfaUseCase(tfa, usuarios, membresias, refresh, logger, verificador);

  beforeEach(() => {
    vi.resetAllMocks();
    usuarios.findById.mockResolvedValue(usuario());
    membresias.findActivasByUsuario.mockResolvedValue([{ clienteRequiere2fa: false }]);
    verificar.mockResolvedValue(Result.ok(undefined));
  });

  it('con codigo valido y sin obligacion borra todo con eliminarTodo y despues revoca las sesiones (T8, D6)', async () => {
    const orden: string[] = [];
    tfa.eliminarTodo.mockImplementation(async () => void orden.push('eliminarTodo'));
    refresh.revokeAllByUsuarioId.mockImplementation(async () => void orden.push('refresh'));
    expect((await uc().execute('u1', '123456')).isOk()).toBe(true);
    expect(tfa.eliminarTodo).toHaveBeenCalledWith('u1');
    expect(orden).toEqual(['eliminarTodo', 'refresh']);
  });

  it.each([
    ['ROOT', true, []],
    ['cliente que exige 2FA', false, [{ clienteRequiere2fa: true }]],
  ])(
    'obligado (%s): Tfa2faObligatorioError sin gastar cupo ni borrar nada',
    async (_n, root, ms) => {
      usuarios.findById.mockResolvedValue(usuario(root));
      membresias.findActivasByUsuario.mockResolvedValue(ms);
      const r = await uc().execute('u1', '123456');
      expect(r.getError()).toBeInstanceOf(Tfa2faObligatorioError);
      expect(verificar).not.toHaveBeenCalled();
      expect(tfa.eliminarTodo).not.toHaveBeenCalled();
    },
  );

  it('codigo invalido: rechazo y no borra', async () => {
    verificar.mockResolvedValue(Result.fail(new SegundoPasoRechazadoError()));
    const r = await uc().execute('u1', '000000');
    expect(r.getError()).toBeInstanceOf(SegundoPasoRechazadoError);
    expect(tfa.eliminarTodo).not.toHaveBeenCalled();
    expect(refresh.revokeAllByUsuarioId).not.toHaveBeenCalled();
  });

  it('si eliminarTodo lanza, propaga y no revoca sesiones', async () => {
    tfa.eliminarTodo.mockRejectedValue(new Error('db'));
    await expect(uc().execute('u1', '123456')).rejects.toThrow('db');
    expect(refresh.revokeAllByUsuarioId).not.toHaveBeenCalled();
  });

  it('si revocar sesiones falla, loguea y el resultado sigue siendo exito (log-and-swallow)', async () => {
    refresh.revokeAllByUsuarioId.mockRejectedValue(new Error('boom'));
    expect((await uc().execute('u1', '123456')).isOk()).toBe(true);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('usuarioId=u1'));
  });
});

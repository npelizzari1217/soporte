import { unstubbed } from '../../../testing/mocks';
import { Logger } from '@nestjs/common';
import { ILimitadorIntentos } from '../../domain/ports/limitador-intentos.port';
import { EstadoTfa, ITfaRepository } from '../../domain/ports/tfa-repository.port';
import { ITotpService } from '../../domain/ports/totp-service.port';
import { SecretoTotpIndescifrableError } from '../../domain/errors/tfa.errors';
import { Result } from '../../../shared/domain/result';
import { ConfirmadorSecretoPendiente } from './confirmador-secreto-pendiente';
import { SecretoTotpCifrado } from './secreto-totp-cifrado';

const RESERVA = { clave: 'cod:u1', ventanaInicio: new Date(0) };
const ESTADO: EstadoTfa = {
  secretoCifrado: 'cifrado-activo',
  confirmadoAt: new Date(0),
  ultimoPaso: 999,
  secretoPendienteCifrado: 'cifrado-pendiente',
  pendienteCreadoAt: new Date(0),
};

describe('ConfirmadorSecretoPendiente', () => {
  const repo = {
    obtener: vi.fn(),
    guardarPendiente: unstubbed('guardarPendiente'),
    promoverPendiente: vi.fn(),
    registrarPaso: unstubbed('registrarPaso'),
    reemplazarCodigos: unstubbed('reemplazarCodigos'),
    obtenerCodigosDisponibles: unstubbed('obtenerCodigosDisponibles'),
    consumirCodigo: unstubbed('consumirCodigo'),
    contarCodigosRestantes: unstubbed('contarCodigosRestantes'),
    eliminarTodo: unstubbed('eliminarTodo'),
  } satisfies ITfaRepository;
  const totp = {
    generarSecreto: unstubbed('generarSecreto'),
    uri: unstubbed('uri'),
    verificar: vi.fn(),
  } satisfies ITotpService;
  const limitador = {
    reservar: vi.fn(),
    liberar: vi.fn(),
    devolver: vi.fn(),
  } satisfies ILimitadorIntentos;
  // Object.create evita construir el servicio real (cipher privado): solo importa `descifrar`.
  const secretosSvc: SecretoTotpCifrado = Object.create(SecretoTotpCifrado.prototype);
  const secretos = { descifrar: vi.spyOn(secretosSvc, 'descifrar') };
  let confirmador: ConfirmadorSecretoPendiente;
  let logError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    limitador.reservar.mockResolvedValue(RESERVA);
    repo.obtener.mockResolvedValue(ESTADO);
    repo.promoverPendiente.mockResolvedValue(true);
    secretos.descifrar.mockImplementation((_u: string, payload: string) =>
      Result.ok(payload === 'cifrado-pendiente' ? 'PENDIENTE' : 'ACTIVO'),
    );
    totp.verificar.mockImplementation((secreto: string) => (secreto === 'PENDIENTE' ? 42 : null));
    logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    confirmador = new ConfirmadorSecretoPendiente(repo, totp, limitador, secretosSvc);
  });
  afterEach(() => logError.mockRestore());

  it('acepta un TOTP del pendiente, promueve con el paso confirmado y libera (T4, T2)', async () => {
    const r = await confirmador.confirmar('u1', ' 123456 ');
    expect(r.isOk()).toBe(true);
    expect(limitador.reservar).toHaveBeenCalledWith('cod:u1');
    expect(totp.verificar).toHaveBeenCalledWith('PENDIENTE', '123456', expect.any(Date));
    expect(repo.promoverPendiente).toHaveBeenCalledWith('u1', 'cifrado-pendiente', 42);
    expect(limitador.liberar).toHaveBeenCalledWith('cod:u1');
  });

  it('no hereda el ultimo_paso del secreto anterior: usa solo el paso confirmado', async () => {
    await confirmador.confirmar('u1', '123456');
    expect(repo.promoverPendiente.mock.calls[0][2]).toBe(42);
  });

  it('rechaza un codigo de recuperacion sin tocar el repositorio (T10)', async () => {
    const r = await confirmador.confirmar('u1', 'ABCD-EFGH-JKMN');
    expect(r.isFail()).toBe(true);
    expect(repo.promoverPendiente).not.toHaveBeenCalled();
    expect(limitador.liberar).not.toHaveBeenCalled();
  });

  it('rechaza un codigo valido solo para el secreto activo (T10)', async () => {
    totp.verificar.mockImplementation((secreto: string) => (secreto === 'ACTIVO' ? 7 : null));
    const r = await confirmador.confirmar('u1', '123456');
    expect(r.isFail()).toBe(true);
    expect(repo.promoverPendiente).not.toHaveBeenCalled();
  });

  it('sin pendiente rechaza', async () => {
    repo.obtener.mockResolvedValue({ ...ESTADO, secretoPendienteCifrado: null });
    expect((await confirmador.confirmar('u1', '123456')).isFail()).toBe(true);
  });

  it('un CAS en falso (pendiente reemplazado) rechaza y no libera', async () => {
    repo.promoverPendiente.mockResolvedValue(false);
    expect((await confirmador.confirmar('u1', '123456')).isFail()).toBe(true);
    expect(limitador.liberar).not.toHaveBeenCalled();
  });

  it('bloqueado no verifica nada (I6)', async () => {
    limitador.reservar.mockResolvedValue(null);
    expect((await confirmador.confirmar('u1', '123456')).isFail()).toBe(true);
    expect(repo.obtener).not.toHaveBeenCalled();
  });

  it('pendiente indescifrable rechaza, loguea y devuelve la reserva (T12)', async () => {
    secretos.descifrar.mockReturnValue(Result.fail(new SecretoTotpIndescifrableError()));
    expect((await confirmador.confirmar('u1', '123456')).isFail()).toBe(true);
    expect(logError).toHaveBeenCalledWith('TFA_SECRETO_INDESCIFRABLE | usuarioId=u1');
    expect(limitador.devolver).toHaveBeenCalledWith(RESERVA);
  });
});

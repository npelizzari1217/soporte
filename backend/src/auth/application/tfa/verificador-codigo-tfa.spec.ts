import { Logger } from '@nestjs/common';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { ILimitadorIntentos } from '../../domain/ports/limitador-intentos.port';
import { EstadoTfa, ITfaRepository } from '../../domain/ports/tfa-repository.port';
import { ITotpService } from '../../domain/ports/totp-service.port';
import {
  SegundoPasoRechazadoError,
  SecretoTotpIndescifrableError,
} from '../../domain/errors/tfa.errors';
import { Result } from '../../../shared/domain/result';
import { SecretoTotpCifrado } from './secreto-totp-cifrado';
import { VerificadorCodigoTfa } from './verificador-codigo-tfa';

const RESERVA = { clave: 'cod:u1', ventanaInicio: new Date(0) };
const ACTIVO = 'cifrado-activo';
const RECUPERACION = 'ABCD-EFGH-JKMN';

function estado(secretoCifrado: string | null = ACTIVO): EstadoTfa {
  return {
    secretoCifrado,
    confirmadoAt: new Date(0),
    ultimoPaso: 0,
    secretoPendienteCifrado: null,
    pendienteCreadoAt: null,
  };
}

describe('VerificadorCodigoTfa', () => {
  const repo = {
    obtener: vi.fn(),
    registrarPaso: vi.fn(),
    obtenerCodigosDisponibles: vi.fn(),
    consumirCodigo: vi.fn(),
  };
  const totp = { verificar: vi.fn() };
  const limitador = { reservar: vi.fn(), liberar: vi.fn(), devolver: vi.fn() };
  const hash = { verify: vi.fn() };
  const secretos = { descifrar: vi.fn() };
  let logError: ReturnType<typeof vi.spyOn>;
  let verificador: VerificadorCodigoTfa;

  beforeEach(() => {
    vi.resetAllMocks();
    limitador.reservar.mockResolvedValue(RESERVA);
    repo.obtener.mockResolvedValue(estado());
    repo.registrarPaso.mockResolvedValue(true);
    repo.consumirCodigo.mockResolvedValue(true);
    repo.obtenerCodigosDisponibles.mockResolvedValue([
      { id: 'c1', codigoHash: 'h1' },
      { id: 'c2', codigoHash: 'h2' },
    ]);
    secretos.descifrar.mockReturnValue(Result.ok('SECRETO'));
    totp.verificar.mockReturnValue(100);
    logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    verificador = new VerificadorCodigoTfa(
      repo as unknown as ITfaRepository,
      totp as unknown as ITotpService,
      limitador as unknown as ILimitadorIntentos,
      hash as unknown as IHashProvider,
      secretos as unknown as SecretoTotpCifrado,
    );
  });
  afterEach(() => logError.mockRestore());

  it('acepta el TOTP del secreto activo, registra el paso y libera (T2)', async () => {
    const r = await verificador.verificar('u1', '123456');
    expect(r.isOk()).toBe(true);
    expect(limitador.reservar).toHaveBeenCalledWith('cod:u1');
    expect(repo.registrarPaso).toHaveBeenCalledWith('u1', 100, ACTIVO);
    expect(limitador.liberar).toHaveBeenCalledWith('cod:u1');
  });

  it('recorta el codigo antes de pasarlo al TOTP', async () => {
    const r = await verificador.verificar('u1', ' 123456 ');
    expect(r.isOk()).toBe(true);
    expect(totp.verificar).toHaveBeenCalledWith('SECRETO', '123456', expect.any(Date));
  });

  it('reserva antes de verificar cualquier cosa', async () => {
    await verificador.verificar('u1', '123456');
    expect(limitador.reservar.mock.invocationCallOrder[0]).toBeLessThan(
      repo.obtener.mock.invocationCallOrder[0],
    );
  });

  it('bloqueado no verifica nada ni acepta el codigo correcto (I7)', async () => {
    limitador.reservar.mockResolvedValue(null);
    const r = await verificador.verificar('u1', '123456');
    expect(r.getError()).toBeInstanceOf(SegundoPasoRechazadoError);
    expect(repo.obtener).not.toHaveBeenCalled();
    expect(totp.verificar).not.toHaveBeenCalled();
    expect(hash.verify).not.toHaveBeenCalled();
    expect(limitador.liberar).not.toHaveBeenCalled();
  });

  it('un TOTP erroneo rechaza y no libera ni devuelve', async () => {
    totp.verificar.mockReturnValue(null);
    const r = await verificador.verificar('u1', '123456');
    expect(r.isFail()).toBe(true);
    expect(limitador.liberar).not.toHaveBeenCalled();
    expect(limitador.devolver).not.toHaveBeenCalled();
  });

  it('un replay (CAS en falso) rechaza y no libera (T2)', async () => {
    repo.registrarPaso.mockResolvedValue(false);
    const r = await verificador.verificar('u1', '123456');
    expect(r.isFail()).toBe(true);
    expect(limitador.liberar).not.toHaveBeenCalled();
  });

  it('un formato invalido rechaza sin consultar nada y deja la reserva como fallo', async () => {
    const r = await verificador.verificar('u1', 'hola');
    expect(r.isFail()).toBe(true);
    expect(repo.obtener).not.toHaveBeenCalled();
    expect(limitador.liberar).not.toHaveBeenCalled();
  });

  it('acepta un codigo de recuperacion, lo consume y libera (T5)', async () => {
    hash.verify.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const r = await verificador.verificar('u1', RECUPERACION.toLowerCase());
    expect(r.isOk()).toBe(true);
    expect(hash.verify).toHaveBeenNthCalledWith(2, 'ABCDEFGHJKMN', 'h2');
    expect(repo.consumirCodigo).toHaveBeenCalledWith('c2');
    expect(limitador.liberar).toHaveBeenCalledWith('cod:u1');
  });

  it('un codigo de recuperacion ya consumido por otro (CAS en falso) rechaza', async () => {
    hash.verify.mockResolvedValue(true);
    repo.consumirCodigo.mockResolvedValue(false);
    const r = await verificador.verificar('u1', RECUPERACION);
    expect(r.isFail()).toBe(true);
    expect(limitador.liberar).not.toHaveBeenCalled();
  });

  it('un codigo de recuperacion que no coincide rechaza y no libera', async () => {
    hash.verify.mockResolvedValue(false);
    const r = await verificador.verificar('u1', RECUPERACION);
    expect(r.isFail()).toBe(true);
    expect(repo.consumirCodigo).not.toHaveBeenCalled();
    expect(limitador.liberar).not.toHaveBeenCalled();
  });

  describe('secreto indescifrable (T12, K4)', () => {
    beforeEach(() => {
      secretos.descifrar.mockReturnValue(Result.fail(new SecretoTotpIndescifrableError()));
    });

    it('rechaza, loguea sin codigo ni clave y devuelve la reserva (no la libera)', async () => {
      const r = await verificador.verificar('u1', '123456');
      expect(r.getError()).toBeInstanceOf(SegundoPasoRechazadoError);
      expect(logError).toHaveBeenCalledWith('TFA_SECRETO_INDESCIFRABLE | usuarioId=u1');
      expect(limitador.devolver).toHaveBeenCalledWith(RESERVA);
      expect(limitador.liberar).not.toHaveBeenCalled();
    });

    it('un codigo de recuperacion sigue funcionando', async () => {
      hash.verify.mockResolvedValue(true);
      const r = await verificador.verificar('u1', RECUPERACION);
      expect(r.isOk()).toBe(true);
      expect(secretos.descifrar).not.toHaveBeenCalled();
    });

    it('un devolver que falla se loguea y no se propaga', async () => {
      limitador.devolver.mockRejectedValue(new Error('db caida'));
      const r = await verificador.verificar('u1', '123456');
      expect(r.getError()).toBeInstanceOf(SegundoPasoRechazadoError);
      expect(logError).toHaveBeenCalledTimes(2);
    });
  });
});

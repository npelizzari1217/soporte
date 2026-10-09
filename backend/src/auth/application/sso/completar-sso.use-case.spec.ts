/**
 * CompletarSsoUseCase, los diez pasos de ADR-7 (sdd/login-sso; SL1 a SL7, SL11, SL12, SL13,
 * SV2 a SV4, SV6, SL15, I9, L1, L7). El segundo paso es el `EvaluarSegundoPasoService` real
 * sobre repositorios simulados.
 */
import type { Mocked } from 'vitest';
import { CompletarSsoUseCase } from './completar-sso.use-case';
import { sha256Hex } from './pkce';
import { EvaluarSegundoPasoService } from '../evaluar-segundo-paso.service';
import { hashTokenDispositivo } from '../tfa/token-dispositivo';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { MotivoSsoRechazado, SsoRechazadoError } from '../../domain/errors/sso.errors';
import { IDesafioLoginRepository } from '../../domain/ports/desafio-login-repository.port';
import { IDispositivoConfiableRepository } from '../../domain/ports/dispositivo-confiable-repository.port';
import { IIdentidadSsoRepository } from '../../domain/ports/identidad-sso-repository.port';
import { IMembresiaRepository, MembresiaResuelta } from '../../domain/ports/i-membresia.repository';
import { ILimitadorIntentos } from '../../domain/ports/limitador-intentos.port';
import { IProveedorOidc } from '../../domain/ports/proveedor-oidc.port';
import { ISsoEstadoRepository } from '../../domain/ports/sso-estado-repository.port';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { EstadoTfa, ITfaRepository } from '../../domain/ports/tfa-repository.port';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { unstubbed } from '../../../testing/mocks';

const EMAIL = 'Ana@Empresa.com';
const SUJETO = 'sujeto-crudo-123';
const TOKEN = 'binding-crudo';
const STATE = 'state-crudo';

const IP = '203.0.113.7';
const CLAVE = `sso:GOOGLE:${sha256Hex(SUJETO)}:${IP}`;
const DISPOSITIVO = 'td-crudo';

const input = {
  proveedor: 'GOOGLE' as const,
  code: 'c',
  state: STATE,
  bindingToken: TOKEN,
  ip: IP,
};

const TFA_ACTIVO: EstadoTfa = {
  secretoCifrado: 'cifrado',
  confirmadoAt: new Date(),
  ultimoPaso: 0,
  secretoPendienteCifrado: null,
  pendienteCreadoAt: null,
};

const makeUsuario = (o: { activo?: boolean; root?: boolean; borrado?: boolean } = {}) => {
  const props = {
    email: EMAIL,
    nombre: 'Ana',
    apellido: 'Perez',
    passwordHash: 'h',
    activo: o.activo ?? true,
    isGlobalAdmin: o.root ?? false,
  };
  return o.borrado
    ? UsuarioEntity.reconstitute(props, 'u-1', new Date(), new Date(), new Date())
    : UsuarioEntity.create(props, 'u-1');
};

const membresia: MembresiaResuelta = {
  clienteId: 'c-1',
  clienteNombre: 'Acme',
  rolCodigo: 'AGENTE',
  clienteRequiere2fa: false,
};

describe('CompletarSsoUseCase', () => {
  let estados: Mocked<ISsoEstadoRepository>;
  let oidc: Mocked<IProveedorOidc>;
  let vinculos: Mocked<IIdentidadSsoRepository>;
  let usuarios: Mocked<IUsuarioRepository>;
  let membresias: Mocked<IMembresiaRepository>;
  let logger: Mocked<ILogger>;
  let limitador: Mocked<ILimitadorIntentos>;
  let tfa: Mocked<ITfaRepository>;
  let desafios: Mocked<IDesafioLoginRepository>;
  let dispositivos: Mocked<IDispositivoConfiableRepository>;
  let llamadas: string[];
  let uc: CompletarSsoUseCase;

  beforeEach(() => {
    estados = {
      crear: unstubbed('crear'),
      consumir: vi.fn().mockResolvedValue({ nonce: 'n', codeVerifier: 'v', siguiente: '/x' }),
    };
    oidc = {
      construirUrlAutorizacion: unstubbed('construirUrlAutorizacion'),
      verificarCodigo: vi.fn().mockResolvedValue({ subject: SUJETO, email: EMAIL }),
    };
    vinculos = {
      buscarUsuarioPorSujeto: vi.fn().mockResolvedValue(null),
      vincular: unstubbed('vincular'),
      eliminarTodasDeUsuario: unstubbed('eliminarTodasDeUsuario'),
    };
    usuarios = {
      findByEmail: unstubbed('findByEmail'),
      findManyByEmailInsensitive: vi.fn().mockResolvedValue([makeUsuario()]),
      findById: vi.fn().mockResolvedValue(makeUsuario()),
      create: unstubbed('create'),
      save: unstubbed('save'),
    };
    membresias = {
      findActivasByUsuario: vi.fn().mockResolvedValue([membresia]),
      findActivaByUsuarioYCliente: unstubbed('findActivaByUsuarioYCliente'),
      findActivasByCliente: unstubbed('findActivasByCliente'),
      findClientesDeTodasByUsuario: unstubbed('findClientesDeTodasByUsuario'),
      findByUsuarioYCliente: unstubbed('findByUsuarioYCliente'),
      create: unstubbed('create'),
      save: unstubbed('save'),
    };
    logger = { log: vi.fn(), error: vi.fn() };
    llamadas = [];
    limitador = {
      reservar: vi.fn(() => {
        llamadas.push('reservar');
        return Promise.resolve({ clave: CLAVE, ventanaInicio: new Date() });
      }),
      liberar: vi.fn(() => {
        llamadas.push('liberar');
        return Promise.resolve();
      }),
      devolver: unstubbed('devolver'),
    };
    vinculos.vincular = vi.fn(() => {
      llamadas.push('vincular');
      return Promise.resolve('VINCULADO' as const);
    });
    tfa = {
      obtener: vi.fn().mockResolvedValue(null),
      guardarPendiente: unstubbed('guardarPendiente'),
      promoverPendiente: unstubbed('promoverPendiente'),
      registrarPaso: unstubbed('registrarPaso'),
      reemplazarCodigos: unstubbed('reemplazarCodigos'),
      obtenerCodigosDisponibles: unstubbed('obtenerCodigosDisponibles'),
      consumirCodigo: unstubbed('consumirCodigo'),
      contarCodigosRestantes: unstubbed('contarCodigosRestantes'),
      eliminarTodo: unstubbed('eliminarTodo'),
    };
    desafios = {
      crear: vi.fn((_u: string, proposito: string) => Promise.resolve(`desafio-${proposito}`)),
      buscarSinVerificar: unstubbed('buscarSinVerificar'),
      verificar: unstubbed('verificar'),
      buscarTicket: unstubbed('buscarTicket'),
      consumir: unstubbed('consumir'),
    };
    dispositivos = {
      crear: unstubbed('crear'),
      esValido: unstubbed('esValido'),
      renovar: vi.fn().mockResolvedValue(true),
      revocarTodosDe: unstubbed('revocarTodosDe'),
    };
    uc = new CompletarSsoUseCase(
      estados,
      oidc,
      vinculos,
      usuarios,
      membresias,
      limitador,
      new EvaluarSegundoPasoService(tfa, desafios, dispositivos),
      desafios,
      logger,
    );
  });

  const motivoDe = async (): Promise<MotivoSsoRechazado | null> => {
    try {
      await uc.execute(input);
      return null;
    } catch (e) {
      if (e instanceof SsoRechazadoError) return e.motivo;
      throw e;
    }
  };

  it('consume el estado con los hashes de state y binding y entrega nonce y verifier al IdP', async () => {
    await uc.execute(input);
    expect(estados.consumir).toHaveBeenCalledWith({
      stateHash: sha256Hex(STATE),
      proveedor: 'GOOGLE',
      navegadorHash: sha256Hex(TOKEN),
    });
    expect(oidc.verificarCodigo).toHaveBeenCalledWith('GOOGLE', {
      code: 'c',
      codeVerifier: 'v',
      nonce: 'n',
    });
  });

  it('CAS en cero filas: ESTADO_INVALIDO sin llamar al IdP', async () => {
    estados.consumir.mockResolvedValue(null);
    expect(await motivoDe()).toBe('ESTADO_INVALIDO');
    expect(oidc.verificarCodigo).not.toHaveBeenCalled();
  });

  it.each<MotivoSsoRechazado>(['TOKEN_INVALIDO', 'EMAIL_NO_VERIFICADO'])(
    'propaga el motivo %s del IdP y no resuelve usuario',
    async (motivo) => {
      oidc.verificarCodigo.mockRejectedValue(new SsoRechazadoError(motivo));
      expect(await motivoDe()).toBe(motivo);
      expect(vinculos.buscarUsuarioPorSujeto).not.toHaveBeenCalled();
    },
  );

  it('un error de red del IdP se propaga tal cual, no como rechazo', async () => {
    const red = new Error('ECONNRESET');
    oidc.verificarCodigo.mockRejectedValue(red);
    await expect(uc.execute(input)).rejects.toBe(red);
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('resuelve primero por vinculo: un cambio de email igual entra, sin buscar por email', async () => {
    vinculos.buscarUsuarioPorSujeto.mockResolvedValue('u-1');
    await uc.execute(input);
    expect(vinculos.buscarUsuarioPorSujeto).toHaveBeenCalledWith('GOOGLE', SUJETO);
    expect(usuarios.findById).toHaveBeenCalledWith('u-1');
    expect(usuarios.findManyByEmailInsensitive).not.toHaveBeenCalled();
  });

  it('sin vinculo busca por email sin distinguir mayusculas', async () => {
    await uc.execute(input);
    expect(usuarios.findManyByEmailInsensitive).toHaveBeenCalledWith(EMAIL);
  });

  it('cero filas por email: SIN_USUARIO', async () => {
    usuarios.findManyByEmailInsensitive.mockResolvedValue([]);
    expect(await motivoDe()).toBe('SIN_USUARIO');
  });

  it('dos filas por email: AMBIGUO', async () => {
    usuarios.findManyByEmailInsensitive.mockResolvedValue([makeUsuario(), makeUsuario()]);
    expect(await motivoDe()).toBe('AMBIGUO');
  });

  it.each([
    ['inactivo', makeUsuario({ activo: false })],
    ['borrado', makeUsuario({ borrado: true })],
  ])('usuario %s: INACTIVO y no mira membresias', async (_n, usuario) => {
    usuarios.findManyByEmailInsensitive.mockResolvedValue([usuario]);
    expect(await motivoDe()).toBe('INACTIVO');
    expect(membresias.findActivasByUsuario).not.toHaveBeenCalled();
  });

  it('vinculo que apunta a un usuario inexistente: INACTIVO', async () => {
    vinculos.buscarUsuarioPorSujeto.mockResolvedValue('u-1');
    usuarios.findById.mockResolvedValue(null);
    expect(await motivoDe()).toBe('INACTIVO');
  });

  it('ROOT se rechaza resuelto por email', async () => {
    usuarios.findManyByEmailInsensitive.mockResolvedValue([makeUsuario({ root: true })]);
    expect(await motivoDe()).toBe('ROOT');
  });

  it('ROOT se rechaza tambien si ya estaba vinculado (promovido despues)', async () => {
    vinculos.buscarUsuarioPorSujeto.mockResolvedValue('u-1');
    usuarios.findById.mockResolvedValue(makeUsuario({ root: true }));
    expect(await motivoDe()).toBe('ROOT');
    expect(membresias.findActivasByUsuario).not.toHaveBeenCalled();
  });

  it('sin membresias activas: SIN_MEMBRESIA', async () => {
    membresias.findActivasByUsuario.mockResolvedValue([]);
    expect(await motivoDe()).toBe('SIN_MEMBRESIA');
  });

  it('el log SSO_RECHAZADO lleva proveedor, motivo y usuarioId, nunca email, sujeto ni token', async () => {
    membresias.findActivasByUsuario.mockResolvedValue([]);
    await motivoDe();
    expect(logger.log).toHaveBeenCalledWith(
      'SSO_RECHAZADO | proveedor=GOOGLE | motivo=SIN_MEMBRESIA | usuarioId=u-1',
    );
    const linea = String(logger.log.mock.calls[0][0]).toLowerCase();
    for (const secreto of [EMAIL, SUJETO, TOKEN, STATE]) {
      expect(linea).not.toContain(secreto.toLowerCase());
    }
  });

  it('un rechazo sin usuario resuelto omite usuarioId del log', async () => {
    usuarios.findManyByEmailInsensitive.mockResolvedValue([]);
    await motivoDe();
    expect(logger.log).toHaveBeenCalledWith(
      'SSO_RECHAZADO | proveedor=GOOGLE | motivo=SIN_USUARIO',
    );
  });

  it('ningun camino crea ni guarda usuario, membresia o cliente', async () => {
    await uc.execute(input);
    usuarios.findManyByEmailInsensitive.mockResolvedValue([]);
    await motivoDe();
    expect(usuarios.create).not.toHaveBeenCalled();
    expect(usuarios.save).not.toHaveBeenCalled();
    expect(membresias.create).not.toHaveBeenCalled();
    expect(membresias.save).not.toHaveBeenCalled();
  });

  describe('limitador (I9)', () => {
    it('reserva la clave exacta sso:<PROVEEDOR>:<sha256(subject)>:<ip> con la IP del navegador', async () => {
      await uc.execute(input);
      expect(limitador.reservar).toHaveBeenCalledWith(CLAVE);
      expect(CLAVE).not.toContain(SUJETO);
    });

    it('sin IP usa sin-ip, igual que pwd:', async () => {
      await uc.execute({ ...input, ip: undefined });
      expect(limitador.reservar).toHaveBeenCalledWith(`sso:GOOGLE:${sha256Hex(SUJETO)}:sin-ip`);
    });

    it('reserva entre el canje y la resolucion del usuario, no antes', async () => {
      await uc.execute(input);
      const orden = (f: { mock: { invocationCallOrder: number[] } }) =>
        f.mock.invocationCallOrder[0];
      expect(orden(oidc.verificarCodigo)).toBeLessThan(orden(limitador.reservar));
      expect(orden(limitador.reservar)).toBeLessThan(orden(vinculos.buscarUsuarioPorSujeto));
    });

    it('los pasos 1 y 2 que fallan no reservan', async () => {
      estados.consumir.mockResolvedValue(null);
      await motivoDe();
      estados.consumir.mockResolvedValue({ nonce: 'n', codeVerifier: 'v', siguiente: null });
      oidc.verificarCodigo.mockRejectedValue(new SsoRechazadoError('TOKEN_INVALIDO'));
      await motivoDe();
      expect(limitador.reservar).not.toHaveBeenCalled();
    });

    it('agotado: BLOQUEADO con token valido, sin resolver usuario, desafio ni ticket', async () => {
      limitador.reservar.mockResolvedValue(null);
      expect(await motivoDe()).toBe('BLOQUEADO');
      expect(vinculos.buscarUsuarioPorSujeto).not.toHaveBeenCalled();
      expect(desafios.crear).not.toHaveBeenCalled();
      expect(limitador.liberar).not.toHaveBeenCalled();
    });

    it.each<[string, () => void, string]>([
      [
        'SIN_USUARIO',
        () => usuarios.findManyByEmailInsensitive.mockResolvedValue([]),
        'SIN_USUARIO',
      ],
      [
        'AMBIGUO',
        () => usuarios.findManyByEmailInsensitive.mockResolvedValue([makeUsuario(), makeUsuario()]),
        'AMBIGUO',
      ],
      [
        'INACTIVO',
        () =>
          usuarios.findManyByEmailInsensitive.mockResolvedValue([makeUsuario({ activo: false })]),
        'INACTIVO',
      ],
      [
        'ROOT',
        () => usuarios.findManyByEmailInsensitive.mockResolvedValue([makeUsuario({ root: true })]),
        'ROOT',
      ],
      [
        'SIN_MEMBRESIA',
        () => membresias.findActivasByUsuario.mockResolvedValue([]),
        'SIN_MEMBRESIA',
      ],
      ['OTRA_CUENTA', () => vinculos.vincular.mockResolvedValue('OTRA_CUENTA'), 'OTRA_CUENTA'],
    ])(
      'rechazo %s (pasos 4 a 8): la reserva queda como falla, sin liberar',
      async (_n, preparar, motivo) => {
        preparar();
        expect(await motivoDe()).toBe(motivo);
        expect(limitador.reservar).toHaveBeenCalledTimes(1);
        expect(limitador.liberar).not.toHaveBeenCalled();
        expect(limitador.devolver).not.toHaveBeenCalled();
      },
    );

    it('un error propagado en los pasos 4 a 8 tampoco libera ni devuelve la reserva', async () => {
      membresias.findActivasByUsuario.mockRejectedValue(new Error('db caida'));
      await expect(uc.execute(input)).rejects.toThrow('db caida');
      expect(limitador.liberar).not.toHaveBeenCalled();
      expect(limitador.devolver).not.toHaveBeenCalled();
    });

    it('libera la clave solo despues de vincular (paso 8) y antes del segundo paso', async () => {
      tfa.obtener.mockImplementation(() => {
        llamadas.push('segundo-paso');
        return Promise.resolve(null);
      });
      await uc.execute(input);
      expect(limitador.liberar).toHaveBeenCalledWith(CLAVE);
      expect(llamadas).toEqual(['reservar', 'vincular', 'liberar', 'segundo-paso']);
    });
  });

  describe('vinculo (SV2, SV4, SV6)', () => {
    it('vincula solo cuando se resolvio por email, con el id, el proveedor y el sujeto', async () => {
      await uc.execute(input);
      expect(vinculos.vincular).toHaveBeenCalledWith('u-1', 'GOOGLE', SUJETO);
    });

    it('no vuelve a vincular si ya habia vinculo por sujeto', async () => {
      vinculos.buscarUsuarioPorSujeto.mockResolvedValue('u-1');
      await uc.execute(input);
      expect(vinculos.vincular).not.toHaveBeenCalled();
    });

    it.each([
      [
        'inactivo',
        () =>
          usuarios.findManyByEmailInsensitive.mockResolvedValue([makeUsuario({ activo: false })]),
      ],
      [
        'borrado',
        () =>
          usuarios.findManyByEmailInsensitive.mockResolvedValue([makeUsuario({ borrado: true })]),
      ],
      [
        'ROOT',
        () => usuarios.findManyByEmailInsensitive.mockResolvedValue([makeUsuario({ root: true })]),
      ],
      ['sin membresias', () => membresias.findActivasByUsuario.mockResolvedValue([])],
    ])('usuario %s resuelto por email: vincular no se llama', async (_n, preparar) => {
      preparar();
      expect(await motivoDe()).not.toBeNull();
      expect(vinculos.vincular).not.toHaveBeenCalled();
    });

    it('OTRA_CUENTA: rechazo con el usuarioId en el log y sin desafio ni ticket', async () => {
      vinculos.vincular.mockResolvedValue('OTRA_CUENTA');
      expect(await motivoDe()).toBe('OTRA_CUENTA');
      expect(logger.log).toHaveBeenCalledWith(
        'SSO_RECHAZADO | proveedor=GOOGLE | motivo=OTRA_CUENTA | usuarioId=u-1',
      );
      expect(desafios.crear).not.toHaveBeenCalled();
    });
  });

  describe('segundo paso y ticket (SL11, SL12, L1, L7)', () => {
    it('2FA activo sin dispositivo: needs2fa con el desafio VERIFICAR y el siguiente tal cual', async () => {
      tfa.obtener.mockResolvedValue(TFA_ACTIVO);
      expect(await uc.execute(input)).toEqual({
        kind: 'needs2fa',
        desafio: 'desafio-VERIFICAR',
        siguiente: '/x',
      });
      expect(desafios.crear).not.toHaveBeenCalledWith('u-1', 'SELECCIONAR');
    });

    it('obligado por el cliente sin 2FA: needsEnrolamiento2fa con el desafio ENROLAR', async () => {
      membresias.findActivasByUsuario.mockResolvedValue([
        { ...membresia, clienteRequiere2fa: true },
      ]);
      expect(await uc.execute(input)).toEqual({
        kind: 'needsEnrolamiento2fa',
        desafio: 'desafio-ENROLAR',
        siguiente: '/x',
      });
    });

    it('sin 2FA ni obligacion: ticket SELECCIONAR y ningun token de sesion', async () => {
      const out = await uc.execute(input);
      expect(out).toEqual({ kind: 'ticket', ticket: 'desafio-SELECCIONAR', siguiente: '/x' });
      expect(desafios.crear).toHaveBeenCalledWith('u-1', 'SELECCIONAR');
      expect(out).not.toHaveProperty('accessToken');
    });

    it('con varias membresias el ticket es el mismo: el selector sigue siendo de ContinuarLogin', async () => {
      membresias.findActivasByUsuario.mockResolvedValue([
        membresia,
        { ...membresia, clienteId: 'c-2', clienteNombre: 'Beta' },
      ]);
      expect(await uc.execute(input)).toMatchObject({
        kind: 'ticket',
        ticket: 'desafio-SELECCIONAR',
      });
    });

    it('dispositivo confiable vigente omite el desafio y devuelve el token renovado', async () => {
      tfa.obtener.mockResolvedValue(TFA_ACTIVO);
      const out = await uc.execute({ ...input, dispositivoConfiable: DISPOSITIVO });
      expect(dispositivos.renovar).toHaveBeenCalledWith(
        'u-1',
        hashTokenDispositivo(DISPOSITIVO),
        expect.any(Date),
        expect.any(Date),
      );
      expect(out).toEqual({
        kind: 'ticket',
        ticket: 'desafio-SELECCIONAR',
        dispositivoConfiable: DISPOSITIVO,
        siguiente: '/x',
      });
    });

    it('dispositivo no vigente: se pide el desafio igual', async () => {
      tfa.obtener.mockResolvedValue(TFA_ACTIVO);
      dispositivos.renovar.mockResolvedValue(false);
      expect(await uc.execute({ ...input, dispositivoConfiable: DISPOSITIVO })).toMatchObject({
        kind: 'needs2fa',
      });
    });

    it('un siguiente nulo pasa tal cual', async () => {
      estados.consumir.mockResolvedValue({ nonce: 'n', codeVerifier: 'v', siguiente: null });
      expect(await uc.execute(input)).toMatchObject({ siguiente: null });
    });
  });
});

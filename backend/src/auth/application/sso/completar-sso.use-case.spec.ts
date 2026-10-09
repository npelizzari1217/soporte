/**
 * CompletarSsoUseCase, pasos 1, 2 y 4 a 7 de ADR-7 (sdd/login-sso; SL1 a SL7, SL13, SV2 a SV4,
 * SL15). El limitador, el vinculo y el ticket llegan en la WU-4c.
 */
import type { Mocked } from 'vitest';
import { CompletarSsoUseCase } from './completar-sso.use-case';
import { sha256Hex } from './pkce';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { MotivoSsoRechazado, SsoRechazadoError } from '../../domain/errors/sso.errors';
import { IIdentidadSsoRepository } from '../../domain/ports/identidad-sso-repository.port';
import { IMembresiaRepository, MembresiaResuelta } from '../../domain/ports/i-membresia.repository';
import { IProveedorOidc } from '../../domain/ports/proveedor-oidc.port';
import { ISsoEstadoRepository } from '../../domain/ports/sso-estado-repository.port';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { unstubbed } from '../../../testing/mocks';

const EMAIL = 'Ana@Empresa.com';
const SUJETO = 'sujeto-crudo-123';
const TOKEN = 'binding-crudo';
const STATE = 'state-crudo';

const input = { proveedor: 'GOOGLE' as const, code: 'c', state: STATE, bindingToken: TOKEN };

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
    uc = new CompletarSsoUseCase(estados, oidc, vinculos, usuarios, membresias, logger);
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
    const out = await uc.execute(input);
    expect(vinculos.buscarUsuarioPorSujeto).toHaveBeenCalledWith('GOOGLE', SUJETO);
    expect(usuarios.findById).toHaveBeenCalledWith('u-1');
    expect(usuarios.findManyByEmailInsensitive).not.toHaveBeenCalled();
    expect(out.resueltoPorEmail).toBe(false);
  });

  it('sin vinculo busca por email sin distinguir mayusculas y marca resueltoPorEmail', async () => {
    const out = await uc.execute(input);
    expect(usuarios.findManyByEmailInsensitive).toHaveBeenCalledWith(EMAIL);
    expect(out).toMatchObject({ resueltoPorEmail: true, siguiente: '/x', membresias: [membresia] });
    expect(out.usuario.id).toBe('u-1');
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
});

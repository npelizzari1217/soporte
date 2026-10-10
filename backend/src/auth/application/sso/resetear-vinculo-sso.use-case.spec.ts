import {
  ResetearVinculoSsoUseCase,
  ResetearVinculoSsoInput,
} from './resetear-vinculo-sso.use-case';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { MembresiaNoEncontradaError } from '../../domain/errors/auth.errors';
import { MembresiaResuelta } from '../../domain/ports/i-membresia.repository';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';

const CLIENTE_A = 'cliente-a';
const CLIENTE_B = 'cliente-b';
const DESTINO = 'destino-id';

const usuario = (isGlobalAdmin = false): UsuarioEntity =>
  UsuarioEntity.create(
    {
      email: 'd@test.com',
      nombre: 'D',
      apellido: 'D',
      passwordHash: 'h',
      activo: true,
      isGlobalAdmin,
    },
    DESTINO,
  );

const activaEn = (clienteId: string): MembresiaResuelta => ({
  clienteId,
  clienteNombre: 'C',
  rolCodigo: 'TECNICO',
  clienteRequiere2fa: false,
});

interface Escenario {
  destino?: UsuarioEntity | null;
  activaEnA?: boolean;
  todas?: string[];
  vinculos?: number;
  revocarFalla?: boolean;
}

function armar(e: Escenario = {}) {
  const orden: string[] = [];
  const identidades = {
    eliminarTodasDeUsuario: vi.fn(async () => {
      orden.push('eliminar');
      return e.vinculos ?? 2;
    }),
  };
  const usuarios = {
    findById: vi.fn(async () => (e.destino === undefined ? usuario() : e.destino)),
  };
  const membresias = {
    findActivaByUsuarioYCliente: vi.fn(async () =>
      e.activaEnA === false ? null : activaEn(CLIENTE_A),
    ),
    findClientesDeTodasByUsuario: vi.fn(async () => e.todas ?? [CLIENTE_A]),
  };
  const refresh = {
    revokeAllByUsuarioId: vi.fn(async () => {
      orden.push('revocar');
      if (e.revocarFalla) throw new Error('boom');
    }),
  };
  const logger: ILogger = { log: vi.fn(), error: vi.fn() };
  const uc = new ResetearVinculoSsoUseCase(identidades, usuarios, membresias, refresh, logger);
  return { uc, identidades, refresh, logger, orden };
}

const comoAdmin: ResetearVinculoSsoInput = {
  actorEsRoot: false,
  clienteId: CLIENTE_A,
  usuarioId: DESTINO,
};
const comoRoot: ResetearVinculoSsoInput = { ...comoAdmin, actorEsRoot: true };

describe('ResetearVinculoSsoUseCase', () => {
  it('SV7: autorizado borra los vinculos y despues revoca las sesiones', async () => {
    const { uc, identidades, refresh, orden } = armar();
    expect((await uc.execute(comoAdmin)).isOk()).toBe(true);
    expect(identidades.eliminarTodasDeUsuario).toHaveBeenCalledWith(DESTINO);
    expect(refresh.revokeAllByUsuarioId).toHaveBeenCalledWith(DESTINO);
    expect(orden).toEqual(['eliminar', 'revocar']);
  });

  it('SV8: ROOT resetea a otro ROOT sin mirar membresias', async () => {
    const { uc, identidades } = armar({
      destino: usuario(true),
      activaEnA: false,
      todas: [CLIENTE_B],
    });
    expect((await uc.execute(comoRoot)).isOk()).toBe(true);
    expect(identidades.eliminarTodasDeUsuario).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['otra membresia en otro cliente', { todas: [CLIENTE_A, CLIENTE_B] }],
    ['destino ROOT', { destino: usuario(true) }],
    ['sin membresia activa en su cliente', { activaEnA: false, todas: [CLIENTE_B] }],
    ['id inexistente', { destino: null }],
  ] as [string, Escenario][])(
    'SV8: toda denegacion es el mismo MembresiaNoEncontradaError - %s',
    async (_nombre, escenario) => {
      const { uc, identidades, refresh, logger } = armar(escenario);
      const r = await uc.execute(comoAdmin);
      expect(r.isFail()).toBe(true);
      expect(r.getError()).toBeInstanceOf(MembresiaNoEncontradaError);
      expect(r.getError().message).toBe(new MembresiaNoEncontradaError().message);
      expect(identidades.eliminarTodasDeUsuario).not.toHaveBeenCalled();
      expect(refresh.revokeAllByUsuarioId).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it('SV7: si la revocacion falla se loguea, no deshace el borrado y el reseteo es exito', async () => {
    const { uc, identidades, logger } = armar({ revocarFalla: true });
    expect((await uc.execute(comoAdmin)).isOk()).toBe(true);
    expect(identidades.eliminarTodasDeUsuario).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`usuarioId=${DESTINO}`));
  });

  it('SV7: sin vinculos tambien es exito y revoca las sesiones', async () => {
    const { uc, refresh } = armar({ vinculos: 0 });
    expect((await uc.execute(comoAdmin)).isOk()).toBe(true);
    expect(refresh.revokeAllByUsuarioId).toHaveBeenCalledTimes(1);
  });
});

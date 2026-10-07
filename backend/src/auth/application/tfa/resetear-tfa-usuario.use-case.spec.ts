import {
  ResetearTfaUsuarioUseCase,
  ResetearTfaUsuarioInput,
} from './resetear-tfa-usuario.use-case';
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
  revocarFalla?: boolean;
}

function armar(e: Escenario = {}) {
  const orden: string[] = [];
  const tfa = {
    eliminarTodo: vi.fn(async () => {
      orden.push('eliminarTodo');
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
  const uc = new ResetearTfaUsuarioUseCase(tfa, usuarios, membresias, refresh, logger);
  return { uc, tfa, refresh, logger, orden };
}

const comoAdmin: ResetearTfaUsuarioInput = {
  actorEsRoot: false,
  clienteId: CLIENTE_A,
  usuarioId: DESTINO,
};
const comoRoot: ResetearTfaUsuarioInput = { ...comoAdmin, actorEsRoot: true };

describe('ResetearTfaUsuarioUseCase', () => {
  it('S1: ROOT resetea a un usuario comun, sin mirar membresias', async () => {
    const { uc, tfa, orden } = armar({ activaEnA: false, todas: [CLIENTE_B] });
    expect((await uc.execute(comoRoot)).isOk()).toBe(true);
    expect(tfa.eliminarTodo).toHaveBeenCalledWith(DESTINO);
    expect(orden).toEqual(['eliminarTodo', 'revocar']);
  });

  it('S1: ROOT resetea a otro ROOT', async () => {
    const { uc, tfa } = armar({ destino: usuario(true) });
    expect((await uc.execute(comoRoot)).isOk()).toBe(true);
    expect(tfa.eliminarTodo).toHaveBeenCalledTimes(1);
  });

  it('S2: ADMINISTRADOR resetea a un usuario cuya unica membresia es la suya', async () => {
    const { uc, tfa } = armar();
    expect((await uc.execute(comoAdmin)).isOk()).toBe(true);
    expect(tfa.eliminarTodo).toHaveBeenCalledWith(DESTINO);
  });

  it('S2: ADMINISTRADOR puede resetearse a si mismo si cumple la regla', async () => {
    const { uc } = armar();
    expect((await uc.execute({ ...comoAdmin, usuarioId: DESTINO })).isOk()).toBe(true);
  });

  it.each([
    [
      'otra membresia (inactiva, suspendida o soft-deleted: todas cuentan)',
      { todas: [CLIENTE_A, CLIENTE_B] },
    ],
    ['membresia soft-deleted en otro cliente', { todas: [CLIENTE_B, CLIENTE_A] }],
    ['destino ROOT', { destino: usuario(true) }],
    ['sin membresia activa en su cliente (otro cliente)', { activaEnA: false, todas: [CLIENTE_B] }],
    ['id inexistente', { destino: null }],
  ] as [string, Escenario][])(
    'S2/S4: rechaza con el mismo 404 - %s',
    async (_nombre, escenario) => {
      const { uc, tfa, refresh } = armar(escenario);
      const r = await uc.execute(comoAdmin);
      expect(r.isFail()).toBe(true);
      expect(r.getError()).toBeInstanceOf(MembresiaNoEncontradaError);
      expect(r.getError().message).toBe(new MembresiaNoEncontradaError().message);
      expect(tfa.eliminarTodo).not.toHaveBeenCalled();
      expect(refresh.revokeAllByUsuarioId).not.toHaveBeenCalled();
    },
  );

  it('ROOT sobre un id inexistente recibe el mismo error', async () => {
    const { uc } = armar({ destino: null });
    expect((await uc.execute(comoRoot)).getError()).toBeInstanceOf(MembresiaNoEncontradaError);
  });

  it('S3: si revocar los refresh tokens falla, se loguea y el reseteo reporta exito', async () => {
    const { uc, logger } = armar({ revocarFalla: true });
    expect((await uc.execute(comoAdmin)).isOk()).toBe(true);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});

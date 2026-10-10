import { puedeResetearAUsuario, PoliticaReseteoInput } from './politica-reseteo-usuario';
import { UsuarioEntity } from '../domain/entities/usuario.entity';
import { MembresiaResuelta } from '../domain/ports/i-membresia.repository';

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
}

function armar(e: Escenario = {}) {
  const usuarios = {
    findById: vi.fn(async () => (e.destino === undefined ? usuario() : e.destino)),
  };
  const membresias = {
    findActivaByUsuarioYCliente: vi.fn(async () =>
      e.activaEnA === false ? null : activaEn(CLIENTE_A),
    ),
    findClientesDeTodasByUsuario: vi.fn(async () => e.todas ?? [CLIENTE_A]),
  };
  return { usuarios, membresias };
}

const comoAdmin: PoliticaReseteoInput = {
  actorEsRoot: false,
  clienteId: CLIENTE_A,
  usuarioId: DESTINO,
};
const comoRoot: PoliticaReseteoInput = { ...comoAdmin, actorEsRoot: true };

describe('puedeResetearAUsuario', () => {
  it('objetivo inexistente: false, tambien para ROOT', async () => {
    expect(await puedeResetearAUsuario(comoAdmin, armar({ destino: null }))).toBe(false);
    expect(await puedeResetearAUsuario(comoRoot, armar({ destino: null }))).toBe(false);
  });

  it('actor ROOT: true sin mirar membresias, incluso con objetivo ROOT', async () => {
    const deps = armar({ destino: usuario(true), activaEnA: false, todas: [CLIENTE_B] });
    expect(await puedeResetearAUsuario(comoRoot, deps)).toBe(true);
    expect(deps.membresias.findActivaByUsuarioYCliente).not.toHaveBeenCalled();
    expect(deps.membresias.findClientesDeTodasByUsuario).not.toHaveBeenCalled();
  });

  it('actor ROOT: true con un objetivo sin membresias activas', async () => {
    expect(await puedeResetearAUsuario(comoRoot, armar({ activaEnA: false, todas: [] }))).toBe(
      true,
    );
  });

  it('objetivo ROOT con actor ADMINISTRADOR: false', async () => {
    expect(await puedeResetearAUsuario(comoAdmin, armar({ destino: usuario(true) }))).toBe(false);
  });

  it('sin membresia activa en el cliente del actor: false', async () => {
    const deps = armar({ activaEnA: false, todas: [CLIENTE_B] });
    expect(await puedeResetearAUsuario(comoAdmin, deps)).toBe(false);
    expect(deps.membresias.findActivaByUsuarioYCliente).toHaveBeenCalledWith(DESTINO, CLIENTE_A);
  });

  it('todas las membresias en el cliente del actor: true', async () => {
    const deps = armar({ todas: [CLIENTE_A, CLIENTE_A] });
    expect(await puedeResetearAUsuario(comoAdmin, deps)).toBe(true);
    expect(deps.membresias.findClientesDeTodasByUsuario).toHaveBeenCalledWith(DESTINO);
  });

  it.each([
    [
      'una membresia en otro cliente (inactiva, borrada o de cliente suspendido cuentan)',
      [CLIENTE_A, CLIENTE_B],
    ],
    ['la otra membresia primero', [CLIENTE_B, CLIENTE_A]],
  ])('%s: false', async (_nombre, todas) => {
    expect(await puedeResetearAUsuario(comoAdmin, armar({ todas }))).toBe(false);
  });
});

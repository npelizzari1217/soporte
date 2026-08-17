/**
 * permisos.util.spec.ts — chequeos de permiso inline que honran el flag ROOT
 * (sdd/root-access-fix). Lógica compartida por los controllers que resuelven
 * autorización condicional al body/query fuera de PermissionsGuard.
 *
 * `puedeEjecutar`/`puedeEjecutarAlguna`/`esAdminDeCliente` (WU-5,
 * sdd/matriz-permisos-por-usuario) son el predicado NUEVO sobre la matriz de
 * permisos — único consumido por `AccionesGuard` (WU-6) y los chequeos
 * inline migrados en WU-7.3. Ref spec R3. Ref design ADR-P11.
 */
import {
  actorTienePermiso,
  actorTieneAlgunPermiso,
  puedeEjecutar,
  puedeEjecutarAlguna,
  esAdminDeCliente,
} from './permisos.util';

type Actor = { is_global_admin: boolean; permisos: string[] };
const noRoot = (permisos: string[]): Actor => ({ is_global_admin: false, permisos });
const root: Actor = { is_global_admin: true, permisos: [] };

describe('actorTienePermiso', () => {
  it.each([
    ['no-root con el permiso', noRoot(['ticket:observar']), 'ticket:observar', true],
    ['no-root sin el permiso', noRoot(['ticket:crear']), 'ticket:observar', false],
    ['ROOT con permisos=[]', root, 'ticket:observar', true],
  ])('%s → %s', (_caso, actor, permiso, esperado) => {
    expect(actorTienePermiso(actor, permiso as string)).toBe(esperado);
  });
});

describe('actorTieneAlgunPermiso (regla OR)', () => {
  const requeridos = ['ticket:asignar', 'ticket:ver_todos', 'usuario:gestionar'];

  it.each([
    ['no-root con uno de los requeridos', noRoot(['ticket:ver_todos']), true],
    ['no-root sin ninguno', noRoot(['ticket:crear']), false],
    ['ROOT con permisos=[]', root, true],
  ])('%s → %s', (_caso, actor, esperado) => {
    expect(actorTieneAlgunPermiso(actor, requeridos)).toBe(esperado);
  });
});

// ─── puedeEjecutar / puedeEjecutarAlguna / esAdminDeCliente (WU-5) ─────────

type ActorAccionesTest = { is_global_admin: boolean; rol: string | null; permisos: string[] };
const usuarioComun = (permisos: string[]): ActorAccionesTest => ({
  is_global_admin: false,
  rol: 'TECNICO',
  permisos,
});
const administrador: ActorAccionesTest = {
  is_global_admin: false,
  rol: 'ADMINISTRADOR',
  permisos: [],
};
const rootActor: ActorAccionesTest = { is_global_admin: true, rol: null, permisos: [] };

describe('puedeEjecutar', () => {
  it('ROOT (is_global_admin) siempre puede, sin importar el código', () => {
    expect(puedeEjecutar(rootActor, 'TICKETS:ALTAS')).toBe(true);
  });

  it('ADMINISTRADOR puede cualquier par VÁLIDO del catálogo, sin tener la celda', () => {
    expect(puedeEjecutar(administrador, 'COMPRAS:APROBACION')).toBe(true);
  });

  it('ADMINISTRADOR NO puede un par que no existe en el catálogo', () => {
    expect(puedeEjecutar(administrador, 'DASHBOARD:APROBACION')).toBe(false);
  });

  it('usuario común con la celda → true', () => {
    expect(puedeEjecutar(usuarioComun(['TICKETS:ALTAS']), 'TICKETS:ALTAS')).toBe(true);
  });

  it('usuario común sin la celda → false', () => {
    expect(puedeEjecutar(usuarioComun(['TICKETS:ALTAS']), 'TICKETS:MODIFICACION')).toBe(false);
  });

  it('fail-closed (S5): permisos undefined no crashea, deniega', () => {
    const actor = {
      is_global_admin: false,
      rol: 'TECNICO',
      permisos: undefined,
    } as unknown as ActorAccionesTest;
    expect(puedeEjecutar(actor, 'TICKETS:ALTAS')).toBe(false);
  });
});

describe('puedeEjecutarAlguna (regla OR)', () => {
  it('true si tiene AL MENOS UNO de los códigos', () => {
    expect(
      puedeEjecutarAlguna(usuarioComun(['TICKETS:VER_TODOS']), [
        'TICKETS:ASIGNAR',
        'TICKETS:VER_TODOS',
      ]),
    ).toBe(true);
  });

  it('false si no tiene ninguno', () => {
    expect(
      puedeEjecutarAlguna(usuarioComun(['TICKETS:ALTAS']), [
        'TICKETS:ASIGNAR',
        'TICKETS:VER_TODOS',
      ]),
    ).toBe(false);
  });
});

describe('esAdminDeCliente', () => {
  it.each([
    ['ROOT', rootActor, true],
    ['ADMINISTRADOR', administrador, true],
    ['TECNICO', usuarioComun([]), false],
  ])('%s → %s', (_caso, actor, esperado) => {
    expect(esAdminDeCliente(actor)).toBe(esperado);
  });
});

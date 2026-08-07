/**
 * permisos.util.spec.ts — chequeos de permiso inline que honran el flag ROOT
 * (sdd/root-access-fix). Lógica compartida por los controllers que resuelven
 * autorización condicional al body/query fuera de PermissionsGuard.
 */
import { actorTienePermiso, actorTieneAlgunPermiso } from './permisos.util';

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

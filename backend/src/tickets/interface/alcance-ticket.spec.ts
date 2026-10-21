/**
 * [UNIT] `CargadorAlcanceTicket` (odd/permisos-por-tipo-ticket, D5 a): el alcance de tickets se
 * carga por request de la tabla del tenant, no del JWT. ROOT y ADMINISTRADOR no se restringen y
 * no consultan la tabla.
 */
import { JwtPayload } from '../../auth/domain/ports/i-token.service';
import { PermisosTipoTicketEnMemoria } from '../test-helpers/permisos-tipo-ticket-en-memoria';
import { CargadorAlcanceTicket } from './alcance-ticket';

const TIPOS = [
  { id: 'tipo-soporte', modulo: 'TICKETS' },
  { id: 'tipo-mantenimiento', modulo: 'EDILICIA' },
];

function jwt(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    v: 1,
    sub: 'tecnico-1',
    cliente_id: 'cliente-1',
    rol: 'TECNICO',
    // Celdas del JWT a propósito: no deciden nada sobre tickets (D5 d).
    permisos: ['TICKETS:VER_TODOS', 'TICKETS:OBSERVAR', 'EDILICIA:MODIFICACION'],
    is_global_admin: false,
    cliente_nombre: 'Cliente',
    membresias: [],
    modulos: ['TICKETS', 'EDILICIA'],
    nombre: 'Tina',
    apellido: 'Técnica',
    cliente_logo_v: null,
    ...overrides,
  };
}

function armar() {
  const repo = new PermisosTipoTicketEnMemoria(TIPOS, [
    { usuarioId: 'tecnico-1', tipoId: 'tipo-soporte', accion: 'LECTURA' },
    { usuarioId: 'tecnico-1', tipoId: 'tipo-soporte', accion: 'MODIFICACION' },
    { usuarioId: 'tecnico-1', tipoId: 'tipo-mantenimiento', accion: 'LECTURA' },
    { usuarioId: 'otro', tipoId: 'tipo-mantenimiento', accion: 'MODIFICACION' },
  ]);
  const listarPorUsuario = vi.spyOn(repo, 'listarPorUsuario');
  return { cargador: new CargadorAlcanceTicket(repo), listarPorUsuario };
}

describe('CargadorAlcanceTicket', () => {
  it('arma el mapa por tipo del usuario del JWT, sin mirar las celdas del JWT', async () => {
    const { cargador, listarPorUsuario } = armar();

    const alcance = await cargador.cargar(jwt());

    expect(alcance.actorId).toBe('tecnico-1');
    expect(listarPorUsuario).toHaveBeenCalledTimes(1);
    expect(listarPorUsuario).toHaveBeenCalledWith('tecnico-1');
    const porTipo = [...(alcance.permisosPorTipo ?? new Map())].map(([tipo, acciones]) => [
      tipo,
      [...acciones].sort(),
    ]);
    expect(porTipo).toEqual([
      ['tipo-soporte', ['LECTURA', 'MODIFICACION']],
      ['tipo-mantenimiento', ['LECTURA']],
    ]);
  });

  it('un usuario sin filas queda con el mapa vacío: no ve ningún tipo', async () => {
    const { cargador } = armar();

    const alcance = await cargador.cargar(jwt({ sub: 'sin-filas' }));

    expect(alcance.permisosPorTipo?.size).toBe(0);
  });

  it.each([
    ['ADMINISTRADOR', jwt({ rol: 'ADMINISTRADOR', permisos: [] })],
    ['ROOT', jwt({ is_global_admin: true, rol: null, permisos: [] })],
  ])('%s queda sin restricción y no consulta la tabla', async (_rol, user) => {
    const { cargador, listarPorUsuario } = armar();

    const alcance = await cargador.cargar(user);

    expect(alcance).toEqual({ actorId: 'tecnico-1', permisosPorTipo: null });
    expect(listarPorUsuario).not.toHaveBeenCalled();
  });

  it('el actor de tareas lleva los mismos permisos por tipo y si es administrador', async () => {
    const { cargador } = armar();

    const tecnico = await cargador.cargarActorTarea(jwt());
    const admin = await cargador.cargarActorTarea(jwt({ rol: 'ADMINISTRADOR' }));

    expect(tecnico.id).toBe('tecnico-1');
    expect(tecnico.esAdministrador).toBe(false);
    expect([...(tecnico.permisosPorTipo?.get('tipo-soporte') ?? [])].sort()).toEqual([
      'LECTURA',
      'MODIFICACION',
    ]);
    expect(admin).toEqual({ id: 'tecnico-1', esAdministrador: true, permisosPorTipo: null });
  });
});

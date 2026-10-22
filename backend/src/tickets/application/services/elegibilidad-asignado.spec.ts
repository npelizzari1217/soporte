/**
 * Elegibilidad del asignado por tipo (odd/permisos-por-tipo-ticket, S1, S2, D5 g). Decide la fila
 * por tipo del tenant (`LECTURA` sobre el tipo del ticket); master solo aporta identidad, rol y
 * membresía. Las celdas de la matriz por módulo ya no cuentan: el doble de master las tiene a
 * propósito, para que un regreso al criterio por módulo ponga estos casos en rojo.
 */
import { AccionTipoTicket } from '../../domain/permisos-tipo-ticket';
import { MasterAgentesEnMemoria } from '../../test-helpers/master-agentes-en-memoria';
import { PermisosTipoTicketEnMemoria } from '../../test-helpers/permisos-tipo-ticket-en-memoria';
import { ElegibilidadAsignado } from './elegibilidad-asignado';

const CLIENTE = 'cliente-1';
const SOPORTE = 'tipo-soporte';
const MANTENIMIENTO = 'tipo-mantenimiento';

function armar() {
  const master = new MasterAgentesEnMemoria();
  const permisos = new PermisosTipoTicketEnMemoria([]);
  const lecturasPorUsuario = vi.spyOn(permisos, 'listarPorUsuario');
  const lecturasPorTipo = vi.spyOn(permisos, 'listarUsuariosConAccion');
  return {
    elegibilidad: new ElegibilidadAsignado(master, permisos),
    master,
    permisos,
    lecturas: (): number =>
      lecturasPorUsuario.mock.calls.length + lecturasPorTipo.mock.calls.length,
  };
}

function conceder(
  permisos: PermisosTipoTicketEnMemoria,
  usuarioId: string,
  tipoId: string,
  ...acciones: AccionTipoTicket[]
): void {
  void permisos.agregarSiFaltan(acciones.map((accion) => ({ usuarioId, tipoId, accion })));
}

describe('ElegibilidadAsignado.esAsignableATipo (asignación manual)', () => {
  it('con la celda EDILICIA:LECTURA de la matriz pero sin fila del tipo → no elegible', async () => {
    const { elegibilidad, master } = armar();
    master.agregar({ id: 'u-1', rol: 'TECNICO', celdas: ['EDILICIA:LECTURA'] });

    await expect(elegibilidad.esAsignableATipo('u-1', CLIENTE, SOPORTE)).resolves.toBe(false);
  });

  it('con LECTURA sobre el tipo y ninguna celda de la matriz → elegible', async () => {
    const { elegibilidad, master, permisos } = armar();
    master.agregar({ id: 'u-1', rol: 'TECNICO', celdas: [] });
    conceder(permisos, 'u-1', SOPORTE, 'LECTURA');

    await expect(elegibilidad.esAsignableATipo('u-1', CLIENTE, SOPORTE)).resolves.toBe(true);
  });

  it('decide por tipo: elegible para Soporte y no para Mantenimiento', async () => {
    const { elegibilidad, master, permisos } = armar();
    master.agregar({ id: 'u-1', rol: 'COLABORADOR', celdas: ['TICKETS:LECTURA'] });
    conceder(permisos, 'u-1', SOPORTE, 'LECTURA', 'MODIFICACION');
    conceder(permisos, 'u-1', MANTENIMIENTO, 'MODIFICACION', 'COMENTAR');

    await expect(elegibilidad.esAsignableATipo('u-1', CLIENTE, SOPORTE)).resolves.toBe(true);
    await expect(elegibilidad.esAsignableATipo('u-1', CLIENTE, MANTENIMIENTO)).resolves.toBe(false);
  });

  it('la LECTURA de otro usuario sobre el tipo no lo vuelve elegible', async () => {
    const { elegibilidad, master, permisos } = armar();
    master.agregar({ id: 'u-1', rol: 'TECNICO', celdas: [] });
    conceder(permisos, 'u-2', SOPORTE, 'LECTURA');

    await expect(elegibilidad.esAsignableATipo('u-1', CLIENTE, SOPORTE)).resolves.toBe(false);
  });

  it('ROOT o ADMINISTRADOR es elegible sin filas del tipo y sin leer la tabla del tenant', async () => {
    const { elegibilidad, master, lecturas } = armar();
    master.agregar({ id: 'u-admin', rol: 'ADMINISTRADOR', celdas: [] });
    master.agregar({ id: 'u-root', rol: 'ROOT', celdas: [] });

    await expect(elegibilidad.esAsignableATipo('u-admin', CLIENTE, SOPORTE)).resolves.toBe(true);
    await expect(elegibilidad.esAsignableATipo('u-root', CLIENTE, SOPORTE)).resolves.toBe(true);
    expect(lecturas()).toBe(0);
  });

  it('un USUARIO con LECTURA sobre el tipo es asignable a mano, como antes con el módulo', async () => {
    const { elegibilidad, master, permisos } = armar();
    master.agregar({ id: 'u-1', rol: 'USUARIO', celdas: [] });
    conceder(permisos, 'u-1', SOPORTE, 'LECTURA');

    await expect(elegibilidad.esAsignableATipo('u-1', CLIENTE, SOPORTE)).resolves.toBe(true);
  });
});

describe('ElegibilidadAsignado.listarAgentesDeTipo (combo, técnico de tarea, responsable de regla)', () => {
  it('lista solo TECNICO y COLABORADOR con LECTURA sobre el tipo, en el orden de master', async () => {
    const { elegibilidad, master, permisos } = armar();
    master.agregar({ id: 'u-b', rol: 'TECNICO', celdas: [], apellido: 'Bravo' });
    master.agregar({ id: 'u-a', rol: 'COLABORADOR', celdas: [], apellido: 'Alfa' });
    master.agregar({ id: 'u-usuario', rol: 'USUARIO', celdas: [] });
    master.agregar({ id: 'u-admin', rol: 'ADMINISTRADOR', celdas: [] });
    master.agregar({ id: 'u-celda', rol: 'TECNICO', celdas: ['TICKETS:LECTURA'] });
    for (const id of ['u-b', 'u-a', 'u-usuario', 'u-admin']) {
      conceder(permisos, id, SOPORTE, 'LECTURA');
    }
    conceder(permisos, 'u-celda', SOPORTE, 'MODIFICACION');

    const agentes = await elegibilidad.listarAgentesDeTipo(CLIENTE, SOPORTE);

    expect(agentes.map((a) => a.id)).toEqual(['u-a', 'u-b']);
    expect(agentes[0]).toEqual({ id: 'u-a', nombre: 'Nombre u-a', apellido: 'Alfa' });
  });

  it('sin nadie con LECTURA sobre el tipo → [] sin consultar master', async () => {
    const { elegibilidad, master } = armar();
    master.agregar({ id: 'u-1', rol: 'TECNICO', celdas: ['EDILICIA:LECTURA'] });

    await expect(elegibilidad.listarAgentesDeTipo(CLIENTE, MANTENIMIENTO)).resolves.toEqual([]);
    expect(master.consultasDeAgentes).toBe(0);
  });

  it('por lote: cada tipo con sus agentes, en una consulta al tenant y otra a master', async () => {
    const { elegibilidad, master, permisos, lecturas } = armar();
    master.agregar({ id: 'u-1', rol: 'TECNICO', celdas: [] });
    master.agregar({ id: 'u-2', rol: 'TECNICO', celdas: [] });
    conceder(permisos, 'u-1', SOPORTE, 'LECTURA');
    conceder(permisos, 'u-2', SOPORTE, 'LECTURA');
    conceder(permisos, 'u-2', MANTENIMIENTO, 'LECTURA');

    const porTipo = await elegibilidad.listarAgentesPorTipo(CLIENTE, [
      SOPORTE,
      MANTENIMIENTO,
      'tipo-sin-filas',
    ]);

    expect([...porTipo.keys()]).toEqual([SOPORTE, MANTENIMIENTO, 'tipo-sin-filas']);
    expect(porTipo.get(SOPORTE)?.map((a) => a.id)).toEqual(['u-1', 'u-2']);
    expect(porTipo.get(MANTENIMIENTO)?.map((a) => a.id)).toEqual(['u-2']);
    expect(porTipo.get('tipo-sin-filas')).toEqual([]);
    expect(lecturas()).toBe(1);
    expect(master.consultasDeAgentes).toBe(1);
  });

  it('esAgenteDeTipo coincide con la lista: dentro si figura, fuera si no', async () => {
    const { elegibilidad, master, permisos } = armar();
    master.agregar({ id: 'u-tecnico', rol: 'TECNICO', celdas: [] });
    master.agregar({ id: 'u-admin', rol: 'ADMINISTRADOR', celdas: [] });
    conceder(permisos, 'u-tecnico', SOPORTE, 'LECTURA');
    conceder(permisos, 'u-admin', SOPORTE, 'LECTURA');

    await expect(elegibilidad.esAgenteDeTipo('u-tecnico', CLIENTE, SOPORTE)).resolves.toBe(true);
    await expect(elegibilidad.esAgenteDeTipo('u-tecnico', CLIENTE, MANTENIMIENTO)).resolves.toBe(
      false,
    );
    // ADMINISTRADOR y ROOT no son agentes: no reciben tareas ni reglas (punto 9).
    await expect(elegibilidad.esAgenteDeTipo('u-admin', CLIENTE, SOPORTE)).resolves.toBe(false);
  });

  it('esAgenteDeTipo sin LECTURA sobre el tipo no consulta master', async () => {
    const { elegibilidad, master } = armar();
    master.agregar({ id: 'u-1', rol: 'TECNICO', celdas: ['TICKETS:LECTURA'] });

    await expect(elegibilidad.esAgenteDeTipo('u-1', CLIENTE, SOPORTE)).resolves.toBe(false);
    expect(master.consultasDeAgentes).toBe(0);
  });

  it('un fallo de master se propaga: decidir qué hacer es de quien llama', async () => {
    const { elegibilidad, master, permisos } = armar();
    conceder(permisos, 'u-1', SOPORTE, 'LECTURA');
    vi.spyOn(master, 'listarAgentes').mockRejectedValue(new Error('master caido'));

    await expect(elegibilidad.esAgenteDeTipo('u-1', CLIENTE, SOPORTE)).rejects.toThrow(
      'master caido',
    );
    await expect(elegibilidad.listarAgentesDeTipo(CLIENTE, SOPORTE)).rejects.toThrow(
      'master caido',
    );
  });
});

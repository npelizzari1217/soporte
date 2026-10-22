/**
 * [UNIT] ListarReglasAsignacionUseCase — R2, R4 (sdd/asignacion-automatica-por-tipo).
 *
 * Elegibilidad por tipo (odd/permisos-por-tipo-ticket, D5 g): `ElegibilidadAsignado` real sobre
 * dobles en memoria. El candidato de un tipo es TECNICO o COLABORADOR con `LECTURA` sobre ESE tipo;
 * las celdas por módulo de master no cuentan.
 *
 * Mutación documentada: consultar la elegibilidad por fila (en vez de en un lote) pone en rojo el
 * caso de las consultas; tomar el estado de `reglaRepo` sin cruzarlo con los candidatos del tipo
 * deja `ROTA` como `VALIDA` y pone en rojo los casos de la regla rota.
 */
import { ElegibilidadAsignado } from '../../../tickets/application/services/elegibilidad-asignado';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import { AccionTipoTicket } from '../../../tickets/domain/permisos-tipo-ticket';
import { ReglaAsignacion } from '../../../tickets/domain/ports/i-regla-asignacion.repository';
import { MasterAgentesEnMemoria } from '../../../tickets/test-helpers/master-agentes-en-memoria';
import { PermisosTipoTicketEnMemoria } from '../../../tickets/test-helpers/permisos-tipo-ticket-en-memoria';
import { Modulo } from '../../../shared/domain/modulos';
import { ListarReglasAsignacionUseCase } from './listar-reglas-asignacion.use-case';

const CLIENTE = 'cliente-1';

function tipo(id: string, modulo: Modulo, activo = true): TipoTicketEntity {
  return TipoTicketEntity.create(
    { codigo: id.toUpperCase(), nombre: `Tipo ${id}`, modulo, activo },
    id,
  );
}

function regla(tipoId: string, responsableId: string): ReglaAsignacion {
  const fecha = new Date('2026-10-09');
  return { tipoId, responsableId, actualizadoPor: 'admin', createdAt: fecha, updatedAt: fecha };
}

/** Filas por tipo de partida: Tina atiende t1, t2 y t4 (TICKETS); Carla, t3 (COMPRAS). */
const FILAS: { usuarioId: string; tipoId: string; accion: AccionTipoTicket }[] = [
  { usuarioId: 'u-tina', tipoId: 't1', accion: 'LECTURA' },
  { usuarioId: 'u-tina', tipoId: 't2', accion: 'LECTURA' },
  { usuarioId: 'u-tina', tipoId: 't4', accion: 'LECTURA' },
  { usuarioId: 'u-carla', tipoId: 't3', accion: 'LECTURA' },
];

function armar(tipos: TipoTicketEntity[], reglas: ReglaAsignacion[], filas = FILAS) {
  const master = new MasterAgentesEnMemoria();
  master.agregar({ id: 'u-tina', rol: 'TECNICO', celdas: [], nombre: 'Tina', apellido: 'Tecnica' });
  master.agregar({
    id: 'u-carla',
    rol: 'COLABORADOR',
    celdas: [],
    nombre: 'Carla',
    apellido: 'Compras',
  });
  // Celda de la matriz por módulo sin fila del tipo: ya no la hace candidata.
  master.agregar({ id: 'u-celda', rol: 'TECNICO', celdas: ['TICKETS:LECTURA'] });
  const permisos = new PermisosTipoTicketEnMemoria([], filas);
  const listarAgentes = vi.spyOn(master, 'listarAgentes');
  const listarUsuariosConAccion = vi.spyOn(permisos, 'listarUsuariosConAccion');
  const resolverNombres = vi
    .fn()
    .mockResolvedValue(new Map([['u-baja', { nombre: 'Beto', apellido: 'Baja' }]]));
  const useCase = new ListarReglasAsignacionUseCase(
    { findAllActive: vi.fn().mockResolvedValue(tipos) },
    { listar: vi.fn().mockResolvedValue(reglas) },
    new ElegibilidadAsignado(master, permisos),
    { resolverNombres },
  );
  return { useCase, listarAgentes, listarUsuariosConAccion, resolverNombres };
}

describe('ListarReglasAsignacionUseCase', () => {
  it('una fila por tipo activo; el tipo dado de baja no aparece', async () => {
    const { useCase } = armar(
      [tipo('t1', 'TICKETS'), tipo('t2', 'COMPRAS'), tipo('t3', 'TICKETS', false)],
      [],
    );

    const { reglas } = await useCase.execute(CLIENTE);

    expect(reglas.map((fila) => fila.tipoId)).toEqual(['t1', 't2']);
  });

  it('SIN_REGLA no lleva responsable', async () => {
    const { useCase } = armar([tipo('t1', 'TICKETS')], []);

    const { reglas } = await useCase.execute(CLIENTE);

    expect(reglas[0]).toMatchObject({
      codigo: 'T1',
      modulo: 'TICKETS',
      responsableId: null,
      responsableNombre: null,
      estado: 'SIN_REGLA',
    });
  });

  it('VALIDA toma el nombre del candidato, sin consultar resolverNombres', async () => {
    const { useCase, resolverNombres } = armar([tipo('t1', 'TICKETS')], [regla('t1', 'u-tina')]);

    const { reglas } = await useCase.execute(CLIENTE);

    expect(reglas[0]).toMatchObject({
      responsableId: 'u-tina',
      responsableNombre: 'Tina Tecnica',
      estado: 'VALIDA',
    });
    expect(resolverNombres).not.toHaveBeenCalled();
  });

  it('ROTA toma el nombre de resolverNombres; null si el usuario fue borrado', async () => {
    const { useCase, resolverNombres } = armar(
      [tipo('t1', 'TICKETS'), tipo('t2', 'COMPRAS')],
      [regla('t1', 'u-baja'), regla('t2', 'u-borrado')],
    );

    const { reglas } = await useCase.execute(CLIENTE);

    expect(reglas[0]).toMatchObject({ estado: 'ROTA', responsableNombre: 'Beto Baja' });
    expect(reglas[1]).toMatchObject({
      estado: 'ROTA',
      responsableId: 'u-borrado',
      responsableNombre: null,
    });
    expect(resolverNombres).toHaveBeenCalledTimes(1);
    expect(resolverNombres).toHaveBeenCalledWith(['u-baja', 'u-borrado']);
  });

  it('decide por tipo: el mismo responsable es VALIDA en un tipo con LECTURA y ROTA en otro del mismo módulo', async () => {
    const { useCase } = armar(
      [tipo('t1', 'TICKETS'), tipo('t5', 'TICKETS')],
      [regla('t1', 'u-tina'), regla('t5', 'u-tina')],
    );

    const { reglas } = await useCase.execute(CLIENTE);

    expect(reglas.map((fila) => [fila.tipoId, fila.estado])).toEqual([
      ['t1', 'VALIDA'],
      ['t5', 'ROTA'],
    ]);
  });

  it('un TECNICO con la celda del módulo pero sin fila del tipo es ROTA', async () => {
    const { useCase } = armar([tipo('t1', 'TICKETS')], [regla('t1', 'u-celda')]);

    const { reglas } = await useCase.execute(CLIENTE);

    expect(reglas[0]).toMatchObject({ estado: 'ROTA', responsableId: 'u-celda' });
  });

  it('candidatos por tipo, resueltos en un lote: una consulta al tenant y otra a master', async () => {
    const { useCase, listarAgentes, listarUsuariosConAccion } = armar(
      [tipo('t1', 'TICKETS'), tipo('t5', 'TICKETS'), tipo('t3', 'COMPRAS')],
      [],
    );

    const { candidatosPorTipo } = await useCase.execute(CLIENTE);

    expect(listarUsuariosConAccion).toHaveBeenCalledTimes(1);
    expect(listarAgentes).toHaveBeenCalledTimes(1);
    expect(candidatosPorTipo).toEqual({
      t1: [{ id: 'u-tina', nombre: 'Tina', apellido: 'Tecnica' }],
      t5: [],
      t3: [{ id: 'u-carla', nombre: 'Carla', apellido: 'Compras' }],
    });
  });

  it('candidatosPorModulo, para el front actual: la unión de los candidatos de los tipos del módulo', async () => {
    const { useCase } = armar(
      [tipo('t1', 'TICKETS'), tipo('t5', 'TICKETS'), tipo('t3', 'COMPRAS')],
      [],
      [...FILAS, { usuarioId: 'u-carla', tipoId: 't5', accion: 'LECTURA' }],
    );

    const { candidatosPorModulo } = await useCase.execute(CLIENTE);

    expect(Object.keys(candidatosPorModulo).sort()).toEqual(['COMPRAS', 'TICKETS']);
    // Ordenados por apellido y nombre, sin repetir a quien atiende varios tipos del módulo.
    expect(candidatosPorModulo.TICKETS).toEqual([
      { id: 'u-carla', nombre: 'Carla', apellido: 'Compras' },
      { id: 'u-tina', nombre: 'Tina', apellido: 'Tecnica' },
    ]);
    expect(candidatosPorModulo.COMPRAS).toEqual([
      { id: 'u-carla', nombre: 'Carla', apellido: 'Compras' },
    ]);
  });
});

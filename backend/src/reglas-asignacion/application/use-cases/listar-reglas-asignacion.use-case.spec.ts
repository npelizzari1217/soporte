/**
 * [UNIT] ListarReglasAsignacionUseCase — R2, R4 (sdd/asignacion-automatica-por-tipo).
 *
 * Mutación documentada: consultar `listarTecnicosAsignables` por fila (en vez de por módulo
 * distinto) pone en rojo el caso de las llamadas; tomar el estado de `reglaRepo` sin cruzarlo con
 * los candidatos deja `ROTA` como `VALIDA` y pone en rojo el caso de la regla rota.
 */
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import { ReglaAsignacion } from '../../../tickets/domain/ports/i-regla-asignacion.repository';
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

function armar(tipos: TipoTicketEntity[], reglas: ReglaAsignacion[]) {
  const candidatos: Record<string, { id: string; nombre: string; apellido: string }[]> = {
    TICKETS: [{ id: 'u-tina', nombre: 'Tina', apellido: 'Tecnica' }],
    COMPRAS: [{ id: 'u-carla', nombre: 'Carla', apellido: 'Compras' }],
  };
  const listarTecnicosAsignables = vi
    .fn()
    .mockImplementation((_cliente: string, modulo: string | null) =>
      Promise.resolve(candidatos[modulo ?? ''] ?? []),
    );
  const resolverNombres = vi
    .fn()
    .mockResolvedValue(new Map([['u-baja', { nombre: 'Beto', apellido: 'Baja' }]]));
  const useCase = new ListarReglasAsignacionUseCase(
    { findAllActive: vi.fn().mockResolvedValue(tipos) },
    { listar: vi.fn().mockResolvedValue(reglas) },
    { listarTecnicosAsignables, resolverNombres },
  );
  return { useCase, listarTecnicosAsignables, resolverNombres };
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

  it('un responsable de otro módulo es ROTA (cambió el módulo del tipo)', async () => {
    const { useCase } = armar([tipo('t1', 'COMPRAS')], [regla('t1', 'u-tina')]);

    const { reglas } = await useCase.execute(CLIENTE);

    expect(reglas[0].estado).toBe('ROTA');
  });

  it('consulta candidatos una vez por módulo distinto y los devuelve agrupados', async () => {
    const { useCase, listarTecnicosAsignables } = armar(
      [tipo('t1', 'TICKETS'), tipo('t2', 'TICKETS'), tipo('t3', 'COMPRAS')],
      [],
    );

    const { candidatosPorModulo } = await useCase.execute(CLIENTE);

    expect(listarTecnicosAsignables).toHaveBeenCalledTimes(2);
    expect(listarTecnicosAsignables).toHaveBeenCalledWith(CLIENTE, 'TICKETS');
    expect(listarTecnicosAsignables).toHaveBeenCalledWith(CLIENTE, 'COMPRAS');
    expect(Object.keys(candidatosPorModulo).sort()).toEqual(['COMPRAS', 'TICKETS']);
    expect(candidatosPorModulo.TICKETS).toEqual([
      { id: 'u-tina', nombre: 'Tina', apellido: 'Tecnica' },
    ]);
  });
});

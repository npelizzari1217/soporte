/**
 * D1 [UNIT] — RED→GREEN: `ObtenerMetricasUseCase` — scope por rol (D2):
 * TECNICO ⇒ `asignadoId=actor.sub` en TODAS las métricas; ADMINISTRADOR y
 * COLABORADOR ⇒ tenant completo. Ciclo efectivo: explícito > activo >
 * ninguno (short-circuit, mismo criterio que `ListarTicketsUseCase`).
 *
 * Ref spec: sdd/premium/spec D1, D2. Ref design: ADR-P5. Tarea: D1.
 */
import { ObtenerMetricasUseCase } from './obtener-metricas.use-case';
import { CicloClienteEntity } from '../../../tickets/domain/entities/ciclo-cliente.entity';

describe('ObtenerMetricasUseCase', () => {
  function makeCollaborators(cicloActivo: CicloClienteEntity | null) {
    const dashboardRepo = {
      conteoPorEstadoAgrupado: vi.fn().mockResolvedValue({ abiertos: 3, cerrados: 5 }),
      tiempoPromedioResolucionHoras: vi.fn().mockResolvedValue(12.5),
      cargaPorAgente: vi.fn().mockResolvedValue([{ asignadoId: 'agente-1', abiertos: 2 }]),
      cumplimientoSla: vi.fn().mockResolvedValue({ cerradosConSla: 4, cerradosATiempo: 3 }),
      distribucionPorTipo: vi.fn().mockResolvedValue([{ tipoId: 'tipo-1', total: 8 }]),
      distribucionPorPrioridad: vi.fn().mockResolvedValue([{ prioridadId: 'prio-1', total: 8 }]),
    };
    const cicloClienteRepo = { findActive: vi.fn().mockResolvedValue(cicloActivo) };
    const useCase = new ObtenerMetricasUseCase(dashboardRepo as never, cicloClienteRepo as never);
    return { useCase, dashboardRepo, cicloClienteRepo };
  }

  const CICLO = CicloClienteEntity.create(
    {
      cicloVigenteId: 'ciclo-vigente-uuid',
      nombre: 'Ciclo 2026',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: true,
    },
    'ciclo-activo-uuid',
  );

  it('D2: actor TECNICO ⇒ fuerza asignadoId=actor.sub en TODAS las métricas', async () => {
    const c = makeCollaborators(CICLO);

    await c.useCase.execute({ actorId: 'tecnico-uuid', actorRol: 'TECNICO' });

    const filtroEsperado = expect.objectContaining({ asignadoId: 'tecnico-uuid' });
    expect(c.dashboardRepo.conteoPorEstadoAgrupado).toHaveBeenCalledWith(filtroEsperado);
    expect(c.dashboardRepo.tiempoPromedioResolucionHoras).toHaveBeenCalledWith(filtroEsperado);
    expect(c.dashboardRepo.cargaPorAgente).toHaveBeenCalledWith(filtroEsperado);
    expect(c.dashboardRepo.cumplimientoSla).toHaveBeenCalledWith(filtroEsperado);
    expect(c.dashboardRepo.distribucionPorTipo).toHaveBeenCalledWith(filtroEsperado);
    expect(c.dashboardRepo.distribucionPorPrioridad).toHaveBeenCalledWith(filtroEsperado);
  });

  it.each(['ADMINISTRADOR', 'COLABORADOR'])(
    'D2: actor %s ⇒ asignadoId queda undefined (ve todo el tenant)',
    async (rol) => {
      const c = makeCollaborators(CICLO);

      await c.useCase.execute({ actorId: 'staff-uuid', actorRol: rol });

      expect(c.dashboardRepo.conteoPorEstadoAgrupado).toHaveBeenCalledWith(
        expect.objectContaining({ asignadoId: undefined }),
      );
    },
  );

  it('sin cicloId explícito y CON ciclo activo → usa el ciclo activo como default', async () => {
    const c = makeCollaborators(CICLO);

    await c.useCase.execute({ actorId: 'admin-uuid', actorRol: 'ADMINISTRADOR' });

    expect(c.dashboardRepo.conteoPorEstadoAgrupado).toHaveBeenCalledWith(
      expect.objectContaining({ cicloId: 'ciclo-activo-uuid' }),
    );
  });

  it('cicloId explícito tiene prioridad sobre el activo', async () => {
    const c = makeCollaborators(CICLO);

    await c.useCase.execute({
      actorId: 'admin-uuid',
      actorRol: 'ADMINISTRADOR',
      cicloId: 'ciclo-historico-uuid',
    });

    expect(c.dashboardRepo.conteoPorEstadoAgrupado).toHaveBeenCalledWith(
      expect.objectContaining({ cicloId: 'ciclo-historico-uuid' }),
    );
    expect(c.cicloClienteRepo.findActive).not.toHaveBeenCalled();
  });

  it('sin cicloId explícito y SIN ciclo activo → métricas vacías, sin consultar el repo', async () => {
    const c = makeCollaborators(null);

    const result = await c.useCase.execute({ actorId: 'admin-uuid', actorRol: 'ADMINISTRADOR' });

    expect(result).toEqual({
      abiertos: 0,
      cerrados: 0,
      tiempoPromedioResolucionHoras: null,
      cargaPorAgente: [],
      cumplimientoSla: { cerradosConSla: 0, cerradosATiempo: 0, porcentaje: null },
      distribucionPorTipo: [],
      distribucionPorPrioridad: [],
    });
    expect(c.dashboardRepo.conteoPorEstadoAgrupado).not.toHaveBeenCalled();
  });

  it('arma el DTO de métricas con el % de cumplimiento SLA calculado', async () => {
    const c = makeCollaborators(CICLO);

    const result = await c.useCase.execute({ actorId: 'admin-uuid', actorRol: 'ADMINISTRADOR' });

    expect(result).toEqual({
      abiertos: 3,
      cerrados: 5,
      tiempoPromedioResolucionHoras: 12.5,
      cargaPorAgente: [{ asignadoId: 'agente-1', abiertos: 2 }],
      cumplimientoSla: { cerradosConSla: 4, cerradosATiempo: 3, porcentaje: 0.75 },
      distribucionPorTipo: [{ tipoId: 'tipo-1', total: 8 }],
      distribucionPorPrioridad: [{ prioridadId: 'prio-1', total: 8 }],
    });
  });

  it('cumplimientoSla con cerradosConSla=0 ⇒ porcentaje null (evita división por cero)', async () => {
    const c = makeCollaborators(CICLO);
    c.dashboardRepo.cumplimientoSla.mockResolvedValue({ cerradosConSla: 0, cerradosATiempo: 0 });

    const result = await c.useCase.execute({ actorId: 'admin-uuid', actorRol: 'ADMINISTRADOR' });

    expect(result.cumplimientoSla.porcentaje).toBeNull();
  });
});

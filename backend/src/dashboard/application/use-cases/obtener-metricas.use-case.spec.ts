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
      cumplimientoPrimeraRespuesta: vi.fn().mockResolvedValue({ conMeta: 4, aTiempo: 2 }),
      tiempoPromedioPrimeraRespuestaHoras: vi.fn().mockResolvedValue(1.25),
      distribucionPorTipo: vi.fn().mockResolvedValue([{ tipoId: 'tipo-1', total: 8 }]),
      distribucionPorPrioridad: vi.fn().mockResolvedValue([{ prioridadId: 'prio-1', total: 8 }]),
    };
    const cicloClienteRepo = { findActive: vi.fn().mockResolvedValue(cicloActivo) };
    // Repo CSAT (WU9.1, ADR-C5): solo se consulta cuando el actor tiene CSAT:LECTURA.
    const csatRepo = {
      resumenPorScope: vi.fn().mockResolvedValue({ promedio: 4.5, respuestas: 10 }),
    };
    const useCase = new ObtenerMetricasUseCase(
      dashboardRepo as never,
      cicloClienteRepo as never,
      csatRepo as never,
    );
    return { useCase, dashboardRepo, cicloClienteRepo, csatRepo };
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
    expect(c.dashboardRepo.cumplimientoPrimeraRespuesta).toHaveBeenCalledWith(filtroEsperado);
    expect(c.dashboardRepo.tiempoPromedioPrimeraRespuestaHoras).toHaveBeenCalledWith(
      filtroEsperado,
    );
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
      cumplimientoPrimeraRespuesta: { conMeta: 0, aTiempo: 0, porcentaje: null },
      tiempoPromedioPrimeraRespuestaHoras: null,
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
      cumplimientoPrimeraRespuesta: { conMeta: 4, aTiempo: 2, porcentaje: 0.5 },
      tiempoPromedioPrimeraRespuestaHoras: 1.25,
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

  it('primera respuesta sin tickets con meta ⇒ porcentaje null y tiempo medio null, no 0', async () => {
    const c = makeCollaborators(CICLO);
    c.dashboardRepo.cumplimientoPrimeraRespuesta.mockResolvedValue({ conMeta: 0, aTiempo: 0 });
    c.dashboardRepo.tiempoPromedioPrimeraRespuestaHoras.mockResolvedValue(null);

    const result = await c.useCase.execute({ actorId: 'admin-uuid', actorRol: 'ADMINISTRADOR' });

    expect(result.cumplimientoPrimeraRespuesta).toEqual({
      conMeta: 0,
      aTiempo: 0,
      porcentaje: null,
    });
    expect(result.tiempoPromedioPrimeraRespuestaHoras).toBeNull();
  });

  // WU9.1 (ADR-C5): el gateo de csatPromedio/csatRespuestas va DENTRO del
  // payload, no en el decorador del controller — el use case decide si los
  // incluye según `tieneCsatLectura`.
  describe('gateo de CSAT (ADR-C5)', () => {
    it('CON CSAT:LECTURA incluye csatPromedio/csatRespuestas con un valor real', async () => {
      const c = makeCollaborators(CICLO);

      const result = await c.useCase.execute({
        actorId: 'admin-uuid',
        actorRol: 'ADMINISTRADOR',
        tieneCsatLectura: true,
      });

      expect(result.csatPromedio).toBe(4.5);
      expect(result.csatRespuestas).toBe(10);
      expect(c.csatRepo.resumenPorScope).toHaveBeenCalledWith(
        expect.objectContaining({ cicloId: 'ciclo-activo-uuid' }),
      );
    });

    it('SIN CSAT:LECTURA omite csatPromedio/csatRespuestas del payload (no undefined: AUSENTES)', async () => {
      const c = makeCollaborators(CICLO);

      const result = await c.useCase.execute({
        actorId: 'admin-uuid',
        actorRol: 'ADMINISTRADOR',
        tieneCsatLectura: false,
      });

      expect('csatPromedio' in result).toBe(false);
      expect('csatRespuestas' in result).toBe(false);
      expect(c.csatRepo.resumenPorScope).not.toHaveBeenCalled();
    });

    /**
     * WU11.4 (verify #2507, WARNING-1): consultar `resumenPorScope` sin
     * `asignadoId` dejaba 25/25 en verde — los tres tests de este describe
     * usan `actorRol: 'ADMINISTRADOR'`, justo el rol donde `asignadoId`
     * queda `undefined`, así que el scope del TÉCNICO nunca se ejercita acá.
     */
    it('[CRITICAL] TECNICO con CSAT:LECTURA recibe el promedio ACOTADO a sus tickets (asignadoId), no el global', async () => {
      const c = makeCollaborators(CICLO);

      await c.useCase.execute({
        actorId: 'tecnico-uuid',
        actorRol: 'TECNICO',
        tieneCsatLectura: true,
      });

      expect(c.csatRepo.resumenPorScope).toHaveBeenCalledWith(
        expect.objectContaining({ asignadoId: 'tecnico-uuid' }),
      );
    });

    it('sin cicloId explícito y SIN ciclo activo, CON CSAT:LECTURA → csat también queda en su default vacío', async () => {
      const c = makeCollaborators(null);

      const result = await c.useCase.execute({
        actorId: 'admin-uuid',
        actorRol: 'ADMINISTRADOR',
        tieneCsatLectura: true,
      });

      expect(result.csatPromedio).toBeNull();
      expect(result.csatRespuestas).toBe(0);
      expect(c.csatRepo.resumenPorScope).not.toHaveBeenCalled();
    });
  });
});

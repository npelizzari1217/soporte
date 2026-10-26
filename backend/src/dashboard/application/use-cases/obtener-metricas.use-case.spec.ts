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
import type { IDashboardRepository } from '../../domain/ports/i-dashboard.repository';
import type { ICicloClienteRepository } from '../../../tickets/domain/ports/i-ciclo-cliente.repository';
import type { IEncuestaSatisfaccionRepository } from '../../../csat/domain/ports/i-encuesta-satisfaccion.repository';
import type { ITareaTicketRepository } from '../../../tickets/domain/ports/i-tarea-ticket.repository';
import type { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import type { ICumplimientoTecnicoRepository } from '../../../tiempo-tecnico/domain/ports/i-cumplimiento-tecnico.repository';
import {
  alcancePorTipo,
  alcanceSinRestriccion,
} from '../../../tickets/test-helpers/alcance-ticket';

/** ROOT y ADMINISTRADOR: sin restricción por tipo. Los tests de D2 no versan sobre el alcance. */
const SIN_RESTRICCION = alcanceSinRestriccion('actor-uuid');

describe('ObtenerMetricasUseCase', () => {
  function makeCollaborators(cicloActivo: CicloClienteEntity | null) {
    const dashboardRepo = {
      conteoPorEstadoAgrupado: vi
        .fn<IDashboardRepository['conteoPorEstadoAgrupado']>()
        .mockResolvedValue({ abiertos: 3, cerrados: 5 }),
      tiempoPromedioResolucionHoras: vi
        .fn<IDashboardRepository['tiempoPromedioResolucionHoras']>()
        .mockResolvedValue(12.5),
      cargaPorAgente: vi
        .fn<IDashboardRepository['cargaPorAgente']>()
        .mockResolvedValue([{ asignadoId: 'agente-1', abiertos: 2 }]),
      cumplimientoSla: vi
        .fn<IDashboardRepository['cumplimientoSla']>()
        .mockResolvedValue({ cerradosConSla: 4, cerradosATiempo: 3 }),
      cumplimientoPrimeraRespuesta: vi
        .fn<IDashboardRepository['cumplimientoPrimeraRespuesta']>()
        .mockResolvedValue({ conMeta: 4, aTiempo: 2 }),
      tiempoPromedioPrimeraRespuestaHoras: vi
        .fn<IDashboardRepository['tiempoPromedioPrimeraRespuestaHoras']>()
        .mockResolvedValue(1.25),
      distribucionPorTipo: vi
        .fn<IDashboardRepository['distribucionPorTipo']>()
        .mockResolvedValue([{ tipoId: 'tipo-1', total: 8 }]),
      distribucionPorPrioridad: vi
        .fn<IDashboardRepository['distribucionPorPrioridad']>()
        .mockResolvedValue([{ prioridadId: 'prio-1', total: 8 }]),
    };
    const cicloClienteRepo = {
      findActive: vi.fn<ICicloClienteRepository['findActive']>().mockResolvedValue(cicloActivo),
      findById: vi.fn<ICicloClienteRepository['findById']>().mockResolvedValue(null),
    };
    // Repo CSAT (WU9.1, ADR-C5): solo se consulta cuando el actor tiene CSAT:LECTURA.
    const csatRepo = {
      resumenPorScope: vi
        .fn<IEncuestaSatisfaccionRepository['resumenPorScope']>()
        .mockResolvedValue({ promedio: 4.5, respuestas: 10 }),
    };
    // odd/tareas-con-tecnico T4: tareas completadas por técnico, con nombres de master.
    const tareaRepo = {
      contarCompletadasPorTecnico: vi
        .fn<ITareaTicketRepository['contarCompletadasPorTecnico']>()
        .mockResolvedValue([]),
    };
    const usuarioMasterChecker = {
      resolverNombres: vi
        .fn<IUsuarioMasterChecker['resolverNombres']>()
        .mockResolvedValue(new Map()),
    };
    // odd/tasks/tiempo-tecnico.md T4: cumplimiento por técnico sobre los tramos.
    const cumplimientoRepo = {
      resumirPorTecnico: vi
        .fn<ICumplimientoTecnicoRepository['resumirPorTecnico']>()
        .mockResolvedValue([]),
    };
    const useCase = new ObtenerMetricasUseCase(
      dashboardRepo,
      cicloClienteRepo,
      csatRepo,
      tareaRepo,
      usuarioMasterChecker,
      cumplimientoRepo,
    );
    return {
      useCase,
      dashboardRepo,
      cicloClienteRepo,
      csatRepo,
      tareaRepo,
      usuarioMasterChecker,
      cumplimientoRepo,
    };
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

    await c.useCase.execute({
      actorId: 'tecnico-uuid',
      actorRol: 'TECNICO',
      alcance: SIN_RESTRICCION,
    });

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

      await c.useCase.execute({ actorId: 'staff-uuid', actorRol: rol, alcance: SIN_RESTRICCION });

      expect(c.dashboardRepo.conteoPorEstadoAgrupado).toHaveBeenCalledWith(
        expect.objectContaining({ asignadoId: undefined }),
      );
    },
  );

  describe('alcance por tipo (odd/permisos-por-tipo-ticket, D5 e)', () => {
    const ALCANCE = alcancePorTipo('tecnico-uuid', {
      'tipo-soporte': ['LECTURA', 'VER_TODOS'],
      'tipo-mantenimiento': ['LECTURA'],
      'tipo-electricidad': ['VER_TODOS', 'MODIFICACION'],
    });
    const FILTRO_ALCANCE = {
      actorId: 'tecnico-uuid',
      tiposVerTodos: ['tipo-soporte'],
      tiposPorFila: ['tipo-mantenimiento'],
    };

    it('todas las métricas por ticket, el CSAT, las tareas completadas y el cumplimiento por técnico agregan solo lo que el actor ve', async () => {
      const c = makeCollaborators(CICLO);

      await c.useCase.execute({
        actorId: 'tecnico-uuid',
        actorRol: 'COLABORADOR',
        alcance: ALCANCE,
        tieneCsatLectura: true,
      });

      const filtro = expect.objectContaining({ alcance: FILTRO_ALCANCE });
      expect(c.dashboardRepo.conteoPorEstadoAgrupado).toHaveBeenCalledWith(filtro);
      expect(c.dashboardRepo.tiempoPromedioResolucionHoras).toHaveBeenCalledWith(filtro);
      expect(c.dashboardRepo.cargaPorAgente).toHaveBeenCalledWith(filtro);
      expect(c.dashboardRepo.cumplimientoSla).toHaveBeenCalledWith(filtro);
      expect(c.dashboardRepo.cumplimientoPrimeraRespuesta).toHaveBeenCalledWith(filtro);
      expect(c.dashboardRepo.tiempoPromedioPrimeraRespuestaHoras).toHaveBeenCalledWith(filtro);
      expect(c.dashboardRepo.distribucionPorTipo).toHaveBeenCalledWith(filtro);
      expect(c.dashboardRepo.distribucionPorPrioridad).toHaveBeenCalledWith(filtro);
      expect(c.csatRepo.resumenPorScope).toHaveBeenCalledWith(filtro);
      expect(c.tareaRepo.contarCompletadasPorTecnico).toHaveBeenCalledWith(filtro);
      expect(c.cumplimientoRepo.resumirPorTecnico).toHaveBeenCalledWith(filtro);
    });

    it('TECNICO: el alcance se suma a asignadoId=actor (AND), no lo reemplaza', async () => {
      const c = makeCollaborators(CICLO);

      await c.useCase.execute({ actorId: 'tecnico-uuid', actorRol: 'TECNICO', alcance: ALCANCE });

      expect(c.dashboardRepo.conteoPorEstadoAgrupado).toHaveBeenCalledWith(
        expect.objectContaining({ asignadoId: 'tecnico-uuid', alcance: FILTRO_ALCANCE }),
      );
    });

    it('TECNICO: su fila de cumplimiento cuenta todos sus tramos, aunque el ticket hoy sea de otro (JD-A-001)', async () => {
      // Un admin puede reasignar un ticket ya RESUELTO: con el alcance por fila, el tramo que el
      // técnico cumplió dejaba de contarse en su fila y el admin sí se lo contaba.
      const c = makeCollaborators(CICLO);

      await c.useCase.execute({ actorId: 'tecnico-uuid', actorRol: 'TECNICO', alcance: ALCANCE });

      const filtroCumplimiento = c.cumplimientoRepo.resumirPorTecnico.mock.calls[0]?.[0];
      expect(filtroCumplimiento).toMatchObject({ tecnicoId: 'tecnico-uuid' });
      expect(filtroCumplimiento).not.toHaveProperty('alcance');
    });

    it('ROOT y ADMINISTRADOR (sin restricción): ninguna métrica lleva alcance', async () => {
      const c = makeCollaborators(CICLO);

      await c.useCase.execute({
        actorId: 'admin-uuid',
        actorRol: 'ADMINISTRADOR',
        alcance: SIN_RESTRICCION,
        tieneCsatLectura: true,
      });

      expect(c.dashboardRepo.conteoPorEstadoAgrupado.mock.calls[0]?.[0]).not.toHaveProperty(
        'alcance',
      );
      expect(c.csatRepo.resumenPorScope.mock.calls[0]?.[0]).not.toHaveProperty('alcance');
    });

    it('sin ningún tipo con LECTURA: métricas vacías sin consultar ningún repositorio', async () => {
      const c = makeCollaborators(CICLO);

      const result = await c.useCase.execute({
        actorId: 'tecnico-uuid',
        actorRol: 'COLABORADOR',
        alcance: alcancePorTipo('tecnico-uuid', { 'tipo-soporte': ['ALTAS', 'VER_TODOS'] }),
        tieneCsatLectura: true,
      });

      expect(result).toMatchObject({
        abiertos: 0,
        cerrados: 0,
        distribucionPorTipo: [],
        tareasCompletadasPorTecnico: [],
        cumplimientoTecnico: [],
        csatPromedio: null,
        csatRespuestas: 0,
      });
      expect(c.dashboardRepo.conteoPorEstadoAgrupado).not.toHaveBeenCalled();
      expect(c.csatRepo.resumenPorScope).not.toHaveBeenCalled();
      expect(c.tareaRepo.contarCompletadasPorTecnico).not.toHaveBeenCalled();
      expect(c.cumplimientoRepo.resumirPorTecnico).not.toHaveBeenCalled();
    });
  });

  it('sin cicloId explícito y CON ciclo activo → usa el ciclo activo como default', async () => {
    const c = makeCollaborators(CICLO);

    await c.useCase.execute({
      actorId: 'admin-uuid',
      actorRol: 'ADMINISTRADOR',
      alcance: SIN_RESTRICCION,
    });

    expect(c.dashboardRepo.conteoPorEstadoAgrupado).toHaveBeenCalledWith(
      expect.objectContaining({ cicloId: 'ciclo-activo-uuid' }),
    );
  });

  it('cicloId explícito tiene prioridad sobre el activo', async () => {
    const c = makeCollaborators(CICLO);

    await c.useCase.execute({
      actorId: 'admin-uuid',
      actorRol: 'ADMINISTRADOR',
      alcance: SIN_RESTRICCION,
      cicloId: 'ciclo-historico-uuid',
    });

    expect(c.dashboardRepo.conteoPorEstadoAgrupado).toHaveBeenCalledWith(
      expect.objectContaining({ cicloId: 'ciclo-historico-uuid' }),
    );
    expect(c.cicloClienteRepo.findActive).not.toHaveBeenCalled();
  });

  it('sin cicloId explícito y SIN ciclo activo → métricas vacías, sin consultar el repo', async () => {
    const c = makeCollaborators(null);

    const result = await c.useCase.execute({
      actorId: 'admin-uuid',
      actorRol: 'ADMINISTRADOR',
      alcance: SIN_RESTRICCION,
    });

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
      tareasCompletadasPorTecnico: [],
      cumplimientoTecnico: [],
    });
    expect(c.dashboardRepo.conteoPorEstadoAgrupado).not.toHaveBeenCalled();
    expect(c.tareaRepo.contarCompletadasPorTecnico).not.toHaveBeenCalled();
    expect(c.cumplimientoRepo.resumirPorTecnico).not.toHaveBeenCalled();
  });

  /** Métricas por ticket del fixture, tal como salían antes de la T4. CA6: no cambian. */
  const METRICAS_POR_TICKET = {
    abiertos: 3,
    cerrados: 5,
    tiempoPromedioResolucionHoras: 12.5,
    cargaPorAgente: [{ asignadoId: 'agente-1', abiertos: 2 }],
    cumplimientoSla: { cerradosConSla: 4, cerradosATiempo: 3, porcentaje: 0.75 },
    cumplimientoPrimeraRespuesta: { conMeta: 4, aTiempo: 2, porcentaje: 0.5 },
    tiempoPromedioPrimeraRespuestaHoras: 1.25,
    distribucionPorTipo: [{ tipoId: 'tipo-1', total: 8 }],
    distribucionPorPrioridad: [{ prioridadId: 'prio-1', total: 8 }],
  };

  it('arma el DTO de métricas con el % de cumplimiento SLA calculado', async () => {
    const c = makeCollaborators(CICLO);

    const result = await c.useCase.execute({
      actorId: 'admin-uuid',
      actorRol: 'ADMINISTRADOR',
      alcance: SIN_RESTRICCION,
    });

    expect(result).toEqual({
      ...METRICAS_POR_TICKET,
      tareasCompletadasPorTecnico: [],
      cumplimientoTecnico: [],
    });
  });

  it('cumplimientoSla con cerradosConSla=0 ⇒ porcentaje null (evita división por cero)', async () => {
    const c = makeCollaborators(CICLO);
    c.dashboardRepo.cumplimientoSla.mockResolvedValue({ cerradosConSla: 0, cerradosATiempo: 0 });

    const result = await c.useCase.execute({
      actorId: 'admin-uuid',
      actorRol: 'ADMINISTRADOR',
      alcance: SIN_RESTRICCION,
    });

    expect(result.cumplimientoSla.porcentaje).toBeNull();
  });

  it('primera respuesta sin tickets con meta ⇒ porcentaje null y tiempo medio null, no 0', async () => {
    const c = makeCollaborators(CICLO);
    c.dashboardRepo.cumplimientoPrimeraRespuesta.mockResolvedValue({ conMeta: 0, aTiempo: 0 });
    c.dashboardRepo.tiempoPromedioPrimeraRespuestaHoras.mockResolvedValue(null);

    const result = await c.useCase.execute({
      actorId: 'admin-uuid',
      actorRol: 'ADMINISTRADOR',
      alcance: SIN_RESTRICCION,
    });

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
        alcance: SIN_RESTRICCION,
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
        alcance: SIN_RESTRICCION,
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
        alcance: SIN_RESTRICCION,
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
        alcance: SIN_RESTRICCION,
        tieneCsatLectura: true,
      });

      expect(result.csatPromedio).toBeNull();
      expect(result.csatRespuestas).toBe(0);
      expect(c.csatRepo.resumenPorScope).not.toHaveBeenCalled();
    });
  });

  describe('tareas completadas por técnico (odd/tareas-con-tecnico T4, CA6)', () => {
    const ANA = 'tecnico-ana';
    const BETO = 'tecnico-beto';
    const GRUPOS = [
      { completadaPorId: ANA, completadas: 5 },
      { completadaPorId: BETO, completadas: 2 },
    ];

    function conTareas(grupos = GRUPOS) {
      const c = makeCollaborators(CICLO);
      c.tareaRepo.contarCompletadasPorTecnico.mockResolvedValue(grupos);
      c.usuarioMasterChecker.resolverNombres.mockResolvedValue(
        new Map([[ANA, { nombre: 'Ana', apellido: 'Paz' }]]),
      );
      return c;
    }

    it('el período son los días argentinos del ciclo, con fecha_fin incluida entera', async () => {
      const c = conTareas();

      await c.useCase.execute({
        actorId: 'admin-uuid',
        actorRol: 'ADMINISTRADOR',
        alcance: SIN_RESTRICCION,
      });

      // Medianoche argentina (UTC-3 fijo) = 03:00 UTC.
      expect(c.tareaRepo.contarCompletadasPorTecnico).toHaveBeenCalledWith({
        desde: new Date('2026-01-01T03:00:00.000Z'),
        hasta: new Date('2027-01-01T03:00:00.000Z'),
        completadaPorId: undefined,
      });
    });

    describe('el día se corta en la medianoche argentina, no en la UTC (T11, JD-W2)', () => {
      /**
       * Repositorio que cuenta de verdad: cada usuario completó una tarea en el instante dado, y
       * entra si cae en `[desde, hasta)`. El ciclo va del 2026-01-01 al 2026-12-31.
       */
      function conCompletadaEn(instante: string) {
        const c = makeCollaborators(CICLO);
        c.tareaRepo.contarCompletadasPorTecnico.mockImplementation(
          async (filtro: { desde: Date; hasta: Date }) => {
            const en = new Date(instante);
            return en >= filtro.desde && en < filtro.hasta
              ? [{ completadaPorId: ANA, completadas: 1 }]
              : [];
          },
        );
        return c;
      }

      it.each([
        ['23:30 ART del último día del ciclo cuenta', '2027-01-01T02:30:00.000Z', 1],
        ['00:30 ART del primer día del ciclo cuenta', '2026-01-01T03:30:00.000Z', 1],
        ['23:30 ART del día anterior al inicio no cuenta', '2026-01-01T02:30:00.000Z', 0],
        ['00:30 ART del día siguiente al fin no cuenta', '2027-01-01T03:30:00.000Z', 0],
      ])('%s', async (_caso, instante, esperadas) => {
        const c = conCompletadaEn(instante);

        const result = await c.useCase.execute({
          actorId: 'admin-uuid',
          actorRol: 'ADMINISTRADOR',
          alcance: SIN_RESTRICCION,
        });

        expect(result.tareasCompletadasPorTecnico).toHaveLength(esperadas);
      });
    });

    it.each(['ADMINISTRADOR', 'ROOT', 'COLABORADOR'])(
      '%s ve a todos los técnicos, en orden descendente y con su nombre',
      async (rol) => {
        const c = conTareas();

        const result = await c.useCase.execute({
          actorId: 'staff-uuid',
          actorRol: rol,
          alcance: SIN_RESTRICCION,
        });

        expect(c.tareaRepo.contarCompletadasPorTecnico).toHaveBeenCalledWith(
          expect.objectContaining({ completadaPorId: undefined }),
        );
        expect(c.usuarioMasterChecker.resolverNombres).toHaveBeenCalledWith([ANA, BETO]);
        // BETO no está en master: la fila queda, con el nombre en null.
        expect(result.tareasCompletadasPorTecnico).toEqual([
          { usuarioId: ANA, nombre: 'Ana', apellido: 'Paz', completadas: 5 },
          { usuarioId: BETO, nombre: null, apellido: null, completadas: 2 },
        ]);
      },
    );

    it('TECNICO solo pide su propia fila: completada_por_id = actorId', async () => {
      const c = conTareas([{ completadaPorId: BETO, completadas: 2 }]);

      const result = await c.useCase.execute({
        actorId: BETO,
        actorRol: 'TECNICO',
        alcance: SIN_RESTRICCION,
      });

      expect(c.tareaRepo.contarCompletadasPorTecnico).toHaveBeenCalledWith(
        expect.objectContaining({ completadaPorId: BETO }),
      );
      expect(result.tareasCompletadasPorTecnico).toEqual([
        { usuarioId: BETO, nombre: null, apellido: null, completadas: 2 },
      ]);
    });

    it('período sin tareas completadas ⇒ lista vacía, sin consultar master', async () => {
      const c = conTareas([]);

      const result = await c.useCase.execute({
        actorId: 'admin-uuid',
        actorRol: 'ADMINISTRADOR',
        alcance: SIN_RESTRICCION,
      });

      expect(result.tareasCompletadasPorTecnico).toEqual([]);
      expect(c.usuarioMasterChecker.resolverNombres).not.toHaveBeenCalled();
    });

    it('con ciclo explícito usa las fechas de ese ciclo, no las del activo', async () => {
      const c = conTareas();
      c.cicloClienteRepo.findById.mockResolvedValue(
        CicloClienteEntity.create(
          {
            cicloVigenteId: 'ciclo-vigente-uuid',
            nombre: 'Ciclo 2025',
            fechaInicio: new Date('2025-03-01'),
            fechaFin: new Date('2025-06-30'),
            activo: false,
          },
          'ciclo-historico-uuid',
        ),
      );

      await c.useCase.execute({
        actorId: 'admin-uuid',
        actorRol: 'ADMINISTRADOR',
        alcance: SIN_RESTRICCION,
        cicloId: 'ciclo-historico-uuid',
      });

      expect(c.cicloClienteRepo.findById).toHaveBeenCalledWith('ciclo-historico-uuid');
      expect(c.cicloClienteRepo.findActive).not.toHaveBeenCalled();
      expect(c.tareaRepo.contarCompletadasPorTecnico).toHaveBeenCalledWith(
        expect.objectContaining({
          desde: new Date('2025-03-01T03:00:00.000Z'),
          hasta: new Date('2025-07-01T03:00:00.000Z'),
        }),
      );
    });

    it('ciclo explícito inexistente ⇒ lista vacía, y las métricas por ticket se consultan igual', async () => {
      const c = conTareas();

      const result = await c.useCase.execute({
        actorId: 'admin-uuid',
        actorRol: 'ADMINISTRADOR',
        alcance: SIN_RESTRICCION,
        cicloId: 'ciclo-inexistente',
      });

      expect(result.tareasCompletadasPorTecnico).toEqual([]);
      expect(c.tareaRepo.contarCompletadasPorTecnico).not.toHaveBeenCalled();
      expect(c.dashboardRepo.conteoPorEstadoAgrupado).toHaveBeenCalled();
    });

    it('CA6: con tareas, las métricas por ticket del fixture quedan idénticas', async () => {
      const c = conTareas();

      const { tareasCompletadasPorTecnico, cumplimientoTecnico, ...porTicket } =
        await c.useCase.execute({
          actorId: 'admin-uuid',
          actorRol: 'ADMINISTRADOR',
          alcance: SIN_RESTRICCION,
        });

      expect(tareasCompletadasPorTecnico).toHaveLength(2);
      expect(cumplimientoTecnico).toEqual([]);
      expect(porTicket).toStrictEqual(METRICAS_POR_TICKET);
    });
  });

  describe('cumplimiento por técnico (odd/tasks/tiempo-tecnico.md T4, S8)', () => {
    const ANA = 'tecnico-ana';
    const BETO = 'tecnico-beto';

    function conCumplimiento() {
      const c = makeCollaborators(CICLO);
      c.cumplimientoRepo.resumirPorTecnico.mockResolvedValue([
        { tecnicoId: ANA, total: 4, cumplidos: 3, promedioHabilS: 7200 },
        { tecnicoId: BETO, total: 2, cumplidos: 0, promedioHabilS: 30_000 },
      ]);
      c.usuarioMasterChecker.resolverNombres.mockResolvedValue(
        new Map([[ANA, { nombre: 'Ana', apellido: 'Paz' }]]),
      );
      return c;
    }

    it('el período son los días argentinos del ciclo sobre fin_at, con fecha_fin incluida entera', async () => {
      const c = conCumplimiento();

      await c.useCase.execute({
        actorId: 'admin-uuid',
        actorRol: 'ADMINISTRADOR',
        alcance: SIN_RESTRICCION,
      });

      expect(c.cumplimientoRepo.resumirPorTecnico).toHaveBeenCalledWith({
        desde: new Date('2026-01-01T03:00:00.000Z'),
        hasta: new Date('2027-01-01T03:00:00.000Z'),
        tecnicoId: undefined,
      });
    });

    it('calcula el % por técnico, conserva el orden del repositorio y pone el nombre de master', async () => {
      const c = conCumplimiento();

      const result = await c.useCase.execute({
        actorId: 'admin-uuid',
        actorRol: 'ADMINISTRADOR',
        alcance: SIN_RESTRICCION,
      });

      // BETO no está en master: la fila queda, con el nombre en null. 0 cumplidos es 0 %, no null.
      expect(result.cumplimientoTecnico).toEqual([
        {
          usuarioId: ANA,
          nombre: 'Ana',
          apellido: 'Paz',
          total: 4,
          cumplidos: 3,
          porcentaje: 0.75,
          promedioHabilS: 7200,
        },
        {
          usuarioId: BETO,
          nombre: null,
          apellido: null,
          total: 2,
          cumplidos: 0,
          porcentaje: 0,
          promedioHabilS: 30_000,
        },
      ]);
    });

    it('TECNICO solo pide su propia fila: tecnico_id = actorId', async () => {
      const c = conCumplimiento();

      await c.useCase.execute({ actorId: BETO, actorRol: 'TECNICO', alcance: SIN_RESTRICCION });

      expect(c.cumplimientoRepo.resumirPorTecnico).toHaveBeenCalledWith(
        expect.objectContaining({ tecnicoId: BETO }),
      );
    });

    it('sin tramos evaluados ⇒ lista vacía, sin consultar master', async () => {
      const c = makeCollaborators(CICLO);

      const result = await c.useCase.execute({
        actorId: 'admin-uuid',
        actorRol: 'ADMINISTRADOR',
        alcance: SIN_RESTRICCION,
      });

      expect(result.cumplimientoTecnico).toEqual([]);
      expect(c.usuarioMasterChecker.resolverNombres).not.toHaveBeenCalled();
    });

    it('ciclo explícito inexistente ⇒ lista vacía, sin consultar los tramos', async () => {
      const c = conCumplimiento();

      const result = await c.useCase.execute({
        actorId: 'admin-uuid',
        actorRol: 'ADMINISTRADOR',
        alcance: SIN_RESTRICCION,
        cicloId: 'ciclo-inexistente',
      });

      expect(result.cumplimientoTecnico).toEqual([]);
      expect(c.cumplimientoRepo.resumirPorTecnico).not.toHaveBeenCalled();
    });
  });
});

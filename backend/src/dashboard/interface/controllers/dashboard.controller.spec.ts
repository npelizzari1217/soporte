/**
 * D5 [CONTROLLER][RED→GREEN] — `DashboardController` (D1/D3).
 *
 * Unit test: instancia el controller directamente con el use case
 * mockeado, mismo patrón que `SlaConfigController`/`KbController` —
 * verifica gateo por `DASHBOARD:LECTURA` (D3, excluye USUARIO, WU-7.3) vía
 * metadata `@RequiereAcciones`, y que el scope self/global (D2) se resuelve
 * pasando `actorRol` del JWT tal cual al use case (la divergencia de rol
 * vive en `ObtenerMetricasUseCase`, no en el controller).
 *
 * Ref spec: sdd/premium/spec D1, D2, D3. Tarea: D5/D6.
 */
import 'reflect-metadata';
import { DashboardController } from './dashboard.controller';
import { ACCIONES_KEY } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import {
  MetricasResult,
  ObtenerMetricasUseCase,
} from '../../application/use-cases/obtener-metricas.use-case';
import { CargadorAlcanceTicket } from '../../../tickets/interface/alcance-ticket';
import { PermisosTipoTicketEnMemoria } from '../../../tickets/test-helpers/permisos-tipo-ticket-en-memoria';

describe('DashboardController (D5)', () => {
  function buildController() {
    const execute = vi.fn<ObtenerMetricasUseCase['execute']>();
    const caso: ObtenerMetricasUseCase = Object.create(ObtenerMetricasUseCase.prototype, {
      execute: { value: execute },
    });
    // `tecnico-uuid` ve el tipo `tipo-1` en la tabla del tenant (odd/permisos-por-tipo-ticket, D5 a).
    const alcances = new CargadorAlcanceTicket(
      new PermisosTipoTicketEnMemoria(
        [],
        [{ usuarioId: 'tecnico-uuid', tipoId: 'tipo-1', accion: 'LECTURA' }],
      ),
    );
    const controller = new DashboardController(caso, alcances);
    return { controller, obtenerMetricasUseCase: { execute } };
  }

  function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
    return payloadDeTest({
      sub: 'actor-uuid',
      cliente_id: 'cliente-uuid',
      rol: 'ADMINISTRADOR',
      permisos: ['DASHBOARD:LECTURA'],
      cliente_nombre: 'Cliente Test',
      ...overrides,
    });
  }

  const METRICAS: MetricasResult = {
    abiertos: 3,
    cerrados: 5,
    tiempoPromedioResolucionHoras: 12.5,
    cargaPorAgente: [{ asignadoId: 'agente-1', abiertos: 2 }],
    cumplimientoSla: { cerradosConSla: 4, cerradosATiempo: 3, porcentaje: 0.75 },
    cumplimientoPrimeraRespuesta: { conMeta: 4, aTiempo: 2, porcentaje: 0.5 },
    tiempoPromedioPrimeraRespuestaHoras: 1.25,
    distribucionPorTipo: [{ tipoId: 'tipo-1', total: 8 }],
    distribucionPorPrioridad: [{ prioridadId: 'prio-1', total: 8 }],
    tareasCompletadasPorTecnico: [
      { usuarioId: 'agente-1', nombre: 'Ana', apellido: 'Paz', completadas: 4 },
    ],
  };

  it('[CRITICAL] declara @RequiereAcciones("DASHBOARD:LECTURA") a nivel de controller (D3, excluye USUARIO)', () => {
    const permisos = Reflect.getMetadata(ACCIONES_KEY, DashboardController);
    expect(permisos).toEqual(['DASHBOARD:LECTURA']);
  });

  describe('GET /dashboard/metricas', () => {
    it('llama al use case con actorId/actorRol del JWT y el cicloId de la query', async () => {
      const { controller, obtenerMetricasUseCase } = buildController();
      obtenerMetricasUseCase.execute.mockResolvedValue(METRICAS);

      await controller.obtenerMetricas(makeUser({ sub: 'admin-uuid', rol: 'ADMINISTRADOR' }), {
        ciclo: 'ciclo-uuid',
      });

      expect(obtenerMetricasUseCase.execute).toHaveBeenCalledWith({
        actorId: 'admin-uuid',
        actorRol: 'ADMINISTRADOR',
        cicloId: 'ciclo-uuid',
        // ADMINISTRADOR bypassea CUALQUIER código válido del catálogo (puedeEjecutar).
        tieneCsatLectura: true,
        // ADMINISTRADOR: sin restricción por tipo.
        alcance: { actorId: 'admin-uuid', permisosPorTipo: null },
      });
    });

    it('D2: pasa el rol TECNICO tal cual — la divergencia de scope vive en el use case', async () => {
      const { controller, obtenerMetricasUseCase } = buildController();
      obtenerMetricasUseCase.execute.mockResolvedValue(METRICAS);

      await controller.obtenerMetricas(makeUser({ sub: 'tecnico-uuid', rol: 'TECNICO' }), {});

      expect(obtenerMetricasUseCase.execute).toHaveBeenCalledWith({
        actorId: 'tecnico-uuid',
        actorRol: 'TECNICO',
        cicloId: undefined,
        // TECNICO sin la celda 'CSAT:LECTURA' en `permisos` (default de makeUser).
        tieneCsatLectura: false,
        // Sus permisos por tipo, de la tabla del tenant: las métricas agregan solo lo que ve (D5 e).
        alcance: {
          actorId: 'tecnico-uuid',
          permisosPorTipo: new Map([['tipo-1', new Set(['LECTURA'])]]),
        },
      });
    });

    it('WU9.1 (ADR-C5): con CSAT:LECTURA en permisos, pasa tieneCsatLectura=true', async () => {
      const { controller, obtenerMetricasUseCase } = buildController();
      obtenerMetricasUseCase.execute.mockResolvedValue(METRICAS);

      await controller.obtenerMetricas(
        makeUser({ sub: 'tecnico-uuid', rol: 'TECNICO', permisos: ['CSAT:LECTURA'] }),
        {},
      );

      expect(obtenerMetricasUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ tieneCsatLectura: true }),
      );
    });

    it('retorna el DTO de métricas mapeado desde el use case', async () => {
      const { controller, obtenerMetricasUseCase } = buildController();
      obtenerMetricasUseCase.execute.mockResolvedValue(METRICAS);

      const result = await controller.obtenerMetricas(makeUser(), {});

      expect(result).toEqual(METRICAS);
    });
  });
});

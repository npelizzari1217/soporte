/**
 * D5 [CONTROLLER][RED→GREEN] — `DashboardController` (D1/D3).
 *
 * Unit test: instancia el controller directamente con el use case
 * mockeado, mismo patrón que `SlaConfigController`/`KbController` —
 * verifica gateo por `ticket:ver_todos` (D3, excluye USUARIO) vía metadata
 * `@RequirePermissions`, y que el scope self/global (D2) se resuelve
 * pasando `actorRol` del JWT tal cual al use case (la divergencia de rol
 * vive en `ObtenerMetricasUseCase`, no en el controller).
 *
 * Ref spec: sdd/premium/spec D1, D2, D3. Tarea: D5/D6.
 */
import 'reflect-metadata';
import { DashboardController } from './dashboard.controller';
import { PERMISSIONS_KEY } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { MetricasResult } from '../../application/use-cases/obtener-metricas.use-case';

describe('DashboardController (D5)', () => {
  function buildController() {
    const obtenerMetricasUseCase = { execute: vi.fn() };
    const controller = new DashboardController(obtenerMetricasUseCase as never);
    return { controller, obtenerMetricasUseCase };
  }

  function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
    return {
      sub: 'actor-uuid',
      cliente_id: 'cliente-uuid',
      rol: 'ADMINISTRADOR',
      permisos: ['ticket:ver_todos'],
      is_global_admin: false,
      cliente_nombre: 'Cliente Test',
      membresias: [],
      ...overrides,
    } as JwtPayload;
  }

  const METRICAS: MetricasResult = {
    abiertos: 3,
    cerrados: 5,
    tiempoPromedioResolucionHoras: 12.5,
    cargaPorAgente: [{ asignadoId: 'agente-1', abiertos: 2 }],
    cumplimientoSla: { cerradosConSla: 4, cerradosATiempo: 3, porcentaje: 0.75 },
    distribucionPorTipo: [{ tipoId: 'tipo-1', total: 8 }],
    distribucionPorPrioridad: [{ prioridadId: 'prio-1', total: 8 }],
  };

  it('[CRITICAL] declara @RequirePermissions("ticket:ver_todos") a nivel de controller (D3, excluye USUARIO)', () => {
    const permisos = Reflect.getMetadata(PERMISSIONS_KEY, DashboardController);
    expect(permisos).toEqual(['ticket:ver_todos']);
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
      });
    });

    it('retorna el DTO de métricas mapeado desde el use case', async () => {
      const { controller, obtenerMetricasUseCase } = buildController();
      obtenerMetricasUseCase.execute.mockResolvedValue(METRICAS);

      const result = await controller.obtenerMetricas(makeUser(), {});

      expect(result).toEqual(METRICAS);
    });
  });
});

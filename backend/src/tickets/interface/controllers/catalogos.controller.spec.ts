/**
 * catalogos.controller.spec.ts — TDD RED→GREEN (sdd/beta-frontend, GET
 * catálogos G1). Unit test: instancia el controller directamente con los use
 * cases mockeados (mismo patrón que `clientes.controller.spec.ts`/
 * `ciclos.controller.spec.ts`) — NO cubre guards reales (JwtAuthGuard/
 * TenantGuard, ya testeados aparte).
 */
import { CatalogosController } from './catalogos.controller';
import { Result } from '../../../shared/domain/result';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { TipoOperacionEntity } from '../../domain/entities/tipo-operacion.entity';

function buildController() {
  const crearTipoTicketUseCase = { execute: vi.fn() };
  const editarTipoTicketUseCase = { execute: vi.fn() };
  const cambiarEstadoActivoTipoTicketUseCase = { execute: vi.fn() };
  const crearPrioridadUseCase = { execute: vi.fn() };
  const editarPrioridadUseCase = { execute: vi.fn() };
  const cambiarEstadoActivoPrioridadUseCase = { execute: vi.fn() };
  const listarTiposTicketUseCase = { execute: vi.fn() };
  const listarPrioridadesUseCase = { execute: vi.fn() };
  const listarEstadosUseCase = { execute: vi.fn() };
  const listarTiposOperacionUseCase = { execute: vi.fn() };

  const controller = new CatalogosController(
    crearTipoTicketUseCase as any,
    editarTipoTicketUseCase as any,
    cambiarEstadoActivoTipoTicketUseCase as any,
    crearPrioridadUseCase as any,
    editarPrioridadUseCase as any,
    cambiarEstadoActivoPrioridadUseCase as any,
    listarTiposTicketUseCase as any,
    listarPrioridadesUseCase as any,
    listarEstadosUseCase as any,
    listarTiposOperacionUseCase as any,
  );

  return {
    controller,
    listarTiposTicketUseCase,
    listarPrioridadesUseCase,
    listarEstadosUseCase,
    listarTiposOperacionUseCase,
  };
}

describe('CatalogosController — GET (sdd/beta-frontend G1)', () => {
  describe('GET /catalogos/tipos-ticket', () => {
    it('retorna la lista activa mapeada a DTO', async () => {
      const { controller, listarTiposTicketUseCase } = buildController();
      const tipo = TipoTicketEntity.reconstitute(
        { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
        'tipo-1',
        new Date(),
        new Date(),
        null,
      );
      listarTiposTicketUseCase.execute.mockResolvedValue(Result.ok([tipo]));

      const result = await controller.listarTiposTicket();

      expect(result).toEqual([
        expect.objectContaining({ id: 'tipo-1', codigo: 'SOPORTE', activo: true }),
      ]);
    });
  });

  describe('GET /catalogos/prioridades', () => {
    it('retorna la lista activa mapeada a DTO', async () => {
      const { controller, listarPrioridadesUseCase } = buildController();
      const prioridad = PrioridadEntity.reconstitute(
        { codigo: 'ALTA', nombre: 'Alta', color: '#f00', orden: 1, activo: true },
        'prioridad-1',
        new Date(),
        new Date(),
        null,
      );
      listarPrioridadesUseCase.execute.mockResolvedValue(Result.ok([prioridad]));

      const result = await controller.listarPrioridades();

      expect(result).toEqual([
        expect.objectContaining({ id: 'prioridad-1', codigo: 'ALTA', orden: 1 }),
      ]);
    });
  });

  describe('GET /catalogos/estados', () => {
    it('retorna la lista activa mapeada a DTO', async () => {
      const { controller, listarEstadosUseCase } = buildController();
      const estado = EstadoEntity.reconstitute(
        { codigo: 'NUEVO', nombre: 'Nuevo', color: '#0f0', orden: 1, activo: true },
        'estado-1',
        new Date(),
        new Date(),
        null,
      );
      listarEstadosUseCase.execute.mockResolvedValue(Result.ok([estado]));

      const result = await controller.listarEstados();

      expect(result).toEqual([expect.objectContaining({ id: 'estado-1', codigo: 'NUEVO' })]);
    });
  });

  describe('GET /catalogos/tipo-operacion', () => {
    it('retorna la lista activa mapeada a DTO', async () => {
      const { controller, listarTiposOperacionUseCase } = buildController();
      const tipo = TipoOperacionEntity.reconstitute(
        { codigo: 'COMENTARIO', nombre: 'Comentario', activo: true },
        'tipo-op-1',
        new Date(),
        new Date(),
        null,
      );
      listarTiposOperacionUseCase.execute.mockResolvedValue(Result.ok([tipo]));

      const result = await controller.listarTiposOperacion();

      expect(result).toEqual([expect.objectContaining({ id: 'tipo-op-1', codigo: 'COMENTARIO' })]);
    });
  });
});

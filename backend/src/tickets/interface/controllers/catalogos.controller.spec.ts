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
import type { Mock } from 'vitest';
import { CrearTipoTicketUseCase } from '../../application/use-cases/crear-tipo-ticket.use-case';
import { EditarTipoTicketUseCase } from '../../application/use-cases/editar-tipo-ticket.use-case';
import { CambiarEstadoActivoTipoTicketUseCase } from '../../application/use-cases/cambiar-estado-activo-tipo-ticket.use-case';
import { CrearPrioridadUseCase } from '../../application/use-cases/crear-prioridad.use-case';
import { EditarPrioridadUseCase } from '../../application/use-cases/editar-prioridad.use-case';
import { CambiarEstadoActivoPrioridadUseCase } from '../../application/use-cases/cambiar-estado-activo-prioridad.use-case';
import { ListarTiposTicketUseCase } from '../../application/use-cases/listar-tipos-ticket.use-case';
import { ListarPrioridadesUseCase } from '../../application/use-cases/listar-prioridades.use-case';
import { ListarEstadosUseCase } from '../../application/use-cases/listar-estados.use-case';
import { ListarTiposOperacionUseCase } from '../../application/use-cases/listar-tipos-operacion.use-case';

/**
 * Caso de uso doble: hereda el prototipo de la clase real (así encaja en el constructor del
 * controller) y reemplaza `execute` por un mock tipado con su firma.
 */
function casoDeUsoDoble<T extends { execute: (...args: never[]) => unknown }>(Clase: {
  prototype: T;
}): T & { execute: Mock<T['execute']> } {
  return Object.create(Clase.prototype, { execute: { value: vi.fn<T['execute']>() } });
}

function buildController() {
  const crearTipoTicketUseCase = casoDeUsoDoble(CrearTipoTicketUseCase);
  const editarTipoTicketUseCase = casoDeUsoDoble(EditarTipoTicketUseCase);
  const cambiarEstadoActivoTipoTicketUseCase = casoDeUsoDoble(CambiarEstadoActivoTipoTicketUseCase);
  const crearPrioridadUseCase = casoDeUsoDoble(CrearPrioridadUseCase);
  const editarPrioridadUseCase = casoDeUsoDoble(EditarPrioridadUseCase);
  const cambiarEstadoActivoPrioridadUseCase = casoDeUsoDoble(CambiarEstadoActivoPrioridadUseCase);
  const listarTiposTicketUseCase = casoDeUsoDoble(ListarTiposTicketUseCase);
  const listarPrioridadesUseCase = casoDeUsoDoble(ListarPrioridadesUseCase);
  const listarEstadosUseCase = casoDeUsoDoble(ListarEstadosUseCase);
  const listarTiposOperacionUseCase = casoDeUsoDoble(ListarTiposOperacionUseCase);

  const controller = new CatalogosController(
    crearTipoTicketUseCase,
    editarTipoTicketUseCase,
    cambiarEstadoActivoTipoTicketUseCase,
    crearPrioridadUseCase,
    editarPrioridadUseCase,
    cambiarEstadoActivoPrioridadUseCase,
    listarTiposTicketUseCase,
    listarPrioridadesUseCase,
    listarEstadosUseCase,
    listarTiposOperacionUseCase,
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

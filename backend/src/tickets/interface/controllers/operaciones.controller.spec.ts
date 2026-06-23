/**
 * 3.E.1 TEST — Unit tests para OperacionesController.
 *
 * Verifica que el controlador:
 * - Delega a ListarOperacionesUseCase con el ticketId correcto.
 * - Retorna el timeline serializado como array.
 * - Aplica la cadena de guards JWT → Tenant.
 *
 * Los use cases son mockeados.
 *
 * Tarea: 3.E.1
 */

import { OperacionesController } from './operaciones.controller';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOperacion(
  overrides: Partial<{
    ticketId: string;
    tipoOperacionId: string;
    descripcion: string | null;
    estadoAnteriorId: string | null;
    estadoNuevoId: string | null;
    autorId: string;
    metadata: Record<string, unknown> | null;
  }> = {},
): OperacionTicketEntity {
  return OperacionTicketEntity.create({
    ticketId: 'ticket-001',
    tipoOperacionId: 'tipo-op-001',
    descripcion: null,
    estadoAnteriorId: null,
    estadoNuevoId: 'estado-abierto',
    autorId: 'user-001',
    metadata: null,
    ...overrides,
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('OperacionesController', () => {
  let controller: OperacionesController;
  let listarOperacionesUseCase: { execute: jest.Mock };

  beforeEach(() => {
    listarOperacionesUseCase = { execute: jest.fn() };
    controller = new OperacionesController(listarOperacionesUseCase as any);
  });

  // ─── GET /tickets/:id/operaciones ──────────────────────────────────────────

  describe('GET /tickets/:id/operaciones (obtenerTimeline)', () => {
    it('retorna 200 con lista de operaciones del ticket', async () => {
      const op1 = makeOperacion({ tipoOperacionId: 'cambio-estado' });
      const op2 = makeOperacion({ tipoOperacionId: 'asignacion' });
      listarOperacionesUseCase.execute.mockResolvedValue([op1, op2]);

      const result = await controller.obtenerTimeline('ticket-001');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: op1.id,
        ticketId: 'ticket-001',
        tipoOperacionId: 'cambio-estado',
        autorId: 'user-001',
      });
      expect(listarOperacionesUseCase.execute).toHaveBeenCalledWith('ticket-001');
    });

    it('retorna lista vacía cuando el ticket no tiene operaciones', async () => {
      listarOperacionesUseCase.execute.mockResolvedValue([]);

      const result = await controller.obtenerTimeline('ticket-sin-ops');

      expect(result).toEqual([]);
    });

    it('serializa metadata como objeto plano', async () => {
      const op = makeOperacion({ metadata: { porcentaje: 75 } });
      listarOperacionesUseCase.execute.mockResolvedValue([op]);

      const result = await controller.obtenerTimeline('ticket-001');

      expect(result[0].metadata).toEqual({ porcentaje: 75 });
    });
  });

  // ─── Guard chain (via Reflect metadata) ────────────────────────────────────

  describe('Guard chain', () => {
    it('aplica JwtAuthGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', OperacionesController) ?? [];
      expect(guards).toContain(JwtAuthGuard);
    });

    it('aplica TenantGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', OperacionesController) ?? [];
      expect(guards).toContain(TenantGuard);
    });
  });
});

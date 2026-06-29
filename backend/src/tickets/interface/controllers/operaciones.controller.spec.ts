/**
 * 3.E.1 TEST — Unit tests para OperacionesController.
 *
 * Verifica que el controlador:
 * - Delega a ListarOperacionesUseCase con el ticketId correcto.
 * - Retorna el timeline serializado como array cuando el ticket existe.
 * - Retorna 404 cuando el ticket no existe (CRITICAL-2 fix: use case ahora retorna Result).
 * - Aplica la cadena de guards JWT → Tenant.
 *
 * Los use cases son mockeados.
 *
 * Tarea: 3.E.1
 * Fix: CRITICAL-2 — GET /tickets/:id/operaciones 404 en ticket inexistente
 */

import { NotFoundException } from '@nestjs/common';
import { OperacionesController } from './operaciones.controller';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { Result } from '../../../shared/domain/result';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';

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
  let listarOperacionesUseCase: { execute: vi.Mock };

  beforeEach(() => {
    listarOperacionesUseCase = { execute: vi.fn() };
    controller = new OperacionesController(listarOperacionesUseCase as any);
  });

  // ─── GET /tickets/:id/operaciones ──────────────────────────────────────────

  describe('GET /tickets/:id/operaciones (obtenerTimeline)', () => {
    it('retorna 200 con lista de operaciones del ticket', async () => {
      const op1 = makeOperacion({ tipoOperacionId: 'cambio-estado' });
      const op2 = makeOperacion({ tipoOperacionId: 'asignacion' });
      listarOperacionesUseCase.execute.mockResolvedValue(Result.ok([op1, op2]));

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

    it('retorna lista vacía cuando el ticket existe sin operaciones', async () => {
      listarOperacionesUseCase.execute.mockResolvedValue(Result.ok([]));

      const result = await controller.obtenerTimeline('ticket-sin-ops');

      expect(result).toEqual([]);
    });

    it('serializa metadata como objeto plano', async () => {
      const op = makeOperacion({ metadata: { porcentaje: 75 } });
      listarOperacionesUseCase.execute.mockResolvedValue(Result.ok([op]));

      const result = await controller.obtenerTimeline('ticket-001');

      expect(result[0].metadata).toEqual({ porcentaje: 75 });
    });

    it('lanza NotFoundException cuando el ticket no existe', async () => {
      listarOperacionesUseCase.execute.mockResolvedValue(
        Result.fail(new TicketNoEncontradoError('ticket-inexistente')),
      );

      await expect(controller.obtenerTimeline('ticket-inexistente')).rejects.toThrow(
        NotFoundException,
      );
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

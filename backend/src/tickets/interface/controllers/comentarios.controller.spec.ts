/**
 * T4B.1–T4B.5 TEST — Unit tests para ComentariosController.
 *
 * Verifica que el controlador:
 * - T4B.1: Delega a CrearComentarioUseCase con ticketId=params.id, autorId del JWT, texto del body.
 * - T4B.2: @RequirePermissions('ticket:comentar') configurado en el handler.
 * - T4B.3: ComentarioNoPermitidoError → HTTP 422.
 * - T4B.4: TicketNoEncontradoError → HTTP 404.
 * - T4B.5: contenido vacío o solo espacios → HTTP 422 antes de invocar el use case.
 * - Guard chain: JwtAuthGuard + RolesGuard + PermissionsGuard + TenantGuard al nivel de clase.
 *
 * Change: tickets-rbac-4-roles / PR4b
 * Tasks: T4B.1–T4B.5
 */

import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ComentariosController } from './comentarios.controller';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { Result } from '../../../shared/domain/result';
import {
  ComentarioNoPermitidoError,
  TicketNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { PERMISSIONS_KEY } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { CrearComentarioRequestDto } from '../dtos/tickets.dto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-001',
    cliente_id: 'cli-abc',
    email: 'usuario@example.com',
    roles: ['USUARIO'],
    permisos: ['ticket:crear', 'ticket:comentar'],
    cliente_nombre: 'Test Corp',
    is_global_admin: false,
    ...overrides,
  };
}

function makeOperacion(): OperacionTicketEntity {
  return OperacionTicketEntity.create({
    ticketId: 'ticket-001',
    tipoOperacionId: 'tipo-comentario',
    descripcion: 'Texto del comentario',
    estadoAnteriorId: null,
    estadoNuevoId: null,
    autorId: 'user-001',
    metadata: null,
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ComentariosController', () => {
  let controller: ComentariosController;
  let crearComentarioUseCase: { execute: ReturnType<typeof vi.fn> };
  let user: JwtPayload;

  beforeEach(() => {
    crearComentarioUseCase = { execute: vi.fn() };
    user = makeUser();
    controller = new ComentariosController(crearComentarioUseCase as any);
  });

  // ─── POST /tickets/:id/comentarios ────────────────────────────────────────

  describe('POST /tickets/:id/comentarios (crearComentario)', () => {
    // T4B.1 — happy path: 201 + delega al use case
    it('retorna 201 con representación del comentario creado y delega al use case', async () => {
      const operacion = makeOperacion();
      crearComentarioUseCase.execute.mockResolvedValue(Result.ok(operacion));

      const dto: CrearComentarioRequestDto = { contenido: 'Texto del comentario' };
      const result = await controller.crearComentario('ticket-001', dto, user);

      expect(result).toMatchObject({
        id: operacion.id,
        ticketId: 'ticket-001',
        autorId: 'user-001',
        estadoAnteriorId: null,
        estadoNuevoId: null,
      });
      expect(crearComentarioUseCase.execute).toHaveBeenCalledWith({
        ticketId: 'ticket-001',
        texto: 'Texto del comentario',
        autorId: 'user-001',
      });
    });

    it('extrae ticketId del parámetro de ruta y autorId del JWT', async () => {
      const operacion = makeOperacion();
      crearComentarioUseCase.execute.mockResolvedValue(Result.ok(operacion));
      const jwtUser = makeUser({ sub: 'otro-user-id' });

      await controller.crearComentario('otro-ticket', { contenido: 'hola' }, jwtUser);

      expect(crearComentarioUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: 'otro-ticket',
          autorId: 'otro-user-id',
        }),
      );
    });

    // T4B.3 — ComentarioNoPermitidoError → 422
    it('lanza UnprocessableEntityException cuando el ticket está en estado terminal (422)', async () => {
      crearComentarioUseCase.execute.mockResolvedValue(
        Result.fail(new ComentarioNoPermitidoError('CERRADO')),
      );

      await expect(
        controller.crearComentario('ticket-001', { contenido: 'Comentario' }, user),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(crearComentarioUseCase.execute).toHaveBeenCalledOnce();
    });

    it('lanza UnprocessableEntityException para ComentarioNoPermitidoError en estado RESUELTO', async () => {
      crearComentarioUseCase.execute.mockResolvedValue(
        Result.fail(new ComentarioNoPermitidoError('RESUELTO')),
      );

      await expect(
        controller.crearComentario('ticket-001', { contenido: 'Comentario' }, user),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    // T4B.4 — TicketNoEncontradoError → 404
    it('lanza NotFoundException cuando el ticket no existe (404)', async () => {
      crearComentarioUseCase.execute.mockResolvedValue(
        Result.fail(new TicketNoEncontradoError('ticket-inexistente')),
      );

      await expect(
        controller.crearComentario('ticket-inexistente', { contenido: 'Comentario' }, user),
      ).rejects.toThrow(NotFoundException);
    });

    // T4B.5 — contenido vacío o espacios → 422 ANTES de invocar use case
    it('lanza UnprocessableEntityException cuando contenido es cadena vacía', async () => {
      await expect(
        controller.crearComentario('ticket-001', { contenido: '' }, user),
      ).rejects.toThrow(UnprocessableEntityException);

      // El use case NO debe ser invocado
      expect(crearComentarioUseCase.execute).not.toHaveBeenCalled();
    });

    it('lanza UnprocessableEntityException cuando contenido es solo espacios en blanco', async () => {
      await expect(
        controller.crearComentario('ticket-001', { contenido: '   ' }, user),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(crearComentarioUseCase.execute).not.toHaveBeenCalled();
    });
  });

  // ─── Guard chain y permisos (T4B.2) ──────────────────────────────────────

  describe('Guard chain y permisos', () => {
    it('aplica JwtAuthGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ComentariosController) ?? [];
      expect(guards).toContain(JwtAuthGuard);
    });

    it('aplica RolesGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ComentariosController) ?? [];
      expect(guards).toContain(RolesGuard);
    });

    it('aplica PermissionsGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ComentariosController) ?? [];
      expect(guards).toContain(PermissionsGuard);
    });

    it('aplica TenantGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ComentariosController) ?? [];
      expect(guards).toContain(TenantGuard);
    });

    // T4B.2 — @RequirePermissions('ticket:comentar') en el handler
    it('@RequirePermissions("ticket:comentar") configurado en el handler crearComentario', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, ComentariosController.prototype.crearComentario) ?? [];
      expect(perms).toContain('ticket:comentar');
    });
  });
});

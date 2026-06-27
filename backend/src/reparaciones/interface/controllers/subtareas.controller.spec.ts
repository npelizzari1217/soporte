/**
 * 5.D.1 TEST — Unit tests para SubtareasController.
 *
 * Verifica que el controlador:
 * - Delega a CrearSubtareaUseCase con los DTOs correctos.
 * - Delega a CompletarSubtareaUseCase con el id y autorId del JWT.
 * - Retorna la respuesta esperada (status codes + shape).
 * - Mapea errores de dominio a HttpException apropiadas.
 * - Aplica la cadena de guards JWT → Roles/Permissions → Tenant.
 * - @RequirePermissions('subtarea:actualizar') en completarSubtarea.
 *
 * Los use cases son mockeados (sin Prisma ni NestJS DI).
 * El guard de permiso 'subtarea:actualizar' se verifica vía Reflect.getMetadata.
 *
 * Tarea: 5.D.1
 */
import {
  NotFoundException,
  UnprocessableEntityException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SubtareasController } from './subtareas.controller';
import { Result } from '../../../shared/domain/result';
import { SubtareaEdiliciaEntity } from '../../domain/entities/subtarea-edilicia.entity';
import {
  SubtareaEdiliciaNoEncontradaError,
  SubtareaYaCompletadaError,
  TicketEdiliciaNoEncontradoError,
} from '../../domain/errors/reparaciones.errors';
import { TipoOperacionNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { CreateSubtareaHttpDto } from '../dtos/reparaciones.dto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'tecnico-001',
    cliente_id: 'cli-abc',
    email: 'tecnico@example.com',
    roles: ['MANTENIMIENTO'],
    permisos: ['ticket:crear', 'subtarea:actualizar'],
    cliente_nombre: 'Test Corp',
    ...overrides,
  };
}

function makeSubtarea(): SubtareaEdiliciaEntity {
  return SubtareaEdiliciaEntity.create({
    ticketEdiliciaId: 'edilicia-001',
    descripcion: 'Verificar grieta',
    orden: 1,
  });
}

function makeCreateSubtareaDto(): CreateSubtareaHttpDto {
  return {
    descripcion: 'Verificar grieta',
    orden: 1,
  };
}

function makeUseCaseMocks() {
  return {
    crearSubtareaUseCase: { execute: jest.fn() },
    completarSubtareaUseCase: { execute: jest.fn() },
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('SubtareasController', () => {
  let controller: SubtareasController;
  let mocks: ReturnType<typeof makeUseCaseMocks>;
  let user: JwtPayload;

  beforeEach(() => {
    mocks = makeUseCaseMocks();
    user = makeUser();
    controller = new SubtareasController(
      mocks.crearSubtareaUseCase as any,
      mocks.completarSubtareaUseCase as any,
    );
  });

  // ─── POST /tickets-edilicio/:id/subtareas ───────────────────────────────────

  describe('POST /tickets-edilicio/:id/subtareas (crearSubtarea)', () => {
    it('retorna 201 con datos de la subtarea creada', async () => {
      const subtarea = makeSubtarea();
      mocks.crearSubtareaUseCase.execute.mockResolvedValue(Result.ok(subtarea));

      const result = await controller.crearSubtarea('edilicia-001', makeCreateSubtareaDto(), user);

      expect(result).toMatchObject({
        ticketEdiliciaId: 'edilicia-001',
        descripcion: 'Verificar grieta',
        completada: false,
      });
    });

    it('delega al use case con ticketEdiliciaId del param y autorId del JWT', async () => {
      const subtarea = makeSubtarea();
      mocks.crearSubtareaUseCase.execute.mockResolvedValue(Result.ok(subtarea));

      await controller.crearSubtarea('edilicia-001', makeCreateSubtareaDto(), user);

      expect(mocks.crearSubtareaUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketEdiliciaId: 'edilicia-001',
          autorId: 'tecnico-001',
        }),
      );
    });

    it('lanza NotFoundException cuando el ticket_edilicia no existe', async () => {
      mocks.crearSubtareaUseCase.execute.mockResolvedValue(
        Result.fail(new TicketEdiliciaNoEncontradoError('edilicia-x')),
      );

      await expect(
        controller.crearSubtarea('edilicia-x', makeCreateSubtareaDto(), user),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza InternalServerErrorException cuando el tipo de operacion no está sembrado', async () => {
      mocks.crearSubtareaUseCase.execute.mockResolvedValue(
        Result.fail(new TipoOperacionNoEncontradoError('AVANCE_EDILICIO')),
      );

      await expect(
        controller.crearSubtarea('edilicia-001', makeCreateSubtareaDto(), user),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ─── POST /subtareas/:id/completar ─────────────────────────────────────────

  describe('POST /subtareas/:id/completar (completarSubtarea)', () => {
    it('retorna 200 con datos de la subtarea completada', async () => {
      const subtarea = makeSubtarea();
      subtarea.completar('tecnico-001');
      mocks.completarSubtareaUseCase.execute.mockResolvedValue(Result.ok(subtarea));

      const result = await controller.completarSubtarea('subtarea-001', user);

      expect(result).toMatchObject({
        completada: true,
      });
    });

    it('delega al use case con subtareaId del param, completadaPorId y autorId del JWT', async () => {
      const subtarea = makeSubtarea();
      subtarea.completar('tecnico-001');
      mocks.completarSubtareaUseCase.execute.mockResolvedValue(Result.ok(subtarea));

      await controller.completarSubtarea('subtarea-001', user);

      expect(mocks.completarSubtareaUseCase.execute).toHaveBeenCalledWith({
        subtareaId: 'subtarea-001',
        completadaPorId: 'tecnico-001',
        autorId: 'tecnico-001',
      });
    });

    it('lanza NotFoundException cuando la subtarea no existe', async () => {
      mocks.completarSubtareaUseCase.execute.mockResolvedValue(
        Result.fail(new SubtareaEdiliciaNoEncontradaError('subtarea-x')),
      );

      await expect(controller.completarSubtarea('subtarea-x', user)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza UnprocessableEntityException cuando la subtarea ya está completada', async () => {
      mocks.completarSubtareaUseCase.execute.mockResolvedValue(
        Result.fail(new SubtareaYaCompletadaError('subtarea-001')),
      );

      await expect(controller.completarSubtarea('subtarea-001', user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('lanza InternalServerErrorException cuando el tipo de operacion no está sembrado', async () => {
      mocks.completarSubtareaUseCase.execute.mockResolvedValue(
        Result.fail(new TipoOperacionNoEncontradoError('AVANCE_EDILICIO')),
      );

      await expect(controller.completarSubtarea('subtarea-001', user)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ─── Guard chain (via Reflect metadata) ────────────────────────────────────

  describe('Guard chain', () => {
    it('aplica JwtAuthGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', SubtareasController) ?? [];
      expect(guards).toContain(JwtAuthGuard);
    });

    it('aplica TenantGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', SubtareasController) ?? [];
      expect(guards).toContain(TenantGuard);
    });

    it('aplica RolesGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', SubtareasController) ?? [];
      expect(guards).toContain(RolesGuard);
    });

    it('aplica PermissionsGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', SubtareasController) ?? [];
      expect(guards).toContain(PermissionsGuard);
    });

    it('requiere permiso ticket:crear en crearSubtarea', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, SubtareasController.prototype.crearSubtarea) ?? [];
      expect(perms).toContain('ticket:crear');
    });

    it('requiere permiso subtarea:actualizar en completarSubtarea (GUARD CRITICO)', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, SubtareasController.prototype.completarSubtarea) ?? [];
      expect(perms).toContain('subtarea:actualizar');
    });
  });
});

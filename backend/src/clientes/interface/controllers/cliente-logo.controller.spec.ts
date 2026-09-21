/**
 * cliente-logo.controller.spec.ts — TDD RED phase (sdd/logo-por-cliente,
 * WU2, 2.5).
 *
 * Unit test: instancia el controller directamente con los use cases
 * mockeados (sin bootstrapear NestJS, sin pasar por guards reales — mismo
 * criterio que `ciclos.controller.spec.ts`). El foco es la traducción HTTP ↔
 * use case, el mapeo de errores de dominio → HttpException, y sobre todo el
 * CHEQUEO INLINE del `GET` (design.md, tabla "Autorización: los dos
 * lugares"): `TenantGuard` NUNCA se usa acá porque compara contra el
 * `cliente_id` del token, jamás contra el `:id` de la ruta.
 *
 * Las propiedades "ADMINISTRADOR intenta POST → 403" y "sin token → 401" NO
 * se ejercitan en este archivo: las garantiza la composición con
 * `GlobalAdminGuard`/`JwtAuthGuard` ya reales en `@UseGuards(...)` de cada
 * método, y esos guards tienen su propia cobertura unitaria
 * (`global-admin.guard.spec.ts`, `jwt-auth.guard.spec.ts`). Este spec cubre
 * el código nuevo: el `if` inline del `GET`.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ClienteLogoController } from './cliente-logo.controller';
import { Result } from '../../../shared/domain/result';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import {
  ClienteNoEncontradoError,
  LogoClienteNoEncontradoError,
} from '../../domain/errors/clientes.errors';
import { ClienteEntity } from '../../domain/entities/cliente.entity';

const CLIENTE_A = '11111111-1111-1111-1111-111111111111';
const CLIENTE_B = '22222222-2222-2222-2222-222222222222';

function buildController() {
  const configurarLogoClienteUseCase = { execute: vi.fn() };
  const quitarLogoClienteUseCase = { execute: vi.fn() };
  const verLogoClienteUseCase = { execute: vi.fn() };
  const controller = new ClienteLogoController(
    configurarLogoClienteUseCase as any,
    quitarLogoClienteUseCase as any,
    verLogoClienteUseCase as any,
  );
  return {
    controller,
    configurarLogoClienteUseCase,
    quitarLogoClienteUseCase,
    verLogoClienteUseCase,
  };
}

function usuarioDe(clienteId: string | null, isGlobalAdmin = false): JwtPayload {
  return {
    v: 2,
    sub: 'user-1',
    cliente_id: clienteId,
    rol: isGlobalAdmin ? null : 'USUARIO',
    permisos: [],
    is_global_admin: isGlobalAdmin,
    cliente_nombre: null,
    membresias: [],
    modulos: [],
    nombre: 'Test',
    apellido: 'User',
  };
}

function buildResSpy() {
  return { setHeader: vi.fn() };
}

describe('ClienteLogoController (2.5)', () => {
  describe('GET /clientes/:id/logo — chequeo inline de aislamiento', () => {
    it('usuario del cliente A pide el logo del cliente B → 403, sin invocar el use case', async () => {
      const { controller, verLogoClienteUseCase } = buildController();
      const user = usuarioDe(CLIENTE_A);

      await expect(controller.ver(user, CLIENTE_B, buildResSpy() as any)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(verLogoClienteUseCase.execute).not.toHaveBeenCalled();
    });

    it('usuario del cliente A pide el suyo → 200, con Content-Type/nosniff/inline', async () => {
      const { controller, verLogoClienteUseCase } = buildController();
      const user = usuarioDe(CLIENTE_A);
      const buffer = Buffer.from('binario-png');
      verLogoClienteUseCase.execute.mockResolvedValue(Result.ok({ buffer, mimeType: 'image/png' }));
      const res = buildResSpy();

      const body = await controller.ver(user, CLIENTE_A, res as any);

      expect(body).toBe(buffer);
      expect(verLogoClienteUseCase.execute).toHaveBeenCalledWith(CLIENTE_A);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'inline');
    });

    it('ROOT (is_global_admin) pide el logo de cualquier cliente → 200', async () => {
      const { controller, verLogoClienteUseCase } = buildController();
      const root = usuarioDe(null, true);
      const buffer = Buffer.from('binario-webp');
      verLogoClienteUseCase.execute.mockResolvedValue(
        Result.ok({ buffer, mimeType: 'image/webp' }),
      );

      const body = await controller.ver(root, CLIENTE_B, buildResSpy() as any);

      expect(body).toBe(buffer);
      expect(verLogoClienteUseCase.execute).toHaveBeenCalledWith(CLIENTE_B);
    });

    it('propaga 404 NotFoundException cuando el cliente no existe', async () => {
      const { controller, verLogoClienteUseCase } = buildController();
      const root = usuarioDe(null, true);
      verLogoClienteUseCase.execute.mockResolvedValue(
        Result.fail(new ClienteNoEncontradoError(CLIENTE_B)),
      );

      await expect(controller.ver(root, CLIENTE_B, buildResSpy() as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('propaga 404 NotFoundException cuando el cliente no tiene logo', async () => {
      const { controller, verLogoClienteUseCase } = buildController();
      const user = usuarioDe(CLIENTE_A);
      verLogoClienteUseCase.execute.mockResolvedValue(
        Result.fail(new LogoClienteNoEncontradoError(CLIENTE_A)),
      );

      await expect(controller.ver(user, CLIENTE_A, buildResSpy() as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('POST /clientes/:id/logo', () => {
    it('sube el logo y retorna éxito', async () => {
      const { controller, configurarLogoClienteUseCase } = buildController();
      const cliente = ClienteEntity.create({
        nombre: 'ACME',
        razonSocial: null,
        cuit: null,
        dbName: 'soporte_deadbeef',
        activo: true,
        logoStorageKey: 'clientes/abc/key',
        logoMimeType: 'image/png',
        logoUpdatedAt: new Date('2026-01-01'),
      });
      configurarLogoClienteUseCase.execute.mockResolvedValue(Result.ok(cliente));
      const file = {
        buffer: Buffer.from('x'),
        mimetype: 'image/png',
        size: 100,
      } as Express.Multer.File;

      const body = await controller.subir(CLIENTE_A, file);

      expect(configurarLogoClienteUseCase.execute).toHaveBeenCalledWith({
        clienteId: CLIENTE_A,
        buffer: file.buffer,
        mimeType: 'image/png',
      });
      expect(body).toEqual({ logoUpdatedAt: '2026-01-01T00:00:00.000Z' });
    });

    it('rechaza un SVG ANTES de invocar el use case (whitelist del pipe)', async () => {
      const { controller, configurarLogoClienteUseCase } = buildController();
      const file = {
        buffer: Buffer.from('<svg/>'),
        mimetype: 'image/svg+xml',
        size: 100,
      } as Express.Multer.File;

      await expect(controller.subir(CLIENTE_A, file)).rejects.toThrow();
      expect(configurarLogoClienteUseCase.execute).not.toHaveBeenCalled();
    });

    it('propaga 404 NotFoundException cuando el cliente no existe', async () => {
      const { controller, configurarLogoClienteUseCase } = buildController();
      configurarLogoClienteUseCase.execute.mockResolvedValue(
        Result.fail(new ClienteNoEncontradoError(CLIENTE_A)),
      );
      const file = {
        buffer: Buffer.from('x'),
        mimetype: 'image/png',
        size: 100,
      } as Express.Multer.File;

      await expect(controller.subir(CLIENTE_A, file)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('DELETE /clientes/:id/logo', () => {
    it('quita el logo (con o sin logo previo) → 204, sin cuerpo', async () => {
      const { controller, quitarLogoClienteUseCase } = buildController();
      quitarLogoClienteUseCase.execute.mockResolvedValue(Result.ok(undefined));

      const body = await controller.quitar(CLIENTE_A);

      expect(quitarLogoClienteUseCase.execute).toHaveBeenCalledWith(CLIENTE_A);
      expect(body).toBeUndefined();
    });

    it('propaga 404 NotFoundException cuando el cliente no existe', async () => {
      const { controller, quitarLogoClienteUseCase } = buildController();
      quitarLogoClienteUseCase.execute.mockResolvedValue(
        Result.fail(new ClienteNoEncontradoError(CLIENTE_A)),
      );

      await expect(controller.quitar(CLIENTE_A)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

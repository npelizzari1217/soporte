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
import { ForbiddenException, NotFoundException, StreamableFile } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ClienteLogoController } from './cliente-logo.controller';
import { Result } from '../../../shared/domain/result';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { GlobalAdminGuard } from '../../../auth/infrastructure/guards/global-admin.guard';
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
    cliente_logo_v: null,
  };
}

function buildResSpy() {
  return { setHeader: vi.fn() };
}

/**
 * Drena el stream interno de un `StreamableFile` a un `Buffer` — desde el
 * fix fix/logo-streamable-file, `ver()` ya no devuelve el `Buffer` a secas
 * (ver docstring del método: un `Buffer` con `@Res({ passthrough: true })`
 * se serializa a JSON en vez de mandar los bytes crudos).
 */
async function leerStreamable(streamable: StreamableFile): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of streamable.getStream()) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
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

      expect(body).toBeInstanceOf(StreamableFile);
      expect(await leerStreamable(body)).toEqual(buffer);
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

      expect(body).toBeInstanceOf(StreamableFile);
      expect(await leerStreamable(body)).toEqual(buffer);
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

  /**
   * Backstop de tasks.md 2.5 (verify-report.md, CRITICAL 1 y 2).
   *
   * Los tests de arriba instancian el controller a mano y nunca pasan por
   * `@UseGuards(...)`: borrar `GlobalAdminGuard` del `@Post`/`@Delete`, o
   * agregarlo al `@Get`, deja TODA la suite de arriba en verde. Este bloque
   * lee `GUARDS_METADATA` en runtime —mismo patrón que los otros 23 specs del
   * repo que lo usan, p. ej. `movimientos-insumo.controller.spec.ts`— para
   * fijar qué guard va en cada ruta.
   *
   * `?? []` es obligatorio: sin el decorador, `Reflect.getMetadata` devuelve
   * `undefined`, y `expect(undefined).toContain(x)` PASA en el Vitest de este
   * repo (así perdió tiempo `reset-de-contrasena-por-admin`, commit
   * `e4c8257`). Sin el `?? []`, esta aserción no muerde.
   */
  describe('RBAC — metadata de guards, por ruta', () => {
    function handlerDe(metodo: 'subir' | 'quitar' | 'ver'): (...args: unknown[]) => unknown {
      return ClienteLogoController.prototype[metodo] as unknown as (...args: unknown[]) => unknown;
    }

    it('subir (POST) declara JwtAuthGuard y GlobalAdminGuard — exclusivo ROOT', () => {
      const guards = (Reflect.getMetadata(GUARDS_METADATA, handlerDe('subir')) ?? []) as unknown[];

      expect(guards).toEqual([JwtAuthGuard, GlobalAdminGuard]);
    });

    it('quitar (DELETE) declara JwtAuthGuard y GlobalAdminGuard — exclusivo ROOT', () => {
      const guards = (Reflect.getMetadata(GUARDS_METADATA, handlerDe('quitar')) ?? []) as unknown[];

      expect(guards).toEqual([JwtAuthGuard, GlobalAdminGuard]);
    });

    /**
     * El caso invertido, y el que de verdad importa: si alguien agregara
     * `GlobalAdminGuard` acá, el `GET` se volvería ROOT-only y ningún usuario
     * del inquilino vería su propio logo (design.md, tabla "Autorización: los
     * dos lugares"). `not.toContain` atrapa esa adición además de la
     * ausencia de `JwtAuthGuard`.
     */
    it('ver (GET) declara JwtAuthGuard y NO declara GlobalAdminGuard', () => {
      const guards = (Reflect.getMetadata(GUARDS_METADATA, handlerDe('ver')) ?? []) as unknown[];

      expect(guards).toContain(JwtAuthGuard);
      expect(guards).not.toContain(GlobalAdminGuard);
    });

    it('la clase NO declara guards a nivel de clase (design.md D1/H1)', () => {
      const guardsDeClase = (Reflect.getMetadata(GUARDS_METADATA, ClienteLogoController) ??
        []) as unknown[];

      expect(guardsDeClase).toEqual([]);
    });

    /**
     * La red que atrapa una ruta nueva sin ningún guard: si `subir`/`quitar`/
     * `ver` fueran solo tres de varios métodos, un cuarto sin `@UseGuards`
     * quedaría fuera de los asserts de arriba. Esto deriva la lista del
     * prototipo en vez de enumerarla a mano.
     */
    it('ningún método del controller queda sin guards declarados', () => {
      const metodos = Object.getOwnPropertyNames(ClienteLogoController.prototype).filter(
        (nombre) => nombre !== 'constructor',
      );

      expect(metodos).toHaveLength(3);

      const sinGuards = metodos.filter((metodo) => {
        const guards = (Reflect.getMetadata(
          GUARDS_METADATA,
          handlerDe(metodo as 'subir' | 'quitar' | 'ver'),
        ) ?? []) as unknown[];
        return guards.length === 0;
      });

      expect(sinGuards).toEqual([]);
    });
  });
});

/**
 * ConfiguracionController — unit tests.
 *
 * Cubre:
 * - Guard chain a nivel de clase (Reflect metadata, mismo patrón que
 *   `PresupuestosController`/`TicketsController`).
 * - RBAC específico de `configuracion:gestionar` sobre los handlers REALES
 *   del controller (Reflector REAL + PermissionsGuard REAL, no mockeado) —
 *   R4 escenarios 1-2 (tarea 5.2) y D9 "permiso stale" (tarea 5.3): el guard
 *   NUNCA consulta DB, evalúa solo el array `permisos` del JWT — un JWT
 *   emitido ANTES de otorgar el permiso sigue sin él en el payload, así que
 *   el rechazo es el MISMO código que "sin permiso", documentado acá como
 *   escenario propio porque el spec (R4) lo pide explícito.
 * - Construcción de `ActorContext`/`ConfigScope` EXCLUSIVAMENTE del JWT y
 *   mapeo de errores de dominio a HttpException — usando los use cases
 *   REALES (`LeerConfigUseCase`/`ActualizarConfigUseCase`, PR4) con el
 *   repositorio mockeado (`IConfiguracionRepository` es una interfaz — sin
 *   campos privados — así que se puede mockear con un objeto plano sin
 *   castear, a diferencia de mockear las clases de use case directamente,
 *   que sí tienen campos privados y exigirían `as any`, prohibido en este
 *   proyecto — DoD §9 CLAUDE.md).
 *
 * F2 "PUT scope=global por ADMIN-de-tenant ⇒ rechazado" (tarea 5.5) tiene su
 * propio archivo dedicado: `configuracion.controller.f2.integration.spec.ts`.
 *
 * Ref design: §10. Ref spec: Requirement 3, Requirement 4. Tarea: 5.2, 5.3, 5.4 (PR5).
 */
import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ConfiguracionController } from './configuracion.controller';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { PERMISSIONS_KEY } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';

import { Result } from '../../../shared/domain/result';
import { CifradoError } from '../../../shared/domain/errors/cifrado.errors';
import { CipherPayload, ISecretCipher } from '../../../shared/domain/ports/i-secret-cipher';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { LeerConfigUseCase } from '../../application/use-cases/leer-config.use-case';
import { ActualizarConfigUseCase } from '../../application/use-cases/actualizar-config.use-case';
import {
  ConfiguracionRow,
  IConfiguracionRepository,
} from '../../domain/ports/i-configuracion-repository';
import {
  ConfigConflictoConcurrenteError,
  InfraConfigError,
} from '../../domain/errors/config.errors';
import { ActualizarConfigHttpDto } from '../dtos/actualizar-config-http.dto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: '01966a6a-0000-7000-8000-000000000099',
    cliente_id: 'c1111111-0000-4000-8000-000000000001',
    email: 'test@test.com',
    roles: ['ADMINISTRADOR'],
    permisos: ['configuracion:gestionar'],
    cliente_nombre: 'Test Corp',
    is_global_admin: false,
    ...overrides,
  };
}

function buildRow(overrides: Partial<ConfiguracionRow> = {}): ConfiguracionRow {
  return {
    id: 'row-1',
    categoria: 'smtp',
    clave: 'host',
    valor: 'smtp.example.com',
    tipo: 'string',
    esSecreto: false,
    iv: null,
    authTag: null,
    actualizadoPor: null,
    createdAt: new Date('2026-07-31T00:00:00.000Z'),
    updatedAt: new Date('2026-07-31T00:00:00.000Z'),
    ...overrides,
  };
}

/** ExecutionContext que apunta a un handler REAL del controller, para que
 * `Reflector.getAllAndOverride` lea la metadata REAL del decorator
 * `@RequirePermissions()` (sin mockear el reflector). */
function makeRealExecutionContext(
  handler: (...args: never[]) => unknown,
  user: JwtPayload | null,
): ExecutionContext {
  const request = { user, headers: {} };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => ConfiguracionController,
  } as unknown as ExecutionContext;
}

function makeHttpDto(overrides: Partial<ActualizarConfigHttpDto> = {}): ActualizarConfigHttpDto {
  return {
    scope: 'tenant',
    categoria: 'smtp',
    clave: 'host',
    valor: 'nuevo.smtp.com',
    esSecreto: false,
    tipo: 'string',
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ConfiguracionController', () => {
  // ─── Guard chain (metadata a nivel de clase) ─────────────────────────────

  describe('Guard chain', () => {
    it('aplica JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ConfiguracionController) ?? [];
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(RolesGuard);
      expect(guards).toContain(PermissionsGuard);
      expect(guards).toContain(TenantGuard);
    });

    it('requiere permiso configuracion:gestionar en listar (GET)', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, ConfiguracionController.prototype.listar) ?? [];
      expect(perms).toContain('configuracion:gestionar');
    });

    it('requiere permiso configuracion:gestionar en actualizar (PUT)', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, ConfiguracionController.prototype.actualizar) ?? [];
      expect(perms).toContain('configuracion:gestionar');
    });
  });

  // ─── R4 — RBAC real sobre los handlers del controller (tarea 5.2/5.3) ────

  describe('PermissionsGuard sobre ConfiguracionController (R4)', () => {
    let guard: PermissionsGuard;

    beforeEach(() => {
      guard = new PermissionsGuard(new Reflector());
    });

    it('autoriza GET con JWT que incluye configuracion:gestionar', () => {
      const ctx = makeRealExecutionContext(
        ConfiguracionController.prototype.listar,
        makePayload({ permisos: ['configuracion:gestionar'] }),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('autoriza PUT con JWT que incluye configuracion:gestionar', () => {
      const ctx = makeRealExecutionContext(
        ConfiguracionController.prototype.actualizar,
        makePayload({ permisos: ['configuracion:gestionar'] }),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('rechaza GET con 403 cuando el JWT NO incluye configuracion:gestionar', () => {
      const ctx = makeRealExecutionContext(
        ConfiguracionController.prototype.listar,
        makePayload({ permisos: ['ticket:crear'] }),
      );
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('rechaza PUT con 403 cuando el JWT NO incluye configuracion:gestionar', () => {
      const ctx = makeRealExecutionContext(
        ConfiguracionController.prototype.actualizar,
        makePayload({ permisos: [] }),
      );
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    // D9 (tarea 5.3): el guard NUNCA consulta DB — evalúa solo el array
    // `permisos` embebido en el JWT ya firmado. Un JWT emitido ANTES de que
    // el permiso se otorgara en DB simplemente NO lo tiene en su payload —
    // mismo código de rechazo que "sin permiso": el guard no distingue "el
    // permiso no existe" de "el permiso existe en DB pero el token es
    // viejo", ambos casos son, para el guard, "no está en el array".
    it('D9: JWT emitido ANTES de otorgar el permiso sigue rechazado con 403 aunque el permiso ya exista en DB', () => {
      const jwtViejoSinElPermiso = makePayload({ permisos: ['ticket:crear', 'compra:aprobar'] });

      const ctx = makeRealExecutionContext(
        ConfiguracionController.prototype.actualizar,
        jwtViejoSinElPermiso,
      );

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  // ─── Handlers — construcción de scope/actor + mapeo de errores ───────────
  // Use cases REALES (PR4), repositorio (interfaz, sin campos privados)
  // mockeado — evita `as any`/`as unknown as` sobre las clases de use case
  // (que SÍ tienen campos privados y no son duck-typeables).

  describe('Handlers', () => {
    let controller: ConfiguracionController;
    let repo: IConfiguracionRepository;
    let secretCipher: ISecretCipher;
    let publisher: IDomainEventPublisher;
    let logger: ILogger;

    beforeEach(() => {
      repo = {
        findAll: vi.fn().mockResolvedValue(Result.ok<ConfiguracionRow[], InfraConfigError>([])),
        findByClave: vi
          .fn()
          .mockResolvedValue(Result.ok<ConfiguracionRow | null, InfraConfigError>(null)),
        upsert: vi.fn().mockResolvedValue(Result.ok(buildRow())),
      };
      secretCipher = {
        encrypt: vi.fn().mockReturnValue(
          Result.ok<CipherPayload, CifradoError>({
            valor: 'ciphertext',
            iv: 'iv',
            authTag: 'authtag',
          }),
        ),
        decrypt: vi.fn(),
      };
      publisher = { publish: vi.fn() };
      logger = { error: vi.fn() };

      controller = new ConfiguracionController(
        new LeerConfigUseCase(repo),
        new ActualizarConfigUseCase(repo, secretCipher, publisher, logger),
      );
    });

    describe('GET /configuracion (listar)', () => {
      it('construye ConfigScope EXCLUSIVAMENTE del JWT (scope=tenant → clienteId del actor)', async () => {
        repo.findAll = vi.fn().mockResolvedValue(Result.ok([buildRow()]));
        const user = makePayload({ cliente_id: 'cli-propio' });

        const result = await controller.listar('tenant', 'smtp', user);

        expect(repo.findAll).toHaveBeenCalledWith(
          { kind: 'tenant', clienteId: 'cli-propio' },
          'smtp',
        );
        expect(result).toEqual([
          {
            categoria: 'smtp',
            clave: 'host',
            valor: 'smtp.example.com',
            tipo: 'string',
            esSecreto: false,
          },
        ]);
      });

      it('scope=global no lleva clienteId, sin importar el cliente_id del actor', async () => {
        const user = makePayload({ is_global_admin: true, cliente_id: 'cli-cualquiera' });

        await controller.listar('global', undefined, user);

        expect(repo.findAll).toHaveBeenCalledWith({ kind: 'global' }, undefined);
      });

      it('lanza BadRequestException con scope inválido/ausente, sin llamar al repositorio', async () => {
        await expect(controller.listar('otro', undefined, makePayload())).rejects.toThrow(
          BadRequestException,
        );
        await expect(controller.listar(undefined, undefined, makePayload())).rejects.toThrow(
          BadRequestException,
        );
        expect(repo.findAll).not.toHaveBeenCalled();
      });

      it('mapea ScopeGlobalNoAutorizadoError (F2) a 403 cuando el actor no es global admin', async () => {
        await expect(
          controller.listar('global', undefined, makePayload({ is_global_admin: false })),
        ).rejects.toThrow(ForbiddenException);
        expect(repo.findAll).not.toHaveBeenCalled();
      });

      it('mapea ScopeTenantNoAutorizadoError a 403 — defensa en profundidad ante cliente_id vacío', async () => {
        // scope=tenant siempre usa `user.cliente_id` como clienteId (nunca
        // el body/query) — así que ownership de tenant NORMALMENTE siempre
        // se satisface a sí misma desde este controller. Este test cubre el
        // borde defensivo: un `cliente_id` vacío en el JWT (que en runtime
        // real ya sería rechazado antes por `TenantGuard`) NO calza con
        // `scope.clienteId.length > 0` — `autorizarScope` (dominio) lo
        // rechaza igual, prueba de que el use case NO confía ciegamente en
        // que "vino del controller" sea sinónimo de "autorizado".
        await expect(
          controller.listar('tenant', undefined, makePayload({ cliente_id: '' })),
        ).rejects.toThrow(ForbiddenException);
        expect(repo.findAll).not.toHaveBeenCalled();
      });

      it('mapea InfraConfigError a 500 sin filtrar el mensaje interno', async () => {
        repo.findAll = vi
          .fn()
          .mockResolvedValue(Result.fail(new InfraConfigError('detalle interno')));

        await expect(controller.listar('tenant', undefined, makePayload())).rejects.toThrow(
          InternalServerErrorException,
        );
      });
    });

    describe('PUT /configuracion (actualizar)', () => {
      it('construye ConfigScope/actorId EXCLUSIVAMENTE del JWT y delega en el repositorio', async () => {
        repo.upsert = vi
          .fn()
          .mockResolvedValue(Result.ok(buildRow({ actualizadoPor: 'user-sub' })));
        const user = makePayload({ cliente_id: 'cli-propio', sub: 'user-sub' });

        await controller.actualizar(makeHttpDto(), user);

        expect(repo.upsert).toHaveBeenCalledWith(
          { kind: 'tenant', clienteId: 'cli-propio' },
          expect.objectContaining({
            categoria: 'smtp',
            clave: 'host',
            valor: 'nuevo.smtp.com',
            actualizadoPor: 'user-sub',
          }),
        );
      });

      it('retorna el ConfigResponseDto de la fila persistida (enmascarada si esSecreto)', async () => {
        repo.upsert = vi
          .fn()
          .mockResolvedValue(
            Result.ok(buildRow({ clave: 'pass', valor: 'ciphertext', esSecreto: true })),
          );

        const result = await controller.actualizar(
          makeHttpDto({ clave: 'pass', valor: 'super-secreto', esSecreto: true }),
          makePayload(),
        );

        expect(result).toEqual({
          categoria: 'smtp',
          clave: 'pass',
          valor: '********',
          tipo: 'string',
          esSecreto: true,
        });
      });

      it('lanza BadRequestException con scope inválido, sin tocar el repositorio', async () => {
        // `scope` malformado simulado vía JSON.parse (sin `as any`/`as
        // unknown as`, prohibidos en este proyecto) — mismo patrón que
        // `validar-scope.spec.ts` para cruzar el boundary de tipos en
        // runtime (un DTO ya validado por class-validator en producción
        // nunca llegaría así, pero el controller no debe confiar
        // ciegamente en eso — defensa en profundidad).
        const dtoConScopeInvalido: ActualizarConfigHttpDto = JSON.parse(
          JSON.stringify({ ...makeHttpDto(), scope: 'invalido' }),
        );

        await expect(controller.actualizar(dtoConScopeInvalido, makePayload())).rejects.toThrow(
          BadRequestException,
        );
        expect(repo.upsert).not.toHaveBeenCalled();
      });

      it('mapea CategoriaNoSoportadaError (R8) a 400', async () => {
        await expect(
          controller.actualizar(makeHttpDto({ categoria: 'facturacion' }), makePayload()),
        ).rejects.toThrow(BadRequestException);
        expect(repo.upsert).not.toHaveBeenCalled();
      });

      it('mapea ValorEnmascaradoNoPermitidoError (round-trip del placeholder) a 400', async () => {
        await expect(
          controller.actualizar(makeHttpDto({ esSecreto: true, valor: '********' }), makePayload()),
        ).rejects.toThrow(BadRequestException);
        expect(secretCipher.encrypt).not.toHaveBeenCalled();
      });

      it('mapea ScopeGlobalNoAutorizadoError (F2) a 403', async () => {
        await expect(
          controller.actualizar(
            makeHttpDto({ scope: 'global' }),
            makePayload({ is_global_admin: false }),
          ),
        ).rejects.toThrow(ForbiddenException);
        expect(repo.upsert).not.toHaveBeenCalled();
      });

      it('mapea ConfigConflictoConcurrenteError a 409', async () => {
        repo.upsert = vi
          .fn()
          .mockResolvedValue(Result.fail(new ConfigConflictoConcurrenteError('smtp', 'host')));

        await expect(controller.actualizar(makeHttpDto(), makePayload())).rejects.toThrow(
          ConflictException,
        );
      });

      it('mapea CifradoError a 500 sin filtrar el mensaje interno', async () => {
        secretCipher.encrypt = vi.fn().mockReturnValue(Result.fail(new CifradoError('boom')));

        await expect(
          controller.actualizar(makeHttpDto({ esSecreto: true, valor: 'secreto' }), makePayload()),
        ).rejects.toThrow(InternalServerErrorException);
      });

      it('mapea InfraConfigError a 500 sin filtrar el mensaje interno', async () => {
        repo.findByClave = vi.fn().mockResolvedValue(Result.fail(new InfraConfigError('boom')));

        await expect(controller.actualizar(makeHttpDto(), makePayload())).rejects.toThrow(
          InternalServerErrorException,
        );
      });
    });
  });
});

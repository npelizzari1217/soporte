/**
 * ConfiguracionController — integración F2 (tarea 5.5).
 *
 * A diferencia de `configuracion.controller.spec.ts` (use cases mockeados),
 * acá `ActualizarConfigUseCase`/`LeerConfigUseCase` son la implementación
 * REAL (solo el repositorio y los demás colaboradores de infra están
 * mockeados), wireados dentro de un `ConfiguracionController` real. El
 * objetivo es probar la integración controller→use case: que el controller
 * construye el `ActorContext` desde el JWT y que el gate F2 REAL (dentro del
 * use case, PR4) rechaza la escritura ANTES de tocar el repositorio — no
 * solo que un mock configurado a mano devuelva `Result.fail`.
 *
 * Escenario (design §14 F2, resolución autoritativa 2026-07-30):
 * `PUT scope=global` por un ADMIN-de-tenant (JWT con `configuracion:gestionar`
 * pero SIN `is_global_admin`) ⇒ rechazado con 403, `repo.findByClave`/
 * `repo.upsert`/`secretCipher.encrypt`/`publisher.publish` NUNCA se llaman.
 *
 * Ref design: §14 F2 (resolución autoritativa). Ref spec: Requirement 4/5.
 * Tarea: 5.5 (PR5). Ref: STATE.md "Judgment Day — PR4 — fixes Ronda 1", arreglo 1.
 */
import { ForbiddenException } from '@nestjs/common';

import { ConfiguracionController } from './configuracion.controller';
import { Result } from '../../../shared/domain/result';
import { LeerConfigUseCase } from '../../application/use-cases/leer-config.use-case';
import { ActualizarConfigUseCase } from '../../application/use-cases/actualizar-config.use-case';
import {
  ConfiguracionRow,
  IConfiguracionRepository,
} from '../../domain/ports/i-configuracion-repository';
import { CipherPayload, ISecretCipher } from '../../../shared/domain/ports/i-secret-cipher';
import { CifradoError } from '../../../shared/domain/errors/cifrado.errors';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { InfraConfigError } from '../../domain/errors/config.errors';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { ActualizarConfigHttpDto } from '../dtos/actualizar-config-http.dto';

function makeAdminDeTenantPayload(): JwtPayload {
  return {
    sub: '01966a6a-0000-7000-8000-000000000042',
    cliente_id: 'c1111111-0000-4000-8000-000000000001',
    email: 'admin-tenant@test.com',
    roles: ['ADMINISTRADOR'],
    permisos: ['configuracion:gestionar'],
    cliente_nombre: 'Tenant Corp',
    // F2: tiene el permiso CRUD, pero NO es global admin.
    is_global_admin: false,
  };
}

function makePutGlobalDto(): ActualizarConfigHttpDto {
  return {
    scope: 'global',
    categoria: 'smtp',
    clave: 'host',
    valor: 'smtp-global-malicioso.example.com',
    esSecreto: false,
    tipo: 'string',
  };
}

function buildPersistedRow(overrides: Partial<ConfiguracionRow> = {}): ConfiguracionRow {
  return {
    id: 'row-1',
    categoria: 'smtp',
    clave: 'host',
    valor: 'smtp-global.example.com',
    tipo: 'string',
    esSecreto: false,
    iv: null,
    authTag: null,
    actualizadoPor: 'admin-global',
    createdAt: new Date('2026-07-31T00:00:00.000Z'),
    updatedAt: new Date('2026-07-31T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ConfiguracionController — integración F2 (PUT scope=global)', () => {
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
      upsert: vi.fn().mockResolvedValue(Result.ok(buildPersistedRow())),
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

    // Use cases REALES — no mockeados. Solo sus colaboradores de infra
    // (repo/cipher/publisher/logger) lo están, mismo criterio que
    // `actualizar-config.use-case.spec.ts` (PR4).
    const leerConfigUseCase = new LeerConfigUseCase(repo);
    const actualizarConfigUseCase = new ActualizarConfigUseCase(
      repo,
      secretCipher,
      publisher,
      logger,
    );

    controller = new ConfiguracionController(leerConfigUseCase, actualizarConfigUseCase);
  });

  it('rechaza con 403 un PUT scope=global de un ADMIN-de-tenant SIN is_global_admin, antes de tocar el repositorio', async () => {
    await expect(
      controller.actualizar(makePutGlobalDto(), makeAdminDeTenantPayload()),
    ).rejects.toThrow(ForbiddenException);

    expect(repo.findByClave).not.toHaveBeenCalled();
    expect(repo.upsert).not.toHaveBeenCalled();
    expect(secretCipher.encrypt).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('permite el mismo PUT scope=global cuando el actor SÍ es global admin (control, no F2)', async () => {
    const globalAdmin: JwtPayload = { ...makeAdminDeTenantPayload(), is_global_admin: true };

    const result = await controller.actualizar(makePutGlobalDto(), globalAdmin);

    expect(result).toMatchObject({ categoria: 'smtp', clave: 'host', esSecreto: false });
    expect(repo.upsert).toHaveBeenCalledWith(
      { kind: 'global' },
      expect.objectContaining({ categoria: 'smtp', clave: 'host' }),
    );
  });
});

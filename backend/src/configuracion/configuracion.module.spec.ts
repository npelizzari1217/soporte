/**
 * ConfiguracionModule — bootstrap/wiring regression guard (Dz12, tarea 4.12).
 *
 * Bootstrapea el módulo REAL (sin mocks unitarios) vía
 * `Test.createTestingModule`, mismo patrón que `tickets.module.wiring.spec.ts`.
 * Un `useFactory`/`inject` mal alineado NO lo atrapa `tsc --noEmit` (fallo de
 * runtime de Nest, no de tipos) — este test es la única red que lo cubre.
 *
 * `SharedModule` se importa junto a `ConfiguracionModule` porque, aunque es
 * `@Global()`, sus providers (`SECRET_CIPHER`, `DOMAIN_EVENT_PUBLISHER`,
 * `LOGGER`, `PrismaService`) solo quedan disponibles en el árbol de test si
 * algún módulo del árbol lo importa explícitamente (`ConfiguracionModule` no
 * lo hace — lo espera del árbol de `AppModule` en producción, mismo criterio
 * que `TicketsModule`). `compile()`/`init()` no abren conexión real a DB
 * (`PrismaService` es lazy — mismo patrón que `shared.module.spec.ts`).
 *
 * Segundo test (Dz12, ampliado en Judgment Day PR4 Ronda 1 arreglo 5):
 * confirma que `ConfiguracionModule` NO es `@Global()` — NINGÚN provider
 * suyo (`CONFIG_RESOLVER`, `CONFIGURACION_REPOSITORY`, `AUDIT_LOG`,
 * `LeerConfigUseCase`, `ActualizarConfigUseCase`) debe estar disponible en
 * un árbol que no lo importa explícitamente. Antes de esta ronda solo se
 * verificaba `CONFIG_RESOLVER` — un `@Global()` agregado por error, o un
 * provider agregado sin pasar por `exports`, no lo habría atrapado ningún
 * otro test existente para los 4 providers restantes.
 *
 * Ref design: §2 Dz12. Tarea: 4.12 (PR4). Ref: STATE.md "Judgment Day — PR4
 * — fixes Ronda 1", arreglo 5.
 */
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfiguracionModule } from './configuracion.module';
import { SharedModule } from '../shared/shared.module';
import { CONFIG_RESOLVER } from './domain/ports/i-config-resolver';
import { CONFIGURACION_REPOSITORY } from './domain/ports/i-configuracion-repository';
import { AUDIT_LOG } from './domain/ports/i-audit-log.port';
import { PrismaConfigResolver } from './infrastructure/persistence/prisma/config-resolver.adapter';
import { PrismaConfiguracionRepository } from './infrastructure/persistence/prisma/configuracion-repository.adapter';
import { PrismaAuditLog } from './infrastructure/persistence/prisma/audit-log.adapter';
import { AuditConfiguracionHandler } from './application/event-handlers/audit-configuracion.handler';
import { AuditConfiguracionListener } from './infrastructure/events/audit-configuracion.listener';
import { LeerConfigUseCase } from './application/use-cases/leer-config.use-case';
import { ActualizarConfigUseCase } from './application/use-cases/actualizar-config.use-case';

describe('ConfiguracionModule bootstrap (tarea 4.12 — wiring regression guard)', () => {
  it('compila sin UnknownDependenciesException y resuelve toda la cadena PR1-PR4 por DI', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, ConfiguracionModule],
    }).compile();

    await moduleRef.init();

    expect(moduleRef.get(CONFIG_RESOLVER)).toBeInstanceOf(PrismaConfigResolver);
    expect(moduleRef.get(CONFIGURACION_REPOSITORY)).toBeInstanceOf(PrismaConfiguracionRepository);
    expect(moduleRef.get(AUDIT_LOG)).toBeInstanceOf(PrismaAuditLog);
    expect(moduleRef.get(AuditConfiguracionHandler)).toBeInstanceOf(AuditConfiguracionHandler);
    expect(moduleRef.get(AuditConfiguracionListener)).toBeInstanceOf(AuditConfiguracionListener);
    expect(moduleRef.get(LeerConfigUseCase)).toBeInstanceOf(LeerConfigUseCase);
    expect(moduleRef.get(ActualizarConfigUseCase)).toBeInstanceOf(ActualizarConfigUseCase);

    await moduleRef.close();
  });

  it('Dz12: ConfiguracionModule NO es @Global — ningún provider (CONFIG_RESOLVER, CONFIGURACION_REPOSITORY, AUDIT_LOG, los 2 use cases) disponible en un árbol que no lo importa', async () => {
    @Module({})
    class ModuloAjenoSinConfiguracion {}

    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, ModuloAjenoSinConfiguracion],
    }).compile();

    await moduleRef.init();

    expect(() => moduleRef.get(CONFIG_RESOLVER)).toThrow();
    expect(() => moduleRef.get(CONFIGURACION_REPOSITORY)).toThrow();
    expect(() => moduleRef.get(AUDIT_LOG)).toThrow();
    expect(() => moduleRef.get(LeerConfigUseCase)).toThrow();
    expect(() => moduleRef.get(ActualizarConfigUseCase)).toThrow();

    await moduleRef.close();
  });
});

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { RecuperacionPasswordModule } from './recuperacion-password.module';
import { SharedModule } from '../shared/shared.module';
import { RecuperacionPasswordThrottlerGuard } from './infrastructure/guards/recuperacion-password-throttler.guard';
import { TAREAS_SEGUNDO_PLANO } from '../shared/domain/ports/i-tareas-segundo-plano.port';
import { CORREO_DE_CLIENTE } from './domain/ports/i-correo-de-cliente.port';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from './domain/ports/i-password-reset-token.repository';
import { SolicitarResetPasswordUseCase } from './application/use-cases/solicitar-reset-password.use-case';

/**
 * recuperacion-password.module.spec.ts — compilación REAL del módulo
 * (WU-5b): el verificador independiente de WU-4 marcó que la versión previa
 * solo leía metadata con `Reflect.getMetadata`, sin invocar
 * `Test.createTestingModule(...).compile()`, así que nunca probó que el
 * grafo de DI resuelve.
 *
 * `SharedModule` se importa junto a `RecuperacionPasswordModule` porque
 * `PrismaService`/`TenantContext`/`LOGGER` son `@Global()` — sin importar el
 * módulo que los declara en ESTE grafo aislado, Nest no los registra (mismo
 * patrón que `TestHarnessModule` de `csat.e2e.spec.ts:91`).
 *
 * Sin overrides: `PrismaService` nunca se conecta al construirse (`pg.Pool`
 * es lazy, ver `prisma.service.ts:16-17`), así que `compile()` no toca la
 * red ni la DB — arma el grafo de providers y nada más.
 *
 * Ref design: ADR-1, ADR-4, ADR-5, ADR-6, ADR-7. Tarea: 5.4 (WU-5b).
 */
describe('RecuperacionPasswordModule — compilación real (WU-5b)', () => {
  it('compila con SharedModule y resuelve SolicitarResetPasswordUseCase', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, RecuperacionPasswordModule],
    }).compile();

    const useCase = moduleRef.get(SolicitarResetPasswordUseCase);
    expect(useCase).toBeInstanceOf(SolicitarResetPasswordUseCase);

    await moduleRef.close();
  });

  it('resuelve también los providers wireados en WU-4 y WU-5b', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, RecuperacionPasswordModule],
    }).compile();

    expect(moduleRef.get(TAREAS_SEGUNDO_PLANO)).toBeDefined();
    expect(moduleRef.get(RecuperacionPasswordThrottlerGuard)).toBeDefined();
    expect(moduleRef.get(CORREO_DE_CLIENTE)).toBeDefined();
    expect(moduleRef.get(PASSWORD_RESET_TOKEN_REPOSITORY)).toBeDefined();

    await moduleRef.close();
  });

  it('NO declara controllers todavía — el controller llega en WU-7/WU-8', () => {
    const controllers = (Reflect.getMetadata('controllers', RecuperacionPasswordModule) ??
      []) as unknown[];
    expect(controllers).toHaveLength(0);
  });
});

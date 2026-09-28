import 'reflect-metadata';
import { RecuperacionPasswordModule } from './recuperacion-password.module';
import { AuthModule } from './auth.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { RecuperacionPasswordThrottlerGuard } from './infrastructure/guards/recuperacion-password-throttler.guard';
import { TAREAS_SEGUNDO_PLANO } from '../shared/domain/ports/i-tareas-segundo-plano.port';

describe('RecuperacionPasswordModule wiring (WU-4, ADR-1)', () => {
  it('importa AuthModule y NotificacionesModule', () => {
    const imports = (Reflect.getMetadata('imports', RecuperacionPasswordModule) ?? []) as unknown[];
    expect(imports).toContain(AuthModule);
    expect(imports).toContain(NotificacionesModule);
  });

  it('NO declara controllers todavía — el controller llega en WU-7/WU-8', () => {
    const controllers = (Reflect.getMetadata('controllers', RecuperacionPasswordModule) ??
      []) as unknown[];
    expect(controllers).toHaveLength(0);
  });

  it('provee TAREAS_SEGUNDO_PLANO y RecuperacionPasswordThrottlerGuard', () => {
    const providers = (Reflect.getMetadata('providers', RecuperacionPasswordModule) ??
      []) as Array<{ provide?: unknown }>;
    const tokensProvistos = providers.map((p) => p.provide);

    expect(tokensProvistos).toContain(TAREAS_SEGUNDO_PLANO);
    expect(tokensProvistos).toContain(RecuperacionPasswordThrottlerGuard);
  });
});

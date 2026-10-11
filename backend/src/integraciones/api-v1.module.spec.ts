/**
 * JD-6 del judgment-day de la API publica: `ApiV1Module` no registra un `ThrottlerModule` global.
 * `ThrottlerModule` es `@Global()` y `CsatModule` ya llama `forRoot`; con un segundo registro, que
 * opciones y que storage recibe un guard que las resuelva globalmente depende del orden de import.
 * Convencion del repo (`recuperacion-password-throttler.guard.ts`, `formulario-publico.module.ts`):
 * opciones y `ThrottlerStorage` como providers locales del modulo.
 *
 * Mira la metadata de `@Module` y no compila el modulo: compilarlo arrastra Auth, Tickets y Prisma.
 * El comportamiento (60/min, un cupo por clave para todas las rutas) lo prueban los e2e de
 * `test/integraciones-api-v1-auth.e2e.spec.ts`.
 */
import { FactoryProvider, Provider } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ThrottlerModule, ThrottlerStorage, getOptionsToken } from '@nestjs/throttler';
import { ApiV1Module } from './api-v1.module';
import { API_V1_VENTANA_MS, limiteApiV1 } from './infrastructure/api-v1-throttler.guard';

const metadata = <T>(clave: string): T[] => Reflect.getMetadata(clave, ApiV1Module) ?? [];
const token = (p: Provider): unknown => (typeof p === 'function' ? p : p.provide);

describe('ApiV1Module — throttler local (JD-6)', () => {
  it('no importa ThrottlerModule (ni forRoot ni forRootAsync): no registra opciones globales', () => {
    const imports = metadata<{ module?: unknown }>(MODULE_METADATA.IMPORTS);
    expect(imports.some((i) => i === ThrottlerModule || i?.module === ThrottlerModule)).toBe(false);
    expect(metadata<unknown>(MODULE_METADATA.EXPORTS)).not.toContain(ThrottlerModule);
  });

  it('provee localmente las opciones del limite v1 y su propio ThrottlerStorage', () => {
    const providers = metadata<Provider>(MODULE_METADATA.PROVIDERS);
    const opciones = providers.find((p) => token(p) === getOptionsToken()) as
      FactoryProvider | undefined;
    expect(opciones).toBeDefined();
    // El limite se lee al instanciar el modulo, asi `API_V1_RATE_LIMIT` lo puede fijar el entorno.
    expect(opciones!.useFactory()).toEqual([{ limit: limiteApiV1(), ttl: API_V1_VENTANA_MS }]);
    expect(providers.some((p) => token(p) === ThrottlerStorage)).toBe(true);
  });
});

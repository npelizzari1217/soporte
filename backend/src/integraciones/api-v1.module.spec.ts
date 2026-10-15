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
import { CrearComentarioUseCase } from '../tickets/application/use-cases/crear-comentario.use-case';
import { ListarEstadosUseCase } from '../tickets/application/use-cases/listar-estados.use-case';
import { ListarPrioridadesUseCase } from '../tickets/application/use-cases/listar-prioridades.use-case';
import { ListarTicketsUseCase } from '../tickets/application/use-cases/listar-tickets.use-case';
import { ListarTiposTicketUseCase } from '../tickets/application/use-cases/listar-tipos-ticket.use-case';
import { TicketsModule } from '../tickets/tickets.module';
import { ApiV1Module } from './api-v1.module';
import { API_V1_VENTANA_MS, limiteApiV1 } from './infrastructure/api-v1-throttler.guard';

const metadata = <T>(clave: string, modulo: object = ApiV1Module): T[] =>
  Reflect.getMetadata(clave, modulo) ?? [];
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

// odd/tasks/deuda-tecnica-2026-10-15.md, CA4: una sola fábrica por caso de uso, la de
// `TicketsModule`. Si `ApiV1Module` volviera a armarlos, un cambio de dependencias habría que
// repetirlo en los dos lados.
describe('ApiV1Module — casos de uso de tickets tomados de TicketsModule (CA4)', () => {
  const COMPARTIDOS = [
    ListarTicketsUseCase,
    CrearComentarioUseCase,
    ListarTiposTicketUseCase,
    ListarPrioridadesUseCase,
    ListarEstadosUseCase,
  ];

  it.each(COMPARTIDOS.map((c) => [c.name, c] as const))(
    '%s: lo exporta TicketsModule y ApiV1Module no lo provee',
    (_nombre, casoDeUso) => {
      expect(metadata<unknown>(MODULE_METADATA.EXPORTS, TicketsModule)).toContain(casoDeUso);
      const providers = metadata<Provider>(MODULE_METADATA.PROVIDERS);
      expect(providers.some((p) => token(p) === casoDeUso)).toBe(false);
    },
  );
});

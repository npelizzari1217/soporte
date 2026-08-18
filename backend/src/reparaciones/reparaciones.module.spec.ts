/**
 * reparaciones.module.spec.ts — T9.7: wiring de `ReparacionesModule`.
 *
 * Inspecciona la metadata del decorador `@Module()` directamente (sin
 * compilar el árbol de módulos ni requerir DB) — mismo patrón que
 * `compras.module.spec.ts`. Verifica que el controller esté registrado y
 * que `TicketsModule` esté importado (reuso de providers, ADR-3).
 *
 * Tarea: T9.7.
 */
import 'reflect-metadata';
import { ReparacionesModule } from './reparaciones.module';
import { ReparacionesController } from './interface/controllers/reparaciones.controller';
import { TicketsModule } from '../tickets/tickets.module';
import { TICKET_EDILICIA_REPOSITORY } from './domain/ports/i-ticket-edilicia.repository';
import { SUBTAREA_EDILICIA_REPOSITORY } from './domain/ports/i-subtarea-edilicia.repository';
import { COMENTARIO_REPARACION_REPOSITORY } from './domain/ports/i-comentario-reparacion.repository';
import { CrearComentarioReparacionUseCase } from './application/use-cases/crear-comentario-reparacion.use-case';
import { ListarComentariosReparacionUseCase } from './application/use-cases/listar-comentarios-reparacion.use-case';

describe('ReparacionesModule wiring (T9.7)', () => {
  it('registra ReparacionesController', () => {
    const controllers = (Reflect.getMetadata('controllers', ReparacionesModule) ?? []) as unknown[];
    expect(controllers).toContain(ReparacionesController);
  });

  it('importa TicketsModule (reusa providers exportados, ADR-3)', () => {
    const imports = (Reflect.getMetadata('imports', ReparacionesModule) ?? []) as unknown[];
    expect(imports).toContain(TicketsModule);
  });

  it.each([
    TICKET_EDILICIA_REPOSITORY,
    SUBTAREA_EDILICIA_REPOSITORY,
    COMENTARIO_REPARACION_REPOSITORY,
  ])('%s está exportado', (token) => {
    const exportsList = (Reflect.getMetadata('exports', ReparacionesModule) ?? []) as unknown[];
    expect(exportsList).toContain(token);
  });

  it.each([CrearComentarioReparacionUseCase, ListarComentariosReparacionUseCase])(
    '%p está provisto (los use cases se cablean a mano, sin @Injectable)',
    (useCase) => {
      const providers = (Reflect.getMetadata('providers', ReparacionesModule) ?? []) as {
        provide?: unknown;
      }[];
      expect(providers.some((p) => p.provide === useCase)).toBe(true);
    },
  );
});

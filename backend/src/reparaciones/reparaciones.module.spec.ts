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
import { TicketComprasController } from './interface/controllers/ticket-compras.controller';
import { TicketsModule } from '../tickets/tickets.module';
import { CrearComentarioUseCase } from '../tickets/application/use-cases/crear-comentario.use-case';
import { ListarComentariosReparacionUseCase } from './application/use-cases/listar-comentarios-reparacion.use-case';
import { ListarComprasDeTicketUseCase } from './application/use-cases/listar-compras-de-ticket.use-case';

describe('ReparacionesModule wiring (T9.7)', () => {
  it('registra ReparacionesController y TicketComprasController (odd/ticket-unificado)', () => {
    const controllers = (Reflect.getMetadata('controllers', ReparacionesModule) ?? []) as unknown[];
    expect(controllers).toEqual([ReparacionesController, TicketComprasController]);
  });

  it('importa TicketsModule (reusa providers exportados, ADR-3)', () => {
    const imports = (Reflect.getMetadata('imports', ReparacionesModule) ?? []) as unknown[];
    expect(imports).toContain(TicketsModule);
  });

  it('no exporta nada: el PDF toma la ubicación del ticket y los comentarios son del timeline (odd/ticket-unificado, T4a)', () => {
    const exportsList = (Reflect.getMetadata('exports', ReparacionesModule) ?? []) as unknown[];
    expect(exportsList).toEqual([]);
  });

  it('crear un comentario no tiene fábrica propia: usa el CrearComentarioUseCase que exporta TicketsModule (T2b, L19)', () => {
    const providers = (Reflect.getMetadata('providers', ReparacionesModule) ?? []) as {
      provide?: unknown;
    }[];
    const exportadosDeTickets = (Reflect.getMetadata('exports', TicketsModule) ?? []) as unknown[];
    expect(providers.some((p) => p.provide === CrearComentarioUseCase)).toBe(false);
    expect(exportadosDeTickets).toContain(CrearComentarioUseCase);
  });

  it.each([ListarComentariosReparacionUseCase, ListarComprasDeTicketUseCase])(
    '%p está provisto (los use cases se cablean a mano, sin @Injectable)',
    (useCase) => {
      const providers = (Reflect.getMetadata('providers', ReparacionesModule) ?? []) as {
        provide?: unknown;
      }[];
      expect(providers.some((p) => p.provide === useCase)).toBe(true);
    },
  );
});

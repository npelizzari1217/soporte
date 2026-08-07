/**
 * reparaciones.module.spec.ts — T9.7: wiring de `ReparacionesModule`.
 *
 * Inspecciona la metadata del decorador `@Module()` directamente (sin
 * compilar el árbol de módulos ni requerir DB) — mismo patrón que
 * `compras.module.spec.ts`. Verifica que ambos controllers estén
 * registrados y que `TicketsModule` esté importado (reuso de providers,
 * ADR-3).
 *
 * Tarea: T9.7.
 */
import 'reflect-metadata';
import { ReparacionesModule } from './reparaciones.module';
import { ReparacionesController } from './interface/controllers/reparaciones.controller';
import { UbicacionesController } from './interface/controllers/ubicaciones.controller';
import { TicketsModule } from '../tickets/tickets.module';
import { TICKET_EDILICIA_REPOSITORY } from './domain/ports/i-ticket-edilicia.repository';
import { SUBTAREA_EDILICIA_REPOSITORY } from './domain/ports/i-subtarea-edilicia.repository';
import { UBICACION_REPOSITORY } from './domain/ports/i-ubicacion.repository';

describe('ReparacionesModule wiring (T9.7)', () => {
  it('registra ReparacionesController y UbicacionesController', () => {
    const controllers = (Reflect.getMetadata('controllers', ReparacionesModule) ?? []) as unknown[];
    expect(controllers).toContain(ReparacionesController);
    expect(controllers).toContain(UbicacionesController);
  });

  it('importa TicketsModule (reusa providers exportados, ADR-3)', () => {
    const imports = (Reflect.getMetadata('imports', ReparacionesModule) ?? []) as unknown[];
    expect(imports).toContain(TicketsModule);
  });

  it.each([TICKET_EDILICIA_REPOSITORY, SUBTAREA_EDILICIA_REPOSITORY, UBICACION_REPOSITORY])(
    '%s está exportado',
    (token) => {
      const exportsList = (Reflect.getMetadata('exports', ReparacionesModule) ?? []) as unknown[];
      expect(exportsList).toContain(token);
    },
  );
});

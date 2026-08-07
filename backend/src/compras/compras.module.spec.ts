/**
 * compras.module.spec.ts — T5.8: wiring de `ComprasModule`.
 *
 * Inspecciona la metadata del decorador `@Module()` directamente (sin
 * compilar el árbol de módulos ni requerir DB) — mismo patrón que
 * `auth.module.spec.ts`. Verifica que `ComprasController` esté registrado
 * y que `TicketsModule` esté importado (reuso de providers, ADR-3).
 *
 * Tarea: T5.8.
 */
import 'reflect-metadata';
import { ComprasModule } from './compras.module';
import { ComprasController } from './interface/controllers/compras.controller';
import { TicketsModule } from '../tickets/tickets.module';
import { TICKET_COMPRA_REPOSITORY } from './domain/ports/i-ticket-compra.repository';
import { ITEM_COMPRA_REPOSITORY } from './domain/ports/i-item-compra.repository';
import { PRESUPUESTO_REPOSITORY } from './domain/ports/i-presupuesto.repository';

describe('ComprasModule wiring (T5.8)', () => {
  it('registra ComprasController', () => {
    const controllers = (Reflect.getMetadata('controllers', ComprasModule) ?? []) as unknown[];
    expect(controllers).toContain(ComprasController);
  });

  it('importa TicketsModule (reusa providers exportados, ADR-3)', () => {
    const imports = (Reflect.getMetadata('imports', ComprasModule) ?? []) as unknown[];
    expect(imports).toContain(TicketsModule);
  });

  it.each([TICKET_COMPRA_REPOSITORY, ITEM_COMPRA_REPOSITORY, PRESUPUESTO_REPOSITORY])(
    '%s está exportado',
    (token) => {
      const exportsList = (Reflect.getMetadata('exports', ComprasModule) ?? []) as unknown[];
      expect(exportsList).toContain(token);
    },
  );
});

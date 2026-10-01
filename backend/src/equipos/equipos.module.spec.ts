/**
 * equipos.module.spec.ts — T13.7: wiring de `EquiposModule`.
 *
 * Inspecciona la metadata del decorador `@Module()` directamente (sin
 * compilar el árbol de módulos ni requerir DB) — mismo patrón que
 * `compras.module.spec.ts`/`reparaciones.module.spec.ts`. Verifica que
 * `EquiposController` y `SoporteController` estén registrados, que
 * `TicketsModule` esté importado (reuso de providers — ADR-3), y que
 * los 3 repos de dominio estén exportados (PR4b: `TIPO_COMPONENTE_REPOSITORY`
 * tenant se eliminó — el catálogo ahora se lee desde MASTER).
 *
 * Tarea: T13.7.
 */
import 'reflect-metadata';
import { EquiposModule } from './equipos.module';
import { EquiposController } from './interface/controllers/equipos.controller';
import { SoporteController } from './interface/controllers/soporte.controller';
import { TicketsModule } from '../tickets/tickets.module';
import { InsumosModule } from '../insumos/insumos.module';
import { EQUIPO_INFORMATICO_REPOSITORY } from './domain/ports/i-equipo-informatico.repository';
import { COMPONENTE_EQUIPO_REPOSITORY } from './domain/ports/i-componente-equipo.repository';
import { TICKET_SOPORTE_REPOSITORY } from './domain/ports/i-ticket-soporte.repository';
import { DarDeBajaEquipoUseCase } from './application/use-cases/dar-de-baja-equipo.use-case';
import { RegistrarEntradaInsumoUseCase } from '../insumos/application/use-cases/registrar-entrada-insumo.use-case';
import { OperacionesUnidadInsumo } from '../insumos/application/services/operaciones-unidad-insumo.service';
import { TENANT_TX_RUNNER } from '../shared/infrastructure/persistence/tenant-transaction-runner';

describe('EquiposModule wiring (T13.7)', () => {
  it('registra EquiposController y SoporteController', () => {
    const controllers = (Reflect.getMetadata('controllers', EquiposModule) ?? []) as unknown[];
    expect(controllers).toContain(EquiposController);
    expect(controllers).toContain(SoporteController);
  });

  it('importa TicketsModule (reusa providers exportados, ADR-3)', () => {
    const imports = (Reflect.getMetadata('imports', EquiposModule) ?? []) as unknown[];
    expect(imports).toContain(TicketsModule);
  });

  /**
   * `CrearEquipoUseCase`/`EditarEquipoUseCase` validan `modeloEquipoId` contra
   * el catálogo, así que necesitan `MODELO_EQUIPO_REPOSITORY`, que exporta
   * `InsumosModule`. Sin el import, el módulo no levanta.
   */
  it('importa InsumosModule (provee MODELO_EQUIPO_REPOSITORY)', () => {
    const imports = (Reflect.getMetadata('imports', EquiposModule) ?? []) as unknown[];
    expect(imports).toContain(InsumosModule);
  });

  it.each([EQUIPO_INFORMATICO_REPOSITORY, COMPONENTE_EQUIPO_REPOSITORY, TICKET_SOPORTE_REPOSITORY])(
    '%s está exportado',
    (token) => {
      const exportsList = (Reflect.getMetadata('exports', EquiposModule) ?? []) as unknown[];
      expect(exportsList).toContain(token);
    },
  );

  /**
   * sdd/baja-equipo-completo (ADR-3): la baja compone la devolucion en lote de stock, las
   * operaciones de unidad y el runner transaccional; sin esas cinco dependencias no levanta.
   */
  it('registra DarDeBajaEquipoUseCase con runner, repos de equipos y servicios de insumos', () => {
    const providers = (Reflect.getMetadata('providers', EquiposModule) ?? []) as {
      provide?: unknown;
      inject?: unknown[];
    }[];
    const proveedor = providers.find((p) => p.provide === DarDeBajaEquipoUseCase);
    expect(proveedor?.inject).toEqual([
      TENANT_TX_RUNNER,
      EQUIPO_INFORMATICO_REPOSITORY,
      COMPONENTE_EQUIPO_REPOSITORY,
      RegistrarEntradaInsumoUseCase,
      OperacionesUnidadInsumo,
    ]);
  });
});

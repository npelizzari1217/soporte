/**
 * insumos.module.spec.ts — wiring de `InsumosModule`. Inspecciona la metadata
 * del decorador `@Module()` directamente (sin compilar el árbol de módulos ni
 * requerir DB) — mismo patrón que `sectores.module.spec.ts`. El grafo DI REAL
 * (con los `useFactory` reales) lo cubre `app.module.smoke.spec.ts`.
 */
import 'reflect-metadata';
import { InsumosModule } from './insumos.module';
import { FamiliasInsumoController } from './interface/controllers/familias-insumo.controller';
import { UnidadesMedidaController } from './interface/controllers/unidades-medida.controller';
import { ModelosEquipoController } from './interface/controllers/modelos-equipo.controller';
import { InsumosController } from './interface/controllers/insumos.controller';
import { AuthModule } from '../auth/auth.module';
import { FAMILIA_INSUMO_REPOSITORY } from './domain/ports/i-familia-insumo.repository';
import { UNIDAD_MEDIDA_REPOSITORY } from './domain/ports/i-unidad-medida.repository';
import { MODELO_EQUIPO_REPOSITORY } from './domain/ports/i-modelo-equipo.repository';
import { INSUMO_REPOSITORY } from './domain/ports/i-insumo.repository';
import { CrearInsumoUseCase } from './application/use-cases/crear-insumo.use-case';
import { EditarInsumoUseCase } from './application/use-cases/editar-insumo.use-case';
import { CambiarEstadoActivoInsumoUseCase } from './application/use-cases/cambiar-estado-activo-insumo.use-case';
import { ListarInsumosUseCase } from './application/use-cases/listar-insumos.use-case';

describe('InsumosModule wiring', () => {
  it('registra los controllers de los tres catálogos y el del insumo', () => {
    const controllers = (Reflect.getMetadata('controllers', InsumosModule) ?? []) as unknown[];
    expect(controllers).toContain(FamiliasInsumoController);
    expect(controllers).toContain(UnidadesMedidaController);
    expect(controllers).toContain(ModelosEquipoController);
    expect(controllers).toContain(InsumosController);
  });

  it('importa AuthModule (guards JwtAuthGuard/TenantGuard/AdminClienteGuard)', () => {
    const imports = (Reflect.getMetadata('imports', InsumosModule) ?? []) as unknown[];
    expect(imports).toContain(AuthModule);
  });

  // Los cuatro puertos se exportan: los tres catálogos porque el ABM de
  // `Insumo` los consume, e `INSUMO_REPOSITORY` porque los movimientos de
  // existencias (Entrega 2) van a resolver el insumo desde su propio módulo.
  it.each([
    ['FAMILIA_INSUMO_REPOSITORY', FAMILIA_INSUMO_REPOSITORY],
    ['UNIDAD_MEDIDA_REPOSITORY', UNIDAD_MEDIDA_REPOSITORY],
    ['MODELO_EQUIPO_REPOSITORY', MODELO_EQUIPO_REPOSITORY],
    ['INSUMO_REPOSITORY', INSUMO_REPOSITORY],
  ])('provee %s y lo exporta', (_nombre, token) => {
    const providers = (Reflect.getMetadata('providers', InsumosModule) ?? []) as Array<{
      provide?: unknown;
    }>;
    expect(providers.map((p) => p.provide)).toContain(token);

    const exportsMeta = (Reflect.getMetadata('exports', InsumosModule) ?? []) as unknown[];
    expect(exportsMeta).toContain(token);
  });

  /**
   * Los cuatro casos de uso del insumo se registran con `useFactory`, no como
   * clases: sus constructores reciben PUERTOS —tokens de inyección— y NestJS
   * no puede resolverlos por metadata de tipo. Sin este assert, un caso de uso
   * que se quede afuera del módulo se descubre recién cuando el endpoint
   * devuelve 500.
   */
  it.each([
    ['CrearInsumoUseCase', CrearInsumoUseCase],
    ['EditarInsumoUseCase', EditarInsumoUseCase],
    ['CambiarEstadoActivoInsumoUseCase', CambiarEstadoActivoInsumoUseCase],
    ['ListarInsumosUseCase', ListarInsumosUseCase],
  ])('provee %s', (_nombre, useCase) => {
    const providers = (Reflect.getMetadata('providers', InsumosModule) ?? []) as Array<{
      provide?: unknown;
    }>;
    expect(providers.map((p) => p.provide)).toContain(useCase);
  });
});

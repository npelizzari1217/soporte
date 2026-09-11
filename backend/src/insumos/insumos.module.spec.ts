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
import { MovimientosInsumoController } from './interface/controllers/movimientos-insumo.controller';
import { AuthModule } from '../auth/auth.module';
import { FAMILIA_INSUMO_REPOSITORY } from './domain/ports/i-familia-insumo.repository';
import { UNIDAD_MEDIDA_REPOSITORY } from './domain/ports/i-unidad-medida.repository';
import { MODELO_EQUIPO_REPOSITORY } from './domain/ports/i-modelo-equipo.repository';
import { INSUMO_REPOSITORY } from './domain/ports/i-insumo.repository';
import { MOVIMIENTO_INSUMO_REPOSITORY } from './domain/ports/i-movimiento-insumo.repository';
import { CrearInsumoUseCase } from './application/use-cases/crear-insumo.use-case';
import { EditarInsumoUseCase } from './application/use-cases/editar-insumo.use-case';
import { CambiarEstadoActivoInsumoUseCase } from './application/use-cases/cambiar-estado-activo-insumo.use-case';
import { ListarInsumosUseCase } from './application/use-cases/listar-insumos.use-case';
import { ListarInsumosPorModeloEquipoUseCase } from './application/use-cases/listar-insumos-por-modelo-equipo.use-case';
import { RegistrarEntradaInsumoUseCase } from './application/use-cases/registrar-entrada-insumo.use-case';
import { RegistrarSalidaInsumoUseCase } from './application/use-cases/registrar-salida-insumo.use-case';
import { RegistrarAjusteInsumoUseCase } from './application/use-cases/registrar-ajuste-insumo.use-case';
import { ConsultarStockInsumoUseCase } from './application/use-cases/consultar-stock-insumo.use-case';
import { ListarMovimientosInsumoUseCase } from './application/use-cases/listar-movimientos-insumo.use-case';

describe('InsumosModule wiring', () => {
  it('registra los controllers de los tres catálogos, el del insumo y el de los movimientos', () => {
    const controllers = (Reflect.getMetadata('controllers', InsumosModule) ?? []) as unknown[];
    expect(controllers).toContain(FamiliasInsumoController);
    expect(controllers).toContain(UnidadesMedidaController);
    expect(controllers).toContain(ModelosEquipoController);
    expect(controllers).toContain(InsumosController);
    expect(controllers).toContain(MovimientosInsumoController);
  });

  it('importa AuthModule (guards JwtAuthGuard/TenantGuard/AdminClienteGuard)', () => {
    const imports = (Reflect.getMetadata('imports', InsumosModule) ?? []) as unknown[];
    expect(imports).toContain(AuthModule);
  });

  /**
   * El puerto de la bitácora se provee pero NO se exporta, a diferencia de los
   * otros cuatro: sus únicos consumidores son los cinco casos de uso de este
   * mismo módulo. Exportarlo abriría un segundo camino de escritura a
   * `movimientos_insumo` desde afuera, y la invariante del stock depende de que
   * toda escritura pase por el único punto que toma el advisory lock — Postgres
   * no puede expresar `SUM(cantidad) >= 0`, así que no hay backstop de base que
   * atrape esa fuga.
   */
  it('provee MOVIMIENTO_INSUMO_REPOSITORY sin exportarlo', () => {
    const providers = (Reflect.getMetadata('providers', InsumosModule) ?? []) as Array<{
      provide?: unknown;
    }>;
    expect(providers.map((p) => p.provide)).toContain(MOVIMIENTO_INSUMO_REPOSITORY);

    const exportsMeta = (Reflect.getMetadata('exports', InsumosModule) ?? []) as unknown[];
    expect(exportsMeta).not.toContain(MOVIMIENTO_INSUMO_REPOSITORY);
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
   * `RegistrarEntradaInsumoUseCase` es el ÚNICO caso de uso que sale del
   * módulo (insumos-entrega-3, unidad 5): lo consume `ComprasModule` para que
   * recibir una compra sume el stock solo. Se exporta el caso de uso —con sus
   * guards de elegibilidad puestos— y no el puerto de la bitácora, por el
   * mismo motivo del test de arriba.
   */
  it('exporta RegistrarEntradaInsumoUseCase, que es lo que consume ComprasModule', () => {
    const exportsMeta = (Reflect.getMetadata('exports', InsumosModule) ?? []) as unknown[];
    expect(exportsMeta).toContain(RegistrarEntradaInsumoUseCase);
  });

  /**
   * WU-4 (sdd/repuestos-instalar-desde-deposito, issue #153):
   * `RegistrarSalidaInsumoUseCase` se suma como SEGUNDO caso de uso exportado
   * —lo consume `EquiposModule` para que instalar un repuesto del depósito
   * descuente stock y cree el componente en una sola transacción
   * (`InstalarComponenteDesdeDepositoUseCase`). Mismo criterio que la
   * entrada: se exporta el caso de uso, con su advisory lock y su validación
   * de stock ya puestos, nunca el puerto de la bitácora.
   */
  it('exporta RegistrarSalidaInsumoUseCase, que es lo que consume EquiposModule (WU-4, issue #153)', () => {
    const exportsMeta = (Reflect.getMetadata('exports', InsumosModule) ?? []) as unknown[];
    expect(exportsMeta).toContain(RegistrarSalidaInsumoUseCase);
  });

  // Hermano invertido de los dos de arriba: los otros dos casos de uso de
  // existencias NO cruzan el borde del módulo. Sin este caso, exportar el
  // módulo entero dejaría los tests de arriba en verde, y el ajuste —que
  // también depende del advisory lock— quedaría al alcance de cualquiera.
  it.each([
    ['RegistrarAjusteInsumoUseCase', RegistrarAjusteInsumoUseCase],
    ['ConsultarStockInsumoUseCase', ConsultarStockInsumoUseCase],
    ['ListarMovimientosInsumoUseCase', ListarMovimientosInsumoUseCase],
  ])('NO exporta %s', (_nombre, useCase) => {
    const exportsMeta = (Reflect.getMetadata('exports', InsumosModule) ?? []) as unknown[];
    expect(exportsMeta).not.toContain(useCase);
  });

  /**
   * Los casos de uso se registran con `useFactory`, no como clases: sus
   * constructores reciben PUERTOS —tokens de inyección— y NestJS no puede
   * resolverlos por metadata de tipo. Sin este assert, un caso de uso que se
   * quede afuera del módulo se descubre recién cuando el endpoint devuelve 500.
   */
  it.each([
    ['CrearInsumoUseCase', CrearInsumoUseCase],
    ['EditarInsumoUseCase', EditarInsumoUseCase],
    ['CambiarEstadoActivoInsumoUseCase', CambiarEstadoActivoInsumoUseCase],
    ['ListarInsumosUseCase', ListarInsumosUseCase],
    ['ListarInsumosPorModeloEquipoUseCase', ListarInsumosPorModeloEquipoUseCase],
    ['RegistrarEntradaInsumoUseCase', RegistrarEntradaInsumoUseCase],
    ['RegistrarSalidaInsumoUseCase', RegistrarSalidaInsumoUseCase],
    ['RegistrarAjusteInsumoUseCase', RegistrarAjusteInsumoUseCase],
    ['ConsultarStockInsumoUseCase', ConsultarStockInsumoUseCase],
    ['ListarMovimientosInsumoUseCase', ListarMovimientosInsumoUseCase],
  ])('provee %s', (_nombre, useCase) => {
    const providers = (Reflect.getMetadata('providers', InsumosModule) ?? []) as Array<{
      provide?: unknown;
    }>;
    expect(providers.map((p) => p.provide)).toContain(useCase);
  });

  /**
   * El `inject` de cada factory se assertea aparte del `provide` porque son dos
   * fallas distintas y solo una la ve el smoke del grafo DI: un token que falta
   * revienta al arrancar, pero un token de MÁS o en el ORDEN equivocado
   * construye igual y le entrega al caso de uso un colaborador que no es el
   * que su constructor espera.
   *
   * La asimetría entre los tres registros es la decisión de diseño, no un
   * descuido: la ENTRADA no recibe el `TENANT_TX_RUNNER` porque suma y no
   * decide nada bajo la sección crítica, mientras que la SALIDA y el AJUSTE lo
   * reciben porque pueden dejar el saldo negativo. Si la entrada empezara a
   * recibirlo, el `Pick` angosto de su constructor dejaría de ser el mecanismo
   * que le impide tomar el lock por descuido.
   */
  it.each([
    ['RegistrarEntradaInsumoUseCase', RegistrarEntradaInsumoUseCase, 2],
    ['RegistrarSalidaInsumoUseCase', RegistrarSalidaInsumoUseCase, 3],
    ['RegistrarAjusteInsumoUseCase', RegistrarAjusteInsumoUseCase, 3],
    ['ConsultarStockInsumoUseCase', ConsultarStockInsumoUseCase, 2],
    ['ListarMovimientosInsumoUseCase', ListarMovimientosInsumoUseCase, 2],
  ])('inyecta en %s los puertos que su constructor declara', (_nombre, useCase, cantidad) => {
    const providers = (Reflect.getMetadata('providers', InsumosModule) ?? []) as Array<{
      provide?: unknown;
      inject?: unknown[];
    }>;
    const registro = providers.find((p) => p.provide === useCase);

    expect(registro?.inject).toHaveLength(cantidad);
    expect(registro?.inject?.[0]).toBe(INSUMO_REPOSITORY);
    expect(registro?.inject?.[1]).toBe(MOVIMIENTO_INSUMO_REPOSITORY);
  });
});

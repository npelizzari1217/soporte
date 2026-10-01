/**
 * [INTEGRATION] R16 de baja-equipo-completo: un insumo `SERIE` con una unidad `INSTALADA` no puede
 * volver a `NINGUNO`, así que una baja posterior encuentra siempre un insumo `SERIE`. Contra
 * Postgres real, con el wiring y la unidad `INSTALADA` de `BajaEquipoFixtures` (`soporte_tenant_test`
 * con PREFIJO por corrida). No toca `soporte_master_test`.
 *
 * El spec unitario ya cubre la regla con fakes; este caso la fija con la base real y el equipo.
 */
import { BajaEquipoFixtures } from '../../../equipos/testing/baja-equipo.fixtures';
import { PrismaUnidadMedidaRepository } from '../../infrastructure/persistence/prisma/prisma-unidad-medida.repository';
import { SeguimientoNoModificableError } from '../../domain/errors/unidades-insumo.errors';
import { CambiarSeguimientoInsumoUseCase } from './cambiar-seguimiento-insumo.use-case';

describe('CambiarSeguimientoInsumo SERIE -> NINGUNO con unidad INSTALADA — Integration (R16)', () => {
  let fx: BajaEquipoFixtures;
  let cambiar: CambiarSeguimientoInsumoUseCase;

  beforeAll(async () => {
    fx = await BajaEquipoFixtures.crear();
    cambiar = new CambiarSeguimientoInsumoUseCase(
      fx.insumoRepo,
      new PrismaUnidadMedidaRepository(fx.tenantContext),
      fx.movimientoRepo,
      fx.unidadRepo,
      fx.txRunner,
    );
  }, 30_000);

  afterAll(async () => {
    await fx.cerrar();
  }, 30_000);

  beforeEach(() => fx.limpiar());

  it('se rechaza el cambio, el insumo sigue SERIE y la baja posterior descarta la unidad', async () => {
    const equipo = await fx.crearEquipo('PC-R16');
    const { unidadId } = await fx.agregarUnidadInstalada(equipo.id, 'S1');

    const result = await fx.conTenant(() =>
      cambiar.execute({ insumoId: fx.serieId, seguimiento: 'NINGUNO' }),
    );

    expect(result.getError()).toBeInstanceOf(SeguimientoNoModificableError);
    const insumo = await fx.tenantClient.insumo.findUniqueOrThrow({ where: { id: fx.serieId } });
    expect(insumo.seguimiento).toBe('SERIE');
    expect(
      (await fx.tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: unidadId } })).estado,
    ).toBe('INSTALADA');

    const baja = await fx.conTenant(() =>
      fx.useCase.execute({
        equipoId: equipo.id,
        destino: 'DESCARTE',
        categoria: 'VEJEZ',
        usuarioId: fx.usuarioId,
      }),
    );
    expect(baja.isOk()).toBe(true);
    expect(
      (await fx.tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: unidadId } })).estado,
    ).toBe('DESCARTADA');
    expect(await fx.exigirInvarianteSerie()).toEqual([]);
  }, 30_000);
});

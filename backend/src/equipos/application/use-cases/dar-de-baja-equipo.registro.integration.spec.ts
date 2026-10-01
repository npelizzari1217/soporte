/**
 * [INTEGRATION] El registro de la baja del equipo y sus casos de borde contra Postgres real
 * (baja-equipo-completo, R8 y R9): datos de la baja, ninguna pieza viva después, equipo sin
 * piezas, segunda baja y equipo con borrado lógico. Wiring real sobre `soporte_tenant_test` con
 * PREFIJO por corrida (`BajaEquipoFixtures`). No toca `soporte_master_test`.
 */
import { EquipoDadoDeBajaError, EquipoNoEncontradoError } from '../../domain/errors/equipos.errors';
import { BajaEquipoFixtures } from '../../testing/baja-equipo.fixtures';

describe('DarDeBajaEquipo — registro y casos de borde — Integration', () => {
  let fx: BajaEquipoFixtures;

  beforeAll(async () => {
    fx = await BajaEquipoFixtures.crear();
  }, 30_000);

  afterAll(async () => {
    await fx.cerrar();
  }, 30_000);

  beforeEach(() => fx.limpiar());

  afterEach(async () => {
    expect(await fx.exigirInvarianteSerie()).toEqual([]);
  });

  const darDeBaja = (equipoId: string, destino: string, categoria = 'VEJEZ', motivo?: string) =>
    fx.conTenant(() =>
      fx.useCase.execute({ equipoId, destino, categoria, motivo, usuarioId: fx.usuarioId }),
    );

  it('el equipo queda activo = false con destino, categoría, texto, fecha y usuario', async () => {
    const equipo = await fx.crearEquipo('PC-1');
    await fx.agregarComponente(equipo.id, fx.ningunoId);
    const antes = Date.now();

    const result = await darDeBaja(equipo.id, 'DESCARTE', 'ROTURA', 'no enciende');

    expect(result.isOk()).toBe(true);
    const fila = await fx.tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipo.id },
    });
    expect(fila).toMatchObject({
      activo: false,
      bajaDestino: 'DESCARTE',
      bajaCategoria: 'ROTURA',
      bajaMotivo: 'no enciende',
      bajaUsuarioId: fx.usuarioId,
    });
    expect(fila.bajaFecha).not.toBeNull();
    expect((fila.bajaFecha as Date).getTime()).toBeGreaterThanOrEqual(antes - 5_000);
  }, 30_000);

  it.each(['STOCK_USADO', 'DESCARTE'])(
    'con dos unidades INSTALADA y destino %s no queda ninguna INSTALADA ni componente activo',
    async (destino) => {
      const equipo = await fx.crearEquipo('PC-2');
      await fx.agregarUnidadInstalada(equipo.id, 'S1');
      await fx.agregarUnidadInstalada(equipo.id, 'S2');
      await fx.agregarComponente(equipo.id, fx.ningunoId);

      const result = await darDeBaja(equipo.id, destino);

      expect(result.isOk()).toBe(true);
      expect(
        await fx.tenantClient.unidadInsumo.count({
          where: { equipoId: equipo.id, estado: 'INSTALADA' },
        }),
      ).toBe(0);
      expect(
        await fx.tenantClient.componenteEquipo.count({
          where: { equipoId: equipo.id, deletedAt: null },
        }),
      ).toBe(0);
    },
    30_000,
  );

  it('un equipo sin piezas solo cambia el equipo: ni movimientos ni eventos', async () => {
    const equipo = await fx.crearEquipo('PC-3');
    const antes = await fx.foto();

    const result = await darDeBaja(equipo.id, 'STOCK_USADO');

    expect(result.isOk()).toBe(true);
    const despues = await fx.foto();
    expect(despues.movimientos).toBe(antes.movimientos);
    expect(despues.eventos).toBe(antes.eventos);
    expect(despues.unidades).toEqual(antes.unidades);
    const fila = await fx.tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipo.id },
    });
    expect(fila).toMatchObject({ activo: false, bajaDestino: 'STOCK_USADO' });
  }, 30_000);

  it('un equipo con todas las piezas ya retiradas solo cambia el equipo', async () => {
    const equipo = await fx.crearEquipo('PC-4');
    await fx.tenantClient.componenteEquipo.create({
      data: {
        equipoId: equipo.id,
        insumoId: fx.ningunoId,
        deletedAt: new Date('2026-01-01T00:00:00Z'),
        bajaDestino: 'DESCARTE',
        bajaMotivo: 'retiro previo',
        bajaUsuarioId: fx.usuarioId,
      },
    });
    const antes = await fx.foto();

    const result = await darDeBaja(equipo.id, 'STOCK_USADO');

    expect(result.isOk()).toBe(true);
    const despues = await fx.foto();
    expect(despues.movimientos).toBe(antes.movimientos);
    expect(despues.eventos).toBe(antes.eventos);
    expect(despues.componentes).toEqual(antes.componentes);
    expect(
      (await fx.tenantClient.equipoInformatico.findUniqueOrThrow({ where: { id: equipo.id } }))
        .activo,
    ).toBe(false);
  }, 30_000);

  it('una segunda baja devuelve EquipoDadoDeBajaError y los datos originales no cambian', async () => {
    const equipo = await fx.crearEquipo('PC-5');
    await fx.agregarComponente(equipo.id, fx.ningunoId);
    expect((await darDeBaja(equipo.id, 'DESCARTE', 'ROTURA', 'primera')).isOk()).toBe(true);
    const original = await fx.tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipo.id },
    });
    const antes = await fx.foto();

    const result = await darDeBaja(equipo.id, 'STOCK_USADO', 'VEJEZ', 'segunda');

    expect(result.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
    expect(
      await fx.tenantClient.equipoInformatico.findUniqueOrThrow({ where: { id: equipo.id } }),
    ).toEqual(original);
    expect(await fx.foto()).toEqual(antes);
  }, 30_000);

  it('un equipo con borrado lógico se trata como no encontrado y no cambia', async () => {
    const equipo = await fx.crearEquipo('PC-6');
    await fx.tenantClient.equipoInformatico.update({
      where: { id: equipo.id },
      data: { deletedAt: new Date() },
    });
    const antes = await fx.foto();

    const result = await darDeBaja(equipo.id, 'DESCARTE');

    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
    expect(await fx.foto()).toEqual(antes);
    expect(
      (await fx.tenantClient.equipoInformatico.findUniqueOrThrow({ where: { id: equipo.id } }))
        .activo,
    ).toBe(true);
  }, 30_000);
});

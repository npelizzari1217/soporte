/**
 * [INTEGRATION] Baja de equipo completo, opción A (`STOCK_USADO`), contra Postgres real
 * (baja-equipo-completo, R2 y R5). Wiring real sobre `soporte_tenant_test` con PREFIJO por corrida
 * (`BajaEquipoFixtures`); el invariante `SERIE` se verifica tras cada caso. No toca
 * `soporte_master_test`, así que no necesita `usarLockMasterTest()`.
 */
import { BajaEquipoFixtures } from '../../testing/baja-equipo.fixtures';

describe('DarDeBajaEquipo — opción A STOCK_USADO — Integration', () => {
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

  const darDeBaja = (equipoId: string, extra: { categoria?: string; motivo?: string } = {}) =>
    fx.conTenant(() =>
      fx.useCase.execute({
        equipoId,
        destino: 'STOCK_USADO',
        categoria: extra.categoria ?? 'VEJEZ',
        motivo: extra.motivo,
        usuarioId: fx.usuarioId,
      }),
    );

  it('un componente NINGUNO vuelve como ENTRADA USADO con equipoId y leyenda, y queda enlazado a ella', async () => {
    const equipo = await fx.crearEquipo('PC-1');
    const componenteId = await fx.agregarComponente(equipo.id, fx.ningunoId);
    expect(await fx.saldos(fx.ningunoId)).toEqual({ NUEVO: 0, USADO: 0 });
    const leyenda = `Baja del equipo «${equipo.nombre}» — Vejez`;

    const result = await darDeBaja(equipo.id);

    expect(result.isOk()).toBe(true);
    const entradas = await fx.tenantClient.movimientoInsumo.findMany({
      where: { insumoId: fx.ningunoId },
    });
    expect(entradas).toHaveLength(1);
    expect(entradas[0]).toMatchObject({
      tipo: 'ENTRADA',
      condicion: 'USADO',
      equipoId: equipo.id,
      motivo: leyenda,
    });
    expect(Number(entradas[0].cantidad)).toBe(1);
    expect(await fx.saldos(fx.ningunoId)).toEqual({ NUEVO: 0, USADO: 1 });
    const componente = await fx.tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componenteId },
    });
    expect(componente.deletedAt).not.toBeNull();
    expect(componente).toMatchObject({
      bajaDestino: 'STOCK_USADO',
      bajaMovimientoId: entradas[0].id,
    });
  }, 30_000);

  it('dos componentes del mismo insumo NINGUNO generan dos ENTRADAs y el saldo USADO sube 2', async () => {
    const equipo = await fx.crearEquipo('PC-2');
    const c1 = await fx.agregarComponente(equipo.id, fx.ningunoId);
    const c2 = await fx.agregarComponente(equipo.id, fx.ningunoId);

    const result = await darDeBaja(equipo.id);

    expect(result.isOk()).toBe(true);
    const entradas = await fx.tenantClient.movimientoInsumo.findMany({
      where: { insumoId: fx.ningunoId, tipo: 'ENTRADA', condicion: 'USADO' },
    });
    expect(entradas).toHaveLength(2);
    const componentes = await fx.tenantClient.componenteEquipo.findMany({
      where: { id: { in: [c1, c2] } },
    });
    expect(componentes.map((c) => c.bajaMovimientoId).sort()).toEqual(
      entradas.map((e) => e.id).sort(),
    );
    expect(await fx.saldos(fx.ningunoId)).toEqual({ NUEVO: 0, USADO: 2 });
  }, 30_000);

  it('una unidad SERIE INSTALADA pasa a EN_DEPOSITO USADO sin equipo, con evento RETIRO_A_DEPOSITO y ENTRADA que la referencia', async () => {
    const equipo = await fx.crearEquipo('PC-3');
    const { componenteId, unidadId } = await fx.agregarUnidadInstalada(equipo.id, 'S1');
    const antes = await fx.saldos(fx.serieId);
    const leyenda = `Baja del equipo «${equipo.nombre}» — Vejez`;

    const result = await darDeBaja(equipo.id);

    expect(result.isOk()).toBe(true);
    const unidad = await fx.tenantClient.unidadInsumo.findUniqueOrThrow({
      where: { id: unidadId },
    });
    expect(unidad).toMatchObject({
      estado: 'EN_DEPOSITO',
      condicion: 'USADO',
      equipoId: null,
      numeroSerie: 'S1',
    });
    const evento = await fx.tenantClient.eventoUnidadInsumo.findFirstOrThrow({
      where: { unidadId, tipo: 'RETIRO_A_DEPOSITO' },
    });
    expect(evento).toMatchObject({ equipoId: equipo.id, motivo: leyenda });
    const componente = await fx.tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componenteId },
    });
    expect(componente.bajaMovimientoId).not.toBeNull();
    const entrada = await fx.tenantClient.movimientoInsumo.findUniqueOrThrow({
      where: { id: componente.bajaMovimientoId as string },
    });
    expect(entrada).toMatchObject({
      tipo: 'ENTRADA',
      condicion: 'USADO',
      equipoId: equipo.id,
      motivo: leyenda,
    });
    expect(Number(entrada.cantidad)).toBe(1);
    const despues = await fx.saldos(fx.serieId);
    expect(despues.USADO).toBe(antes.USADO + 1);
  }, 30_000);

  it('un insumo deshabilitado no frena la baja y su saldo USADO sube 1', async () => {
    const equipo = await fx.crearEquipo('PC-4');
    await fx.agregarComponente(equipo.id, fx.deshabilitadoId);

    const result = await darDeBaja(equipo.id);

    expect(result.isOk()).toBe(true);
    expect(await fx.saldos(fx.deshabilitadoId)).toEqual({ NUEVO: 0, USADO: 1 });
  }, 30_000);

  it('la categoría ROTURA sin texto completa la baja', async () => {
    const equipo = await fx.crearEquipo('PC-5');
    await fx.agregarComponente(equipo.id, fx.ningunoId);

    const result = await darDeBaja(equipo.id, { categoria: 'ROTURA' });

    expect(result.isOk()).toBe(true);
    const fila = await fx.tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipo.id },
    });
    expect(fila).toMatchObject({ activo: false, bajaCategoria: 'ROTURA', bajaMotivo: null });
  }, 30_000);
});

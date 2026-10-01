/**
 * [INTEGRATION] Baja de equipo completo, opción B (`DESCARTE`), contra Postgres real
 * (baja-equipo-completo, R1, R3 y R7). Wiring real sobre `soporte_tenant_test` con PREFIJO por
 * corrida (`BajaEquipoFixtures`); el invariante `SERIE` se verifica tras cada caso. No toca
 * `soporte_master_test`, así que no necesita `usarLockMasterTest()`.
 */
import { BajaEquipoFixtures } from '../../testing/baja-equipo.fixtures';

describe('DarDeBajaEquipo — opción B DESCARTE — Integration', () => {
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

  const descartar = (equipoId: string) =>
    fx.conTenant(() =>
      fx.useCase.execute({
        equipoId,
        destino: 'DESCARTE',
        categoria: 'VEJEZ',
        usuarioId: fx.usuarioId,
      }),
    );

  it('tres componentes quedan todos con bajaDestino DESCARTE y ninguno con otro', async () => {
    const equipo = await fx.crearEquipo('PC-1');
    const ids = [
      await fx.agregarComponente(equipo.id, fx.ningunoId),
      await fx.agregarComponente(equipo.id, fx.ningunoId),
      await fx.agregarComponente(equipo.id, fx.deshabilitadoId),
    ];

    const result = await descartar(equipo.id);

    expect(result.isOk()).toBe(true);
    const filas = await fx.tenantClient.componenteEquipo.findMany({
      where: { equipoId: equipo.id },
    });
    expect(filas.map((f) => f.id).sort()).toEqual([...ids].sort());
    for (const fila of filas) {
      expect(fila.deletedAt).not.toBeNull();
      expect(fila.bajaDestino).toBe('DESCARTE');
      expect(fila.bajaMovimientoId).toBeNull();
    }
  }, 30_000);

  it('NINGUNO (saldo USADO 2) + unidad S1: S1 queda DESCARTADA con evento DESCARTE y leyenda, cero movimientos y saldo en 2', async () => {
    const equipo = await fx.crearEquipo('PC-2');
    await fx.sembrarSaldo(fx.ningunoId, 'USADO', 2);
    await fx.agregarComponente(equipo.id, fx.ningunoId);
    const { unidadId } = await fx.agregarUnidadInstalada(equipo.id, 'S1');
    const movimientosAntes = (await fx.foto()).movimientos;
    const saldoSerieAntes = await fx.saldos(fx.serieId);
    const leyenda = `Baja del equipo «${equipo.nombre}» — Vejez`;

    const result = await descartar(equipo.id);

    expect(result.isOk()).toBe(true);
    const unidad = await fx.tenantClient.unidadInsumo.findUniqueOrThrow({
      where: { id: unidadId },
    });
    expect(unidad).toMatchObject({ estado: 'DESCARTADA', equipoId: null });
    const evento = await fx.tenantClient.eventoUnidadInsumo.findFirstOrThrow({
      where: { unidadId, tipo: 'DESCARTE' },
    });
    expect(evento).toMatchObject({ equipoId: equipo.id, motivo: leyenda });
    expect((await fx.foto()).movimientos).toBe(movimientosAntes);
    expect(await fx.saldos(fx.ningunoId)).toEqual({ NUEVO: 0, USADO: 2 });
    expect(await fx.saldos(fx.serieId)).toEqual(saldoSerieAntes);
    const componentes = await fx.tenantClient.componenteEquipo.findMany({
      where: { equipoId: equipo.id },
    });
    expect(componentes).toHaveLength(2);
    expect(componentes.every((c) => c.bajaDestino === 'DESCARTE' && c.deletedAt !== null)).toBe(
      true,
    );
  }, 30_000);

  it('con saldo NUEVO 3 y USADO 0 no hay asiento negativo ni cambia ningún saldo', async () => {
    const equipo = await fx.crearEquipo('PC-3');
    await fx.sembrarSaldo(fx.ningunoId, 'NUEVO', 3);
    await fx.agregarComponente(equipo.id, fx.ningunoId);
    const movimientosAntes = await fx.tenantClient.movimientoInsumo.count({
      where: { insumoId: fx.ningunoId },
    });

    const result = await descartar(equipo.id);

    expect(result.isOk()).toBe(true);
    expect(
      await fx.tenantClient.movimientoInsumo.count({ where: { insumoId: fx.ningunoId } }),
    ).toBe(movimientosAntes);
    expect(await fx.saldos(fx.ningunoId)).toEqual({ NUEVO: 3, USADO: 0 });
  }, 30_000);

  it('un insumo con baja lógica no bloquea el descarte', async () => {
    const equipo = await fx.crearEquipo('PC-4');
    const componenteId = await fx.agregarComponente(equipo.id, fx.borradoId);

    const result = await descartar(equipo.id);

    expect(result.isOk()).toBe(true);
    const fila = await fx.tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componenteId },
    });
    expect(fila.bajaDestino).toBe('DESCARTE');
    expect(fila.deletedAt).not.toBeNull();
  }, 30_000);

  it('un legado SERIE sin serial se descarta sin crear unidad ni pedir serial', async () => {
    const equipo = await fx.crearEquipo('PC-5');
    const componenteId = await fx.agregarComponente(equipo.id, fx.serieId);

    const result = await descartar(equipo.id);

    expect(result.isOk()).toBe(true);
    expect(await fx.tenantClient.unidadInsumo.count({ where: { insumoId: fx.serieId } })).toBe(0);
    const fila = await fx.tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componenteId },
    });
    expect(fila.bajaDestino).toBe('DESCARTE');
  }, 30_000);
});

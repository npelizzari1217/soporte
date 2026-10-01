/**
 * [INTEGRATION] La leyenda de la baja de equipo completo es UNA sola y llega idéntica a los tres
 * lugares (`baja_motivo` del componente, motivo de la ENTRADA y motivo del evento de la unidad),
 * contra Postgres real (baja-equipo-completo, R4). Wiring real sobre `soporte_tenant_test` con
 * PREFIJO por corrida (`BajaEquipoFixtures`). No toca `soporte_master_test`.
 */
import { MotivoBajaEquipoInvalidoError } from '../../domain/errors/equipos.errors';
import { BajaEquipoFixtures } from '../../testing/baja-equipo.fixtures';

describe('DarDeBajaEquipo — leyenda única — Integration', () => {
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

  const darDeBaja = (equipoId: string, destino: string, categoria: string, motivo?: string) =>
    fx.conTenant(() =>
      fx.useCase.execute({ equipoId, destino, categoria, motivo, usuarioId: fx.usuarioId }),
    );

  it('misma leyenda en bajaMotivo de ambos componentes, en ambas ENTRADAs y en el evento de S1', async () => {
    const equipo = await fx.crearEquipo('PC-Caja-3');
    const cNinguno = await fx.agregarComponente(equipo.id, fx.ningunoId);
    const { componenteId: cSerie, unidadId } = await fx.agregarUnidadInstalada(equipo.id, 'S1');
    const leyenda = `Baja del equipo «${equipo.nombre}» — Donación: a la escuela N° 12`;

    const result = await darDeBaja(equipo.id, 'STOCK_USADO', 'DONACION', 'a la escuela N° 12');

    expect(result.isOk()).toBe(true);
    const componentes = await fx.tenantClient.componenteEquipo.findMany({
      where: { id: { in: [cNinguno, cSerie] } },
    });
    expect(componentes.map((c) => c.bajaMotivo)).toEqual([leyenda, leyenda]);
    const entradas = await fx.tenantClient.movimientoInsumo.findMany({
      where: { equipoId: equipo.id, tipo: 'ENTRADA' },
    });
    expect(entradas).toHaveLength(2);
    expect(entradas.map((e) => e.motivo)).toEqual([leyenda, leyenda]);
    const evento = await fx.tenantClient.eventoUnidadInsumo.findFirstOrThrow({
      where: { unidadId, tipo: 'RETIRO_A_DEPOSITO' },
    });
    expect(evento.motivo).toBe(leyenda);
  }, 30_000);

  it('sin texto libre la leyenda es "Baja del equipo «PC-1» — Vejez"', async () => {
    const equipo = await fx.crearEquipo('PC-1');
    const componenteId = await fx.agregarComponente(equipo.id, fx.ningunoId);

    const result = await darDeBaja(equipo.id, 'DESCARTE', 'VEJEZ');

    expect(result.isOk()).toBe(true);
    const fila = await fx.tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componenteId },
    });
    expect(fila.bajaMotivo).toBe(`Baja del equipo «${equipo.nombre}» — Vejez`);
  }, 30_000);

  it('un texto de exactamente N caracteres completa la baja y la leyenda guardada mide 500', async () => {
    const equipo = await fx.crearEquipo('PC-Largo');
    const componenteId = await fx.agregarComponente(equipo.id, fx.ningunoId);
    const prefijoLeyenda = `Baja del equipo «${equipo.nombre}» — Rotura: `;
    const n = 500 - prefijoLeyenda.length;

    const result = await darDeBaja(equipo.id, 'STOCK_USADO', 'ROTURA', 'x'.repeat(n));

    expect(result.isOk()).toBe(true);
    const fila = await fx.tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componenteId },
    });
    expect(fila.bajaMotivo).toHaveLength(500);
    const entrada = await fx.tenantClient.movimientoInsumo.findFirstOrThrow({
      where: { equipoId: equipo.id },
    });
    expect(entrada.motivo).toBe(fila.bajaMotivo);
  }, 30_000);

  it('un texto de N+1 caracteres se rechaza informando N y NO cambia nada', async () => {
    const equipo = await fx.crearEquipo('PC-Largo');
    await fx.agregarComponente(equipo.id, fx.ningunoId);
    await fx.agregarUnidadInstalada(equipo.id, 'S1');
    const n = 500 - `Baja del equipo «${equipo.nombre}» — Rotura: `.length;
    const antes = await fx.foto();

    const result = await darDeBaja(equipo.id, 'STOCK_USADO', 'ROTURA', 'x'.repeat(n + 1));

    expect(result.isFail()).toBe(true);
    const error = result.getError();
    expect(error).toBeInstanceOf(MotivoBajaEquipoInvalidoError);
    expect((error as MotivoBajaEquipoInvalidoError).largoMaximo).toBe(n);
    expect(await fx.foto()).toEqual(antes);
  }, 30_000);
});

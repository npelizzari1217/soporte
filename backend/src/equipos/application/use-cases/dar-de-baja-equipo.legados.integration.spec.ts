/**
 * [INTEGRATION] Seriales de los componentes legados en la baja con `STOCK_USADO` y causas juntas
 * (baja-equipo-completo, R6 y R7), contra Postgres real. Un legado es un componente sin unidad de
 * un insumo hoy `SERIE`: su serial viaja en la solicitud y crea la unidad al volver al depósito.
 * Sobre `soporte_tenant_test` con PREFIJO por corrida; no toca `soporte_master_test`.
 */
import type { DomainError, Result } from '../../../shared/domain/result';
import { BajaEquipoConPiezasProblematicasError } from '../../domain/errors/equipos.errors';
import { BajaEquipoFixtures } from '../../testing/baja-equipo.fixtures';

describe('DarDeBajaEquipo — seriales legados y causas juntas — Integration', () => {
  let fx: BajaEquipoFixtures;

  beforeAll(async () => {
    fx = await BajaEquipoFixtures.crear();
  }, 30_000);

  afterAll(async () => {
    await fx.cerrar();
  }, 30_000);

  beforeEach(() => fx.limpiar());

  afterEach(async () => {
    vi.restoreAllMocks();
    expect(await fx.exigirInvarianteSerie()).toEqual([]);
  });

  const darDeBaja = (
    equipoId: string,
    seriales: { componenteId: string; numeroSerie: string }[] = [],
  ) =>
    fx.conTenant(() =>
      fx.useCase.execute({
        equipoId,
        destino: 'STOCK_USADO',
        categoria: 'VEJEZ',
        seriales,
        usuarioId: fx.usuarioId,
      }),
    );

  const saltearDiagnostico = () =>
    vi.spyOn(fx.registrarEntrada, 'diagnosticarDevolucionesDeEquipo').mockResolvedValue([]);

  function piezasDelError(result: Result<unknown, DomainError>) {
    expect(result.isFail()).toBe(true);
    const error = result.getError();
    if (!(error instanceof BajaEquipoConPiezasProblematicasError)) throw error;
    return [...error.piezas].sort((a, b) => a.componenteId.localeCompare(b.componenteId));
  }

  const ordenadas = <T extends { componenteId: string }>(piezas: T[]) =>
    [...piezas].sort((a, b) => a.componenteId.localeCompare(b.componenteId));

  /** Ninguna unidad `SERIE` del caso quedó sin serial (serie pendiente). */
  const unidadesSinSerial = () =>
    fx.tenantClient.unidadInsumo.count({ where: { insumoId: fx.serieId, numeroSerie: null } });

  it('un legado SERIE con serial "LEG-1" crea la unidad EN_DEPOSITO USADO con su ENTRADA y retira el componente', async () => {
    const equipo = await fx.crearEquipo('LEG-A');
    const legado = await fx.agregarComponente(equipo.id, fx.serieId);

    const result = await darDeBaja(equipo.id, [{ componenteId: legado, numeroSerie: 'LEG-1' }]);

    expect(result.isOk()).toBe(true);
    const unidad = await fx.tenantClient.unidadInsumo.findFirstOrThrow({
      where: { insumoId: fx.serieId, numeroSerie: 'LEG-1' },
    });
    expect(unidad).toMatchObject({ estado: 'EN_DEPOSITO', condicion: 'USADO', equipoId: null });
    const entradas = await fx.tenantClient.movimientoInsumo.findMany({
      where: { insumoId: fx.serieId, unidadId: unidad.id },
    });
    expect(entradas).toHaveLength(1);
    expect(entradas[0]).toMatchObject({ tipo: 'ENTRADA', condicion: 'USADO', equipoId: equipo.id });
    expect(Number(entradas[0].cantidad)).toBe(1);
    const componente = await fx.tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: legado },
    });
    expect(componente.deletedAt).not.toBeNull();
    expect(componente).toMatchObject({
      bajaDestino: 'STOCK_USADO',
      bajaMovimientoId: entradas[0].id,
    });
    expect(await unidadesSinSerial()).toBe(0);
  }, 30_000);

  it('un legado SERIE sin serial rechaza la baja por serial requerido y nada cambia', async () => {
    const equipo = await fx.crearEquipo('LEG-B');
    const legado = await fx.agregarComponente(equipo.id, fx.serieId);
    const antes = await fx.foto();

    const result = await darDeBaja(equipo.id);

    expect(piezasDelError(result)).toEqual([
      { componenteId: legado, insumoId: fx.serieId, causa: 'SERIAL_REQUERIDO' },
    ]);
    expect(await fx.foto()).toEqual(antes);
    expect(await unidadesSinSerial()).toBe(0);
  }, 30_000);

  it('"x1" y "X 1" para dos legados del mismo insumo rechazan ambos componentes y no crean ninguna unidad', async () => {
    const equipo = await fx.crearEquipo('LEG-C');
    const uno = await fx.agregarComponente(equipo.id, fx.serieId);
    const dos = await fx.agregarComponente(equipo.id, fx.serieId);
    const antes = await fx.foto();

    const result = await darDeBaja(equipo.id, [
      { componenteId: uno, numeroSerie: 'x1' },
      { componenteId: dos, numeroSerie: 'X 1' },
    ]);

    // Dentro del mismo lote, el mismo serial normalizado se informa como SERIAL_REPETIDO.
    expect(piezasDelError(result)).toEqual(
      ordenadas([
        { componenteId: uno, insumoId: fx.serieId, causa: 'SERIAL_REPETIDO' },
        { componenteId: dos, insumoId: fx.serieId, causa: 'SERIAL_REPETIDO' },
      ]),
    );
    expect(await fx.foto()).toEqual(antes);
    expect(await unidadesSinSerial()).toBe(0);
  }, 30_000);

  it('el serial "a1" con una unidad "A1" ya existente rechaza el componente y nada cambia', async () => {
    const equipo = await fx.crearEquipo('LEG-D');
    const legado = await fx.agregarComponente(equipo.id, fx.serieId);
    await fx.agregarUnidadEnDeposito('A1');
    const antes = await fx.foto();

    const result = await darDeBaja(equipo.id, [{ componenteId: legado, numeroSerie: 'a1' }]);

    expect(piezasDelError(result)).toEqual([
      { componenteId: legado, insumoId: fx.serieId, causa: 'SERIAL_DUPLICADO' },
    ]);
    expect(await fx.foto()).toEqual(antes);
    expect(await unidadesSinSerial()).toBe(0);
  }, 30_000);

  it('un insumo borrado frena la baja con STOCK_USADO y se informa como INSUMO_BORRADO', async () => {
    const equipo = await fx.crearEquipo('LEG-E');
    const borrado = await fx.agregarComponente(equipo.id, fx.borradoId);
    const antes = await fx.foto();

    const result = await darDeBaja(equipo.id);

    expect(piezasDelError(result)).toEqual([
      { componenteId: borrado, insumoId: fx.borradoId, causa: 'INSUMO_BORRADO' },
    ]);
    expect(await fx.foto()).toEqual(antes);
  }, 30_000);

  describe('causas juntas (R6)', () => {
    it.each([
      ['el diagnóstico de afuera', false],
      ['el camino transaccional', true],
    ] as const)(
      'un insumo borrado y un legado con serial ya existente se listan juntos por %s',
      async (_camino, salteando) => {
        const equipo = await fx.crearEquipo('LEG-F');
        const borrado = await fx.agregarComponente(equipo.id, fx.borradoId);
        const legado = await fx.agregarComponente(equipo.id, fx.serieId);
        await fx.agregarUnidadEnDeposito('A1');
        const antes = await fx.foto();
        if (salteando) saltearDiagnostico();

        const result = await darDeBaja(equipo.id, [{ componenteId: legado, numeroSerie: 'a1' }]);

        expect(piezasDelError(result)).toEqual(
          ordenadas([
            { componenteId: borrado, insumoId: fx.borradoId, causa: 'INSUMO_BORRADO' },
            { componenteId: legado, insumoId: fx.serieId, causa: 'SERIAL_DUPLICADO' },
          ]),
        );
        expect(await fx.foto()).toEqual(antes);
      },
      30_000,
    );
  });
});

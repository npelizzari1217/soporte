/**
 * [INTEGRATION] `PrismaMovimientoInsumoRepository` contra Postgres REAL
 * (`soporte_tenant_test`).
 *
 * Fixtures prefijados `MOVR_<hex>_` sobre el código del insumo y de sus
 * catálogos (mismo patrón que `prisma-insumo.repository.integration.spec.ts`):
 * la DB de test es COMPARTIDA, así que la limpieza va acotada por ese prefijo
 * — nunca un TRUNCATE global.
 *
 * **DOS insumos en el fixture, no uno.** Todo caso de "no suma lo que no es
 * suyo" necesita que exista realmente otro insumo CON bitácora propia: sobre
 * un fixture de un solo insumo, ese assert pasaría en verde sin probar nada.
 *
 * La serialización bajo el advisory lock NO se prueba acá: vive en
 * `prisma-movimiento-insumo.repository.concurrencia.integration.spec.ts`, que
 * necesita su propio pool instrumentado para demostrar paralelismo real. Lo
 * que sí se prueba acá es CUÁL de los dos métodos de lectura toma el lock:
 * alcanza con dos conexiones y no necesita paralelismo genuino.
 *
 * Este spec NO toca `soporte_master_test`, así que no necesita
 * `usarLockMasterTest()`.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PrismaMovimientoInsumoRepository } from './prisma-movimiento-insumo.repository';
import { MovimientoInsumoMapper } from './movimiento-insumo.mapper';
import { MovimientoInsumoEntity } from '../../../domain/entities/movimiento-insumo.entity';
import {
  TIPOS_MOVIMIENTO_INSUMO,
  TipoMovimientoInsumo,
} from '../../../domain/entities/tipo-movimiento-insumo';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

/**
 * Tope de espera de los dos sondeos del advisory lock. Holgadamente mayor que
 * una consulta agregada local —que resuelve en milisegundos— y holgadamente
 * menor que el timeout de una transacción interactiva de Prisma (5 s por
 * defecto), que es lo que sostiene el lock del otro lado.
 */
const MS_TOPE_DEL_SONDEO = 800;

/** Marca de que la promesa sondeada no resolvió dentro del tope. */
const TIEMPO_AGOTADO = Symbol('tiempo agotado');

/**
 * Espera a `promesa` con un tope, sin dejar el temporizador vivo.
 *
 * Es lo que convierte "quedó esperando el lock" en un fallo con nombre en vez
 * de en un test colgado hasta el timeout del runner: una promesa que espera un
 * advisory lock no se resuelve nunca por su cuenta.
 *
 * @param promesa Operación bajo sondeo.
 * @param ms Tope de espera.
 * @returns El valor de la promesa, o `TIEMPO_AGOTADO` si no resolvió a tiempo.
 */
async function conTope<T>(promesa: Promise<T>, ms: number): Promise<T | typeof TIEMPO_AGOTADO> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<typeof TIEMPO_AGOTADO>((resolve) => {
    temporizador = setTimeout(() => resolve(TIEMPO_AGOTADO), ms);
  });

  try {
    return await Promise.race([promesa, tope]);
  } finally {
    clearTimeout(temporizador);
  }
}

describe('PrismaMovimientoInsumoRepository — Integration', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let txRunner: PrismaTenantTransactionRunner;
  let repo: PrismaMovimientoInsumoRepository;

  /** Prefijo único por corrida: dos procesos en paralelo no se pisan. */
  const PREFIJO = `MOVR_${randomBytes(2).toString('hex')}_`;

  /** Quien registra el movimiento: soft ref a `master.usuarios.id`, sin FK. */
  const usuarioId = randomUUID();

  let insumoId: string;
  /** El OTRO insumo, con bitácora propia: sin él, "no suma lo ajeno" es un verde falso. */
  let otroInsumoId: string;
  let equipoId: string;
  let sectorId: string;
  /** Ciclo y compra del fixture: solo existen para que el ítem tenga a qué colgarse. */
  let cicloId: string;
  let compraId: string;
  /** El ORIGEN: `movimientos_insumo.item_compra_id` es una FK real, no un id suelto. */
  let itemCompraId: string;

  /** Construye un asiento válido sobre el insumo bajo prueba. */
  function construirMovimiento(
    tipo: TipoMovimientoInsumo,
    cantidad: number,
    extra: Partial<Parameters<typeof MovimientoInsumoEntity.create>[0]> = {},
  ): MovimientoInsumoEntity {
    return MovimientoInsumoEntity.create({
      insumoId,
      tipo,
      cantidad,
      usuarioId,
      ...extra,
    }).getValue();
  }

  /** Inserta filas directo por Prisma: fixtures de lectura, sin pasar por el repo. */
  async function sembrar(
    idDelInsumo: string,
    asientos: Array<{ tipo: TipoMovimientoInsumo; cantidad: number }>,
  ): Promise<void> {
    await tenantClient.movimientoInsumo.createMany({
      data: asientos.map((a) => ({
        insumoId: idDelInsumo,
        tipo: a.tipo,
        cantidad: a.cantidad,
        usuarioId,
      })),
    });
  }

  /**
   * Abre OTRA transacción que toma el advisory lock del insumo bajo prueba y
   * lo sostiene hasta que el test la libera. Es el fixture de los dos sondeos
   * del lock: sin una sesión que lo tenga tomado de verdad, "no bloquea"
   * pasaría en verde sobre un lock que nunca existió.
   *
   * La transacción avisa cuando ya tiene el lock en la mano, y ese aviso corre
   * en carrera con la transacción entera: si fallara ANTES de tomarlo, esperar
   * el aviso a secas colgaría el test en lugar de propagar el error.
   *
   * @returns Un `liberar()` que suelta el lock y espera al cierre real de la transacción.
   */
  async function tomarElLockEnOtraTransaccion(): Promise<{ liberar: () => Promise<void> }> {
    let soltar: () => void = () => {};
    const sostener = new Promise<void>((resolve) => {
      soltar = resolve;
    });
    let avisarTomado: () => void = () => {};
    const tomado = new Promise<void>((resolve) => {
      avisarTomado = resolve;
    });

    const transaccion = txRunner.run(async () => {
      await repo.lockAndSumByTipo(insumoId);
      avisarTomado();
      await sostener;
    });

    await Promise.race([tomado, transaccion]);

    return {
      liberar: async () => {
        soltar();
        await transaccion;
      },
    };
  }

  async function limpiarMovimientos(): Promise<void> {
    await tenantClient.movimientoInsumo.deleteMany({
      where: { insumoId: { in: [insumoId, otroInsumoId] } },
    });
  }

  beforeAll(async () => {
    prismaService = new PrismaService(TENANT_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-movimientos-insumo',
    });
    txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
    repo = new PrismaMovimientoInsumoRepository(tenantContext);

    // `familia_id` y `unidad_medida_id` son FK con ON DELETE RESTRICT: sin
    // estas dos filas ningún insumo entra.
    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia de prueba' },
    });
    const unidad = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Unidad de prueba' },
    });

    const insumo = await tenantClient.insumo.create({
      data: {
        codigo: `${PREFIJO}A`,
        nombre: 'Insumo bajo prueba',
        familiaId: familia.id,
        unidadMedidaId: unidad.id,
      },
    });
    insumoId = insumo.id;

    const otroInsumo = await tenantClient.insumo.create({
      data: {
        codigo: `${PREFIJO}B`,
        nombre: 'Otro insumo con bitácora propia',
        familiaId: familia.id,
        unidadMedidaId: unidad.id,
      },
    });
    otroInsumoId = otroInsumo.id;

    const equipo = await tenantClient.equipoInformatico.create({
      data: { nombre: `${PREFIJO}EQUIPO` },
    });
    equipoId = equipo.id;

    const sector = await tenantClient.sector.create({
      data: { codigo: `${PREFIJO}S`, nombre: 'Sector de prueba' },
    });
    sectorId = sector.id;

    // `activo: false` A PROPÓSITO, mismo criterio que
    // `enlace-compras-insumos-constraints.integration.spec.ts`: `findActive()`
    // resuelve el ciclo vigente con un `findFirst` sin `orderBy`, así que un
    // ciclo activo de más en la DB compartida vuelve intermitente a cualquier
    // spec que lo consulte. Acá el ciclo solo hace de destino de FK.
    const ciclo = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: randomUUID(),
        nombre: `${PREFIJO}ciclo`,
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: false,
      },
    });
    cicloId = ciclo.id;

    const compra = await tenantClient.compra.create({
      data: {
        numero: PREFIJO.slice(0, 20),
        fechaSolicitud: new Date('2026-01-01'),
        motivo: 'Compra del fixture de la bitácora',
        solicitanteId: randomUUID(),
        cicloId,
      },
    });
    compraId = compra.id;

    // El ítem apunta al insumo bajo prueba, que es la forma en que existe en
    // producción: la recepción sabe a qué insumo imputarle la entrada.
    const itemCompra = await tenantClient.itemCompra.create({
      data: {
        compraId,
        descripcion: 'Ítem del fixture',
        cantidad: 10,
        proveedor: 'Proveedor del fixture',
        monto: 1000,
        fechaCotizacion: new Date('2026-01-01'),
        insumoId,
      },
    });
    itemCompraId = itemCompra.id;
  });

  // Orden obligado por las FK con RESTRICT: primero la bitácora, después el
  // ítem de compra que sus asientos referencian, después los insumos, y al
  // final los catálogos a los que todos referencian.
  afterAll(async () => {
    await limpiarMovimientos();
    await tenantClient.itemCompra.deleteMany({ where: { compraId } });
    await tenantClient.compra.deleteMany({ where: { cicloId } });
    await tenantClient.cicloCliente.deleteMany({ where: { id: cicloId } });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.equipoInformatico.deleteMany({ where: { nombre: { startsWith: PREFIJO } } });
    await tenantClient.sector.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await limpiarMovimientos();
  });

  describe('insert()', () => {
    it('asienta el movimiento completo, con sus tres campos opcionales', async () => {
      const movimiento = construirMovimiento('SALIDA', 2.5, {
        motivo: 'Reposición del piso 3',
        equipoId,
        sectorId,
      });

      await txRunner.run(() => repo.insert(movimiento));

      const fila = await tenantClient.movimientoInsumo.findUnique({
        where: { id: movimiento.id },
      });
      expect(fila).not.toBeNull();
      expect(fila?.insumoId).toBe(insumoId);
      expect(fila?.tipo).toBe('SALIDA');
      expect(Number(fila?.cantidad)).toBe(2.5);
      expect(fila?.usuarioId).toBe(usuarioId);
      expect(fila?.motivo).toBe('Reposición del piso 3');
      expect(fila?.equipoId).toBe(equipoId);
      expect(fila?.sectorId).toBe(sectorId);
    });

    /**
     * La columna tiene `DEFAULT gen_random_uuid()`, así que la base pondría
     * un id propio si el INSERT no mandara ninguno. El asiento tiene que
     * quedar guardado con el UUIDv7 que generó la entidad: es el id que el
     * caso de uso ya devolvió, y el que le da a la bitácora un desempate
     * monótono entre dos asientos de la misma fecha.
     */
    it('guarda el id que generó la entidad, no uno de la base', async () => {
      const movimiento = construirMovimiento('ENTRADA', 5);

      await txRunner.run(() => repo.insert(movimiento));

      const filas = await tenantClient.movimientoInsumo.findMany({ where: { insumoId } });
      expect(filas).toHaveLength(1);
      expect(filas[0].id).toBe(movimiento.id);
    });

    it('deja en null el motivo, el equipo y el sector cuando el asiento no los trae', async () => {
      const movimiento = construirMovimiento('ENTRADA', 1);

      await txRunner.run(() => repo.insert(movimiento));

      const fila = await tenantClient.movimientoInsumo.findUnique({
        where: { id: movimiento.id },
      });
      expect(fila?.motivo).toBeNull();
      expect(fila?.equipoId).toBeNull();
      expect(fila?.sectorId).toBeNull();
    });

    /**
     * **El caso que prueba que el origen llega a la columna.** El mapper emitió
     * `item_compra_id: null` FIJO mientras la entidad no tenía el campo, y ese
     * fallo no se ve por ningún lado desde arriba: el caso de uso devuelve el
     * asiento con su origen, la escritura no falla, y lo único distinto es una
     * columna en `NULL` que nadie mira hasta que alguien pregunta de qué compra
     * vino una entrada. Se lee la fila CRUDA, sin pasar por el mapper, para que
     * el assert no pueda quedar satisfecho por el mismo código que se prueba.
     */
    it('guarda el itemCompraId del asiento en la columna item_compra_id', async () => {
      const movimiento = construirMovimiento('ENTRADA', 6, { itemCompraId });

      await txRunner.run(() => repo.insert(movimiento));

      const fila = await tenantClient.movimientoInsumo.findUnique({
        where: { id: movimiento.id },
      });
      expect(fila?.itemCompraId).toBe(itemCompraId);
    });

    /**
     * Hermano invertido del de arriba: la entrada manual, la salida y el ajuste
     * no nacen de una compra, y su columna queda en `NULL`. Sin este caso, un
     * mapper que emitiera SIEMPRE el id del último ítem visto pasaría el
     * anterior igual.
     */
    it('deja item_compra_id en null cuando el asiento no viene de una compra', async () => {
      const movimiento = construirMovimiento('ENTRADA', 6);

      await txRunner.run(() => repo.insert(movimiento));

      const fila = await tenantClient.movimientoInsumo.findUnique({
        where: { id: movimiento.id },
      });
      expect(fila?.itemCompraId).toBeNull();
    });

    /**
     * Ida y vuelta COMPLETO contra Postgres: se guarda con el repositorio y se
     * relee con el mapper, que es el camino por el que la bitácora vuelve al
     * dominio. Es el caso que atrapa la pérdida en cualquiera de las dos
     * mitades —una escritura que no manda el origen, o una lectura que no lo
     * levanta—, que por separado se ven iguales desde afuera: un movimiento sin
     * trazabilidad.
     */
    it('un movimiento con origen sobrevive el ida y vuelta por la base', async () => {
      const movimiento = construirMovimiento('ENTRADA', 8.25, {
        itemCompraId,
        motivo: 'Recepción de la orden del fixture',
      });

      await txRunner.run(() => repo.insert(movimiento));

      const fila = await tenantClient.movimientoInsumo.findUniqueOrThrow({
        where: { id: movimiento.id },
      });
      const releido = MovimientoInsumoMapper.toDomain(fila);

      expect(releido.id).toBe(movimiento.id);
      expect(releido.insumoId).toBe(movimiento.insumoId);
      expect(releido.tipo).toBe('ENTRADA');
      expect(releido.cantidad).toBe(8.25);
      expect(releido.motivo).toBe('Recepción de la orden del fixture');
      expect(releido.itemCompraId).toBe(itemCompraId);
    });

    /** Caso hermano del anterior: el asiento sin origen se relee sin origen. */
    it('un movimiento sin origen se relee con itemCompraId en null', async () => {
      const movimiento = construirMovimiento('ENTRADA', 8.25);

      await txRunner.run(() => repo.insert(movimiento));

      const fila = await tenantClient.movimientoInsumo.findUniqueOrThrow({
        where: { id: movimiento.id },
      });

      expect(MovimientoInsumoMapper.toDomain(fila).itemCompraId).toBeNull();
    });

    /**
     * El origen tiene que ser un ítem que EXISTE. La validación no vive en el
     * dominio ni en la aplicación a propósito —necesitaría un puerto de
     * `compras` dentro de `insumos`, y esa arista cierra un ciclo—, así que la
     * única red es la FK. Este caso fija que esa red está puesta en el camino
     * real de escritura, no solo en la migración.
     */
    it('rechaza el asiento cuyo origen no es un ítem de compra existente', async () => {
      const movimiento = construirMovimiento('ENTRADA', 2, { itemCompraId: randomUUID() });

      await expect(txRunner.run(() => repo.insert(movimiento))).rejects.toThrow(
        /movimientos_insumo_item_compra_id_fkey/,
      );

      const filas = await tenantClient.movimientoInsumo.findMany({ where: { insumoId } });
      expect(filas).toHaveLength(0);
    });

    /**
     * La atomicidad no es un detalle: el asiento y la comprobación de stock
     * que lo autorizó viven en la MISMA transacción, así que un fallo
     * posterior tiene que llevarse puesto el movimiento. Sin rollback real,
     * una salida rechazada por una regla de más arriba quedaría descontada
     * del stock igual.
     */
    it('el asiento se revierte si la transacción falla después', async () => {
      const movimiento = construirMovimiento('ENTRADA', 4);

      await expect(
        txRunner.run(async () => {
          await repo.insert(movimiento);
          throw new Error('fallo posterior en la misma transacción');
        }),
      ).rejects.toThrow('fallo posterior en la misma transacción');

      const filas = await tenantClient.movimientoInsumo.findMany({ where: { insumoId } });
      expect(filas).toHaveLength(0);
    });
  });

  describe('lockAndSumByTipo()', () => {
    it('devuelve la suma de cada tipo que tiene filas', async () => {
      await sembrar(insumoId, [
        { tipo: 'ENTRADA', cantidad: 10 },
        { tipo: 'ENTRADA', cantidad: 5 },
        { tipo: 'SALIDA', cantidad: 3 },
      ]);

      const sumas = await txRunner.run(() => repo.lockAndSumByTipo(insumoId));

      expect(sumas.ENTRADA).toBe(15);
      expect(sumas.SALIDA).toBe(3);
    });

    /**
     * Un `GROUP BY` no emite filas para los tipos sin movimientos, y el
     * contrato del puerto dice explícitamente que el consumidor NO tiene que
     * resolver una ausencia como cero. El fixture trae DOS tipos con filas a
     * propósito: sin ellos, "los otros dos están en cero" pasaría en verde
     * sobre un objeto vacío.
     */
    it('completa con 0 los tipos del catálogo que no tienen filas', async () => {
      await sembrar(insumoId, [
        { tipo: 'ENTRADA', cantidad: 10 },
        { tipo: 'SALIDA', cantidad: 3 },
      ]);

      const sumas = await txRunner.run(() => repo.lockAndSumByTipo(insumoId));

      expect(sumas.ENTRADA).toBe(10);
      expect(sumas.SALIDA).toBe(3);
      expect(sumas.AJUSTE_POSITIVO).toBe(0);
      expect(sumas.AJUSTE_NEGATIVO).toBe(0);
    });

    /**
     * Las claves se derivan de `TIPOS_MOVIMIENTO_INSUMO` y no se enumeran a
     * mano: el día que entre un quinto tipo, este assert lo exige acá sin que
     * nadie tenga que acordarse de venir.
     */
    it('devuelve exactamente los tipos del catálogo, ni uno más ni uno menos', async () => {
      await sembrar(insumoId, [{ tipo: 'ENTRADA', cantidad: 1 }]);

      const sumas = await txRunner.run(() => repo.lockAndSumByTipo(insumoId));

      expect(Object.keys(sumas).sort()).toEqual([...TIPOS_MOVIMIENTO_INSUMO].sort());
    });

    /**
     * Hermano invertido del caso de arriba: un insumo SIN bitácora devuelve
     * los cuatro tipos en cero. El fixture le da movimientos al OTRO insumo
     * justamente para que el cero no pueda venir de una tabla vacía.
     */
    it('devuelve los cuatro tipos en cero para un insumo sin bitácora', async () => {
      await sembrar(otroInsumoId, [
        { tipo: 'ENTRADA', cantidad: 99 },
        { tipo: 'AJUSTE_POSITIVO', cantidad: 7 },
      ]);

      const sumas = await txRunner.run(() => repo.lockAndSumByTipo(insumoId));

      expect(sumas).toEqual({
        ENTRADA: 0,
        SALIDA: 0,
        AJUSTE_POSITIVO: 0,
        AJUSTE_NEGATIVO: 0,
      });
    });

    it('no suma los movimientos de otro insumo', async () => {
      await sembrar(insumoId, [{ tipo: 'ENTRADA', cantidad: 10 }]);
      await sembrar(otroInsumoId, [{ tipo: 'ENTRADA', cantidad: 99 }]);

      const sumas = await txRunner.run(() => repo.lockAndSumByTipo(insumoId));

      expect(sumas.ENTRADA).toBe(10);
    });

    /**
     * `cantidad` es `DECIMAL(10,2)`: la suma vuelve como `Prisma.Decimal`, un
     * OBJETO. Sin la conversión, quien calcule el stock haría aritmética sobre
     * algo que no es un número. Se assertea el TIPO además del valor, porque
     * un `Decimal` de igual valor pasaría el assert de valor sin problema.
     */
    it('devuelve números, no Decimal, y conserva los dos decimales de la columna', async () => {
      await sembrar(insumoId, [
        { tipo: 'ENTRADA', cantidad: 1.25 },
        { tipo: 'ENTRADA', cantidad: 2.5 },
      ]);

      const sumas = await txRunner.run(() => repo.lockAndSumByTipo(insumoId));

      expect(typeof sumas.ENTRADA).toBe('number');
      expect(sumas.ENTRADA).toBe(3.75);
      expect(typeof sumas.AJUSTE_NEGATIVO).toBe('number');
    });

    /**
     * Read-your-writes dentro de la transacción: es la propiedad de la que
     * depende todo caso de uso que asiente más de un movimiento bajo el mismo
     * lock. Si la suma no viera el asiento recién insertado, la comprobación
     * de stock del segundo movimiento decidiría con datos viejos.
     */
    it('ve, dentro de la misma transacción, el asiento que se acaba de insertar', async () => {
      const sumas = await txRunner.run(async () => {
        await repo.insert(construirMovimiento('ENTRADA', 8));
        return repo.lockAndSumByTipo(insumoId);
      });

      expect(sumas.ENTRADA).toBe(8);
    });

    /**
     * El contrato del puerto dice que el lock SOLO sirve dentro de una
     * transacción explícita: fuera de ella Postgres abre una implícita de una
     * sola sentencia, `pg_advisory_xact_lock` se toma y se libera de
     * inmediato, y dos escritores simultáneos verían las MISMAS sumas. Hasta
     * acá ese contrato no lo hacía cumplir nadie.
     *
     * La implementación lo hace cumplir con el flag `enTransaccion` que ya
     * pone `PrismaTenantTransactionRunner.run()`: llamar sin transacción
     * activa falla fuerte en vez de devolver una suma que no protege nada. El
     * assert nombra la condición —no alcanza con "hubo algún error"—, porque
     * sin `TenantContext` la llamada también lanzaría, y por otro motivo.
     */
    it('falla nombrando la transacción faltante si se la llama fuera de una', async () => {
      await sembrar(insumoId, [{ tipo: 'ENTRADA', cantidad: 1 }]);

      await expect(repo.lockAndSumByTipo(insumoId)).rejects.toThrow(
        /requiere una transacción activa/,
      );
    });
  });

  describe('sumByTipo()', () => {
    /**
     * La diferencia que justifica que exista el método, y el hermano invertido
     * exacto del caso de arriba: `lockAndSumByTipo()` LANZA sin transacción,
     * así que la ficha del insumo no podría reusarlo ni envolviéndolo en un
     * `run()` de mentira. Esta lectura corre tal cual, con el cliente normal.
     */
    it('no exige transacción activa: se la llama tal cual y devuelve las sumas', async () => {
      await sembrar(insumoId, [
        { tipo: 'ENTRADA', cantidad: 10 },
        { tipo: 'SALIDA', cantidad: 4 },
      ]);

      const sumas = await repo.sumByTipo(insumoId);

      expect(sumas.ENTRADA).toBe(10);
      expect(sumas.SALIDA).toBe(4);
    });

    /**
     * Mismo contrato de desglose completo que el hermano con lock: un
     * `GROUP BY` no emite filas para los tipos sin movimientos. El fixture trae
     * DOS tipos con filas a propósito — sin ellos, "los otros dos están en
     * cero" pasaría en verde sobre un objeto vacío.
     */
    it('completa con 0 los tipos del catálogo que no tienen filas', async () => {
      await sembrar(insumoId, [
        { tipo: 'ENTRADA', cantidad: 10 },
        { tipo: 'AJUSTE_NEGATIVO', cantidad: 2 },
      ]);

      const sumas = await repo.sumByTipo(insumoId);

      expect(sumas).toEqual({
        ENTRADA: 10,
        SALIDA: 0,
        AJUSTE_POSITIVO: 0,
        AJUSTE_NEGATIVO: 2,
      });
    });

    /**
     * Hermano invertido del anterior: un insumo SIN bitácora devuelve los
     * cuatro tipos en cero, no un objeto vacío. El fixture le da movimientos al
     * OTRO insumo justamente para que el cero no pueda venir de una tabla
     * vacía.
     */
    it('devuelve los cuatro tipos en cero para un insumo sin bitácora', async () => {
      await sembrar(otroInsumoId, [
        { tipo: 'ENTRADA', cantidad: 99 },
        { tipo: 'AJUSTE_POSITIVO', cantidad: 7 },
      ]);

      const sumas = await repo.sumByTipo(insumoId);

      expect(sumas).toEqual({
        ENTRADA: 0,
        SALIDA: 0,
        AJUSTE_POSITIVO: 0,
        AJUSTE_NEGATIVO: 0,
      });
    });

    it('no suma los movimientos de otro insumo', async () => {
      await sembrar(insumoId, [{ tipo: 'ENTRADA', cantidad: 10 }]);
      await sembrar(otroInsumoId, [{ tipo: 'ENTRADA', cantidad: 99 }]);

      const sumas = await repo.sumByTipo(insumoId);

      expect(sumas.ENTRADA).toBe(10);
    });

    /**
     * `cantidad` es `DECIMAL(10,2)`: la suma vuelve como `Prisma.Decimal`, un
     * OBJETO. Se assertea el TIPO además del valor, porque un `Decimal` de
     * igual valor pasaría el assert de valor sin problema.
     */
    it('devuelve números, no Decimal, y conserva los dos decimales de la columna', async () => {
      await sembrar(insumoId, [
        { tipo: 'ENTRADA', cantidad: 1.25 },
        { tipo: 'ENTRADA', cantidad: 2.5 },
      ]);

      const sumas = await repo.sumByTipo(insumoId);

      expect(typeof sumas.ENTRADA).toBe('number');
      expect(sumas.ENTRADA).toBe(3.75);
      expect(typeof sumas.AJUSTE_NEGATIVO).toBe('number');
    });

    /**
     * **La propiedad que hace que la ficha no lastime a nadie.** Otra
     * transacción tiene el advisory lock del insumo tomado; esta lectura tiene
     * que contestar igual. Si tomara el lock, quedaría esperando a los
     * escritores del insumo —y, peor, los haría esperar a ellos— cada vez que
     * alguien abre una pantalla.
     */
    it('no toma el advisory lock: contesta mientras otra transacción lo tiene', async () => {
      await sembrar(insumoId, [{ tipo: 'ENTRADA', cantidad: 4 }]);
      const lock = await tomarElLockEnOtraTransaccion();

      try {
        const sumas = await conTope(repo.sumByTipo(insumoId), MS_TOPE_DEL_SONDEO);

        if (sumas === TIEMPO_AGOTADO) {
          throw new Error(
            'sumByTipo() quedó esperando el advisory lock del insumo: está tomando el lock que promete no tomar.',
          );
        }
        expect(sumas.ENTRADA).toBe(4);
      } finally {
        await lock.liberar();
      }
    });

    /**
     * Hermano invertido del sondeo, y lo único que impide que sea un verde
     * falso: si el fixture no sostuviera el lock de verdad, el caso de arriba
     * pasaría igual con una implementación que SÍ lo toma. Acá se prueba que
     * el mismo lock, en la misma situación, efectivamente hace esperar a quien
     * lo pide.
     */
    it('el hermano con lock SÍ queda esperando en esa misma situación', async () => {
      await sembrar(insumoId, [{ tipo: 'ENTRADA', cantidad: 4 }]);
      const lock = await tomarElLockEnOtraTransaccion();
      const bloqueada = txRunner.run(() => repo.lockAndSumByTipo(insumoId));

      try {
        expect(await conTope(bloqueada, MS_TOPE_DEL_SONDEO)).toBe(TIEMPO_AGOTADO);
      } finally {
        await lock.liberar();
        // Ya destrabada: se la espera para no dejar una transacción en vuelo
        // que el `beforeEach` del próximo caso encontraría a medio cerrar.
        await bloqueada;
      }
    });

    /**
     * No exigir transacción no es prohibirla: el repositorio participa de la
     * que esté en curso, como cualquier otro método. Sin este caso, una
     * implementación que rechazara la transacción activa —el error simétrico
     * del hermano— pasaría desapercibida.
     */
    it('también funciona dentro de una transacción, sin exigirla', async () => {
      await sembrar(insumoId, [{ tipo: 'ENTRADA', cantidad: 6 }]);

      const sumas = await txRunner.run(() => repo.sumByTipo(insumoId));

      expect(sumas.ENTRADA).toBe(6);
    });
  });
});

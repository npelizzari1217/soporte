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
  CONDICIONES_STOCK,
  CondicionStock,
  TIPOS_MOVIMIENTO_INSUMO,
  TipoMovimientoInsumo,
} from '../../../domain/entities/tipo-movimiento-insumo';
import { sumasCon, sumasEnCero } from '../../../testing/sumas-movimiento';

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

  /**
   * Inserta filas directo por Prisma: fixtures de lectura, sin pasar por el repo.
   *
   * `id`, `createdAt` e `itemCompraId` son opcionales y se omiten de la fila
   * cuando no se los pasa, para que la base aplique sus propios defaults.
   *
   * Los dos primeros existen porque el ORDEN de la bitácora es parte del
   * contrato que se prueba, y con los defaults no se lo puede fijar: dos
   * asientos sembrados en la misma llamada quedan a microsegundos de distancia
   * —así que no hay empate de `createdAt` que probar— y sus ids son aleatorios
   * —así que el orden esperado por `id` sería distinto en cada corrida—.
   */
  async function sembrar(
    idDelInsumo: string,
    asientos: Array<{
      tipo: TipoMovimientoInsumo;
      cantidad: number;
      condicion?: CondicionStock;
      id?: string;
      createdAt?: Date;
      itemCompraId?: string;
    }>,
  ): Promise<void> {
    await tenantClient.movimientoInsumo.createMany({
      data: asientos.map((a) => ({
        insumoId: idDelInsumo,
        tipo: a.tipo,
        cantidad: a.cantidad,
        usuarioId,
        ...(a.condicion !== undefined ? { condicion: a.condicion } : {}),
        ...(a.id !== undefined ? { id: a.id } : {}),
        ...(a.createdAt !== undefined ? { createdAt: a.createdAt } : {}),
        ...(a.itemCompraId !== undefined ? { itemCompraId: a.itemCompraId } : {}),
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

  describe('insert() — issue #159: la fecha la pone la base, no el proceso', () => {
    /**
     * **EL TEST QUE DECIDE EL ISSUE #159.** Sin desviar el reloj, este caso
     * pasaría por construcción y no probaría nada: el bug SOLO se manifiesta
     * cuando el reloj del proceso difiere del de Postgres, que es exactamente
     * lo que pasó en producción (VPS ~44 minutos adelantado, issue #159).
     *
     * Se desvía el reloj del PROCESO 44 minutos hacia el futuro —mismo orden
     * de magnitud que la deriva verificada— con `vi.setSystemTime()`, ANTES de
     * construir la entidad: `MovimientoInsumoEntity.create()` hereda de
     * `BaseEntity`, que fija `createdAt = new Date()` en su constructor, así
     * que el asiento en memoria queda con la fecha DESVIADA. Solo se falsea
     * `Date` (`toFake: ['Date']`) y no los timers: falsear `setTimeout`
     * también arriesgaría colgar la consulta real a Postgres, que si depende
     * de algún timeout interno del driver jamás dispararía.
     *
     * Lo que se lee después NO es el asiento en memoria — que seguiría
     * mintiendo, desviado, pase lo que pase del lado de la base—, sino la fila
     * CRUDA de `movimientos_insumo`, leída con el reloj REAL ya restaurado.
     * Esa fila tiene que caer en la ventana del reloj REAL de este test
     * (`antesDeLaEscritura`..`despuesDeLaEscritura`, con 5 s de margen para el
     * viaje de red a Postgres), y a más de un minuto de distancia de la
     * ventana desviada — así se distingue "cayó donde cae el reloj real" de
     * "cayó donde cae el reloj desviado" sin depender de que los dos rangos no
     * se toquen por casualidad.
     */
    /**
     * EL QUE DISTINGUE `clock_timestamp()` DE `CURRENT_TIMESTAMP`, y sin el cual
     * el arreglo del #159 no arregla lo que dice arreglar.
     *
     * En PostgreSQL `CURRENT_TIMESTAMP` —y `now()`— son la hora de INICIO DE LA
     * TRANSACCIÓN, no la del statement: quedan congeladas mientras la
     * transacción vive. `clock_timestamp()` avanza.
     *
     * Acá eso decide el orden. `insert()` corre dentro de la MISMA transacción
     * que el `pg_advisory_xact_lock`, así que con `CURRENT_TIMESTAMP` la fecha
     * se fijaría ANTES de que el lock se otorgue, y dos movimientos escritos en
     * una sola transacción compartirían el MISMO instante al microsegundo —
     * indistinguibles, sin orden.
     *
     * Dos inserts en la misma transacción es la forma más barata de exponerlo:
     * si las fechas son iguales, el DEFAULT es de transacción y el historial de
     * stock no tiene orden. Si difieren, es del statement.
     */
    it('dos movimientos en UNA transaccion reciben fechas DISTINTAS: el DEFAULT es del statement, no de la transaccion', async () => {
      const uno = construirMovimiento('ENTRADA', 1);
      const dos = construirMovimiento('ENTRADA', 1);

      await txRunner.run(async () => {
        await repo.insert(uno);
        await repo.insert(dos);
      });

      // SE LEE EN CRUDO, NO POR PRISMA, y la diferencia decide si el test sirve.
      // Prisma entrega `timestamptz` como `Date` de JS, que tiene resolución de
      // MILISEGUNDOS; `clock_timestamp()` avanza en MICROsegundos. Dos INSERT
      // seguidos sobre una conexión caliente entran cómodos en el mismo
      // milisegundo, así que comparar `getTime()` daría rojo con el código
      // CORRECTO, al azar. Un test que falla a veces es peor que no tenerlo:
      // enseña a re-correr hasta que pase.
      const [{ micro_uno, micro_dos }] = await tenantClient.$queryRaw<
        { micro_uno: bigint; micro_dos: bigint }[]
      >`
        SELECT
          (SELECT EXTRACT(EPOCH FROM created_at) * 1000000 FROM movimientos_insumo WHERE id = ${uno.id}::uuid)::bigint AS micro_uno,
          (SELECT EXTRACT(EPOCH FROM created_at) * 1000000 FROM movimientos_insumo WHERE id = ${dos.id}::uuid)::bigint AS micro_dos
      `;

      expect(micro_uno).not.toBe(micro_dos);
      expect(micro_dos).toBeGreaterThan(micro_uno);
    });

    it('asienta con la fecha de LA BASE, no la del proceso, con el reloj del proceso desviado 44 minutos', async () => {
      const DESVIO_MS = 44 * 60 * 1000;
      const antesDeLaEscritura = new Date();
      let movimiento: MovimientoInsumoEntity;

      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(new Date(antesDeLaEscritura.getTime() + DESVIO_MS));
        movimiento = construirMovimiento('ENTRADA', 3);
        // Guarda de que el fixture realmente reproduce la deriva: si esto
        // fallara, el resto del caso no probaría lo que dice probar.
        expect(movimiento.createdAt.getTime()).toBe(antesDeLaEscritura.getTime() + DESVIO_MS);

        await txRunner.run(() => repo.insert(movimiento));
      } finally {
        vi.useRealTimers();
      }
      const despuesDeLaEscritura = new Date();

      const fila = await tenantClient.movimientoInsumo.findUniqueOrThrow({
        where: { id: movimiento.id },
      });

      const MARGEN_RED_MS = 5000;
      expect(fila.createdAt.getTime()).toBeGreaterThanOrEqual(
        antesDeLaEscritura.getTime() - MARGEN_RED_MS,
      );
      expect(fila.createdAt.getTime()).toBeLessThanOrEqual(
        despuesDeLaEscritura.getTime() + MARGEN_RED_MS,
      );
      // La ventana desviada empieza en antesDeLaEscritura + 44min; se exige
      // que la fila quede a más de un minuto ANTES de ese arranque.
      expect(fila.createdAt.getTime()).toBeLessThan(
        antesDeLaEscritura.getTime() + DESVIO_MS - 60_000,
      );
    });

    /**
     * LA OTRA MITAD DEL #159, y la que no cubría ninguna prueba. Que la
     * COLUMNA quede con la fecha de la base no alcanza: lo que el usuario ve
     * es lo que `insert()` DEVUELVE — los tres casos de uso asientan en
     * `const asentado` y devuelven eso, ver `RegistrarEntradaInsumoUseCase`,
     * `RegistrarSalidaInsumoUseCase` y `RegistrarAjusteInsumoUseCase`. Si
     * este método devolviera el argumento que recibió, la fila quedaría bien
     * y el usuario seguiría viendo la fecha DESVIADA del proceso: el bug del
     * issue, intacto, con la base ya arreglada.
     *
     * Los specs de los casos de uso no pueden cubrirlo: mockean el
     * repositorio, así que prueban que reenvían lo que el mock les dé, no que
     * el repositorio REAL devuelva la fecha de la base.
     *
     * Sin este caso, reemplazar el cuerpo de `insert()` por
     * `return movimiento;` dejaría la suite entera en verde.
     */
    it('DEVUELVE el asiento con la fecha de la base, no el que recibio con la fecha del proceso', async () => {
      const DESVIO_MS = 44 * 60 * 1000;
      const antesDeLaEscritura = new Date();
      let movimiento: MovimientoInsumoEntity;
      let devuelto: MovimientoInsumoEntity;

      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(new Date(antesDeLaEscritura.getTime() + DESVIO_MS));
        movimiento = construirMovimiento('ENTRADA', 3);
        // Guarda del fixture: sin la deriva en memoria, el caso no prueba nada.
        expect(movimiento.createdAt.getTime()).toBe(antesDeLaEscritura.getTime() + DESVIO_MS);

        devuelto = await txRunner.run(() => repo.insert(movimiento));
      } finally {
        vi.useRealTimers();
      }

      const fila = await tenantClient.movimientoInsumo.findUniqueOrThrow({
        where: { id: movimiento.id },
      });

      // Es el MISMO asiento, no uno distinto.
      expect(devuelto.id).toBe(movimiento.id);
      // Lo devuelto es EXACTAMENTE lo que quedó escrito en la fila...
      expect(devuelto.createdAt.getTime()).toBe(fila.createdAt.getTime());
      // ...y por lo tanto NO es la fecha desviada con la que se construyó.
      expect(devuelto.createdAt.getTime()).not.toBe(movimiento.createdAt.getTime());
    });

    /**
     * Segundo criterio de aceptación del issue #159: el orden de la bitácora
     * tiene que sobrevivir un salto del reloj del PROCESO entre dos asientos
     * consecutivos — es justo la propiedad de la que depende "stock a la
     * fecha X" y la trazabilidad del #153. Acá el salto es hacia ATRÁS: el
     * segundo movimiento se crea con un `createdAt` en memoria ANTERIOR al
     * del primero, que es el caso que de verdad podría invertir el orden si
     * la fecha la siguiera poniendo el proceso.
     *
     * Contra el reloj REAL de Postgres —que no retrocede— el segundo INSERT
     * ocurre después en tiempo real, así que su `created_at` tiene que quedar
     * igual o posterior al del primero pase lo que pase con el reloj del
     * proceso.
     */
    it('dos movimientos en secuencia quedan ordenados por created_at aunque el reloj del proceso salte hacia atrás entre uno y otro', async () => {
      let primero: MovimientoInsumoEntity;
      let segundo: MovimientoInsumoEntity;

      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        const ahora = new Date();
        // Primer asiento: reloj del proceso 10 minutos ADELANTADO.
        vi.setSystemTime(new Date(ahora.getTime() + 10 * 60 * 1000));
        primero = construirMovimiento('ENTRADA', 1);
        await txRunner.run(() => repo.insert(primero));

        // Segundo asiento: el reloj del proceso SALTA hacia atrás 20 minutos
        // respecto de sí mismo — quedaría ANTES que el primero si la fecha
        // saliera del proceso.
        vi.setSystemTime(new Date(ahora.getTime() - 10 * 60 * 1000));
        segundo = construirMovimiento('ENTRADA', 2);
        expect(segundo.createdAt.getTime()).toBeLessThan(primero.createdAt.getTime());

        await txRunner.run(() => repo.insert(segundo));
      } finally {
        vi.useRealTimers();
      }

      const [filaPrimero, filaSegundo] = await Promise.all([
        tenantClient.movimientoInsumo.findUniqueOrThrow({ where: { id: primero.id } }),
        tenantClient.movimientoInsumo.findUniqueOrThrow({ where: { id: segundo.id } }),
      ]);

      expect(filaSegundo.createdAt.getTime()).toBeGreaterThanOrEqual(
        filaPrimero.createdAt.getTime(),
      );
    });
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

      expect(sumas.NUEVO.ENTRADA).toBe(15);
      expect(sumas.NUEVO.SALIDA).toBe(3);
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

      expect(sumas.NUEVO.ENTRADA).toBe(10);
      expect(sumas.NUEVO.SALIDA).toBe(3);
      expect(sumas.NUEVO.AJUSTE_POSITIVO).toBe(0);
      expect(sumas.NUEVO.AJUSTE_NEGATIVO).toBe(0);
    });

    /**
     * Las claves se derivan de `TIPOS_MOVIMIENTO_INSUMO` y no se enumeran a
     * mano: el día que entre un quinto tipo, este assert lo exige acá sin que
     * nadie tenga que acordarse de venir.
     */
    it('devuelve exactamente los tipos del catálogo, ni uno más ni uno menos', async () => {
      await sembrar(insumoId, [{ tipo: 'ENTRADA', cantidad: 1 }]);

      const sumas = await txRunner.run(() => repo.lockAndSumByTipo(insumoId));

      expect(Object.keys(sumas).sort()).toEqual([...CONDICIONES_STOCK].sort());
      for (const condicion of CONDICIONES_STOCK) {
        expect(Object.keys(sumas[condicion]).sort()).toEqual([...TIPOS_MOVIMIENTO_INSUMO].sort());
      }
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

      expect(sumas).toEqual(sumasEnCero());
    });

    /**
     * El desglose se agrupa por (condición, tipo): los movimientos USADO no se
     * mezclan con los NUEVO. Se siembran por SQL directo porque ningún caso de
     * uso escribe USADO todavía. Hay filas en las dos condiciones y en los
     * mismos tipos, para que un GROUP BY que ignorara la condición sume 15 y
     * no 10 / 5.
     */
    it('agrupa por condición: NUEVO y USADO quedan independientes', async () => {
      await sembrar(insumoId, [
        { tipo: 'ENTRADA', cantidad: 10, condicion: 'NUEVO' },
        { tipo: 'SALIDA', cantidad: 4, condicion: 'NUEVO' },
        { tipo: 'ENTRADA', cantidad: 5, condicion: 'USADO' },
        { tipo: 'AJUSTE_NEGATIVO', cantidad: 1.5, condicion: 'USADO' },
      ]);

      const sumas = await txRunner.run(() => repo.lockAndSumByTipo(insumoId));

      expect(sumas).toEqual(
        sumasCon({
          NUEVO: { ENTRADA: 10, SALIDA: 4 },
          USADO: { ENTRADA: 5, AJUSTE_NEGATIVO: 1.5 },
        }),
      );
    });

    it('un insumo sin movimientos USADO devuelve la condición USADO en cero', async () => {
      await sembrar(insumoId, [{ tipo: 'ENTRADA', cantidad: 10 }]);

      const sumas = await txRunner.run(() => repo.lockAndSumByTipo(insumoId));

      expect(sumas.NUEVO.ENTRADA).toBe(10);
      expect(sumas.USADO).toEqual(sumasEnCero().USADO);
    });

    it('no suma los movimientos de otro insumo', async () => {
      await sembrar(insumoId, [{ tipo: 'ENTRADA', cantidad: 10 }]);
      await sembrar(otroInsumoId, [{ tipo: 'ENTRADA', cantidad: 99 }]);

      const sumas = await txRunner.run(() => repo.lockAndSumByTipo(insumoId));

      expect(sumas.NUEVO.ENTRADA).toBe(10);
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

      expect(typeof sumas.NUEVO.ENTRADA).toBe('number');
      expect(sumas.NUEVO.ENTRADA).toBe(3.75);
      expect(typeof sumas.NUEVO.AJUSTE_NEGATIVO).toBe('number');
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

      expect(sumas.NUEVO.ENTRADA).toBe(8);
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

      expect(sumas.NUEVO.ENTRADA).toBe(10);
      expect(sumas.NUEVO.SALIDA).toBe(4);
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

      expect(sumas.NUEVO).toEqual({
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

      expect(sumas).toEqual(sumasEnCero());
    });

    /**
     * El desglose se agrupa por (condición, tipo): los movimientos USADO no se
     * mezclan con los NUEVO. Se siembran por SQL directo porque ningún caso de
     * uso escribe USADO todavía. Hay filas en las dos condiciones y en los
     * mismos tipos, para que un GROUP BY que ignorara la condición sume 15 y
     * no 10 / 5.
     */
    it('agrupa por condición: NUEVO y USADO quedan independientes', async () => {
      await sembrar(insumoId, [
        { tipo: 'ENTRADA', cantidad: 10, condicion: 'NUEVO' },
        { tipo: 'SALIDA', cantidad: 4, condicion: 'NUEVO' },
        { tipo: 'ENTRADA', cantidad: 5, condicion: 'USADO' },
        { tipo: 'AJUSTE_NEGATIVO', cantidad: 1.5, condicion: 'USADO' },
      ]);

      const sumas = await repo.sumByTipo(insumoId);

      expect(sumas).toEqual(
        sumasCon({
          NUEVO: { ENTRADA: 10, SALIDA: 4 },
          USADO: { ENTRADA: 5, AJUSTE_NEGATIVO: 1.5 },
        }),
      );
    });

    it('un insumo sin movimientos USADO devuelve la condición USADO en cero', async () => {
      await sembrar(insumoId, [{ tipo: 'ENTRADA', cantidad: 10 }]);

      const sumas = await repo.sumByTipo(insumoId);

      expect(sumas.NUEVO.ENTRADA).toBe(10);
      expect(sumas.USADO).toEqual(sumasEnCero().USADO);
    });

    it('no suma los movimientos de otro insumo', async () => {
      await sembrar(insumoId, [{ tipo: 'ENTRADA', cantidad: 10 }]);
      await sembrar(otroInsumoId, [{ tipo: 'ENTRADA', cantidad: 99 }]);

      const sumas = await repo.sumByTipo(insumoId);

      expect(sumas.NUEVO.ENTRADA).toBe(10);
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

      expect(typeof sumas.NUEVO.ENTRADA).toBe('number');
      expect(sumas.NUEVO.ENTRADA).toBe(3.75);
      expect(typeof sumas.NUEVO.AJUSTE_NEGATIVO).toBe('number');
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
        expect(sumas.NUEVO.ENTRADA).toBe(4);
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

      expect(sumas.NUEVO.ENTRADA).toBe(6);
    });
  });

  describe('listarPorInsumo()', () => {
    /**
     * Instantes separados y fijos: el orden que se prueba es el del reloj de
     * la fila, no el de inserción. Se siembran a propósito en un orden
     * distinto del esperado, para que una consulta sin `orderBy` no pueda
     * pasar por casualidad.
     */
    const T_VIEJO = new Date('2026-03-01T10:00:00.000Z');
    const T_MEDIO = new Date('2026-03-02T10:00:00.000Z');
    const T_NUEVO = new Date('2026-03-03T10:00:00.000Z');

    /** Lee los ids de la bitácora de un insumo directo de la base, sin pasar por el repositorio. */
    async function idsEnBase(idDelInsumo: string): Promise<string[]> {
      const filas = await tenantClient.movimientoInsumo.findMany({
        where: { insumoId: idDelInsumo },
        select: { id: true },
      });
      return filas.map((fila) => fila.id);
    }

    it('devuelve los movimientos del insumo ordenados por createdAt descendente', async () => {
      await sembrar(insumoId, [
        { tipo: 'ENTRADA', cantidad: 10, createdAt: T_MEDIO },
        { tipo: 'SALIDA', cantidad: 3, createdAt: T_VIEJO },
        { tipo: 'AJUSTE_POSITIVO', cantidad: 7, createdAt: T_NUEVO },
      ]);

      const pagina = await repo.listarPorInsumo(insumoId);

      expect(pagina.movimientos.map((m) => m.tipo)).toEqual([
        'AJUSTE_POSITIVO',
        'ENTRADA',
        'SALIDA',
      ]);
      expect(pagina.movimientos.map((m) => m.createdAt.getTime())).toEqual([
        T_NUEVO.getTime(),
        T_MEDIO.getTime(),
        T_VIEJO.getTime(),
      ]);
    });

    /**
     * El asiento ajeno se siembra MÁS NUEVO que el propio a propósito: una
     * consulta sin `where` por insumo lo pondría primero, así que el caso
     * falla por la razón correcta en vez de por un conteo que podría cuadrar
     * de casualidad. El fixture ya tiene un segundo insumo justamente para que
     * este assert no pase sobre una tabla donde no hay nada ajeno.
     */
    it('no trae los movimientos de otro insumo', async () => {
      await sembrar(insumoId, [{ tipo: 'ENTRADA', cantidad: 10, createdAt: T_MEDIO }]);
      await sembrar(otroInsumoId, [{ tipo: 'ENTRADA', cantidad: 99, createdAt: T_NUEVO }]);
      const ajenos = await idsEnBase(otroInsumoId);
      expect(ajenos).toHaveLength(1);

      const pagina = await repo.listarPorInsumo(insumoId);

      expect(pagina.total).toBe(1);
      expect(pagina.movimientos).toHaveLength(1);
      expect(pagina.movimientos.map((m) => m.id)).not.toContain(ajenos[0]);
      expect(pagina.movimientos.every((m) => m.insumoId === insumoId)).toBe(true);
    });

    /**
     * `total` es el universo del insumo, no el tamaño de la página: es el dato
     * con el que la pantalla decide cuántas páginas hay. Se siembran más
     * movimientos que el `limit` para que los dos números no puedan coincidir,
     * y se le da bitácora al otro insumo para que el total tampoco pueda venir
     * de contar la tabla entera.
     */
    it('cuenta en total el universo del insumo, no el tamaño de la página', async () => {
      await sembrar(insumoId, [
        { tipo: 'ENTRADA', cantidad: 1, createdAt: new Date('2026-03-01T10:00:00.000Z') },
        { tipo: 'ENTRADA', cantidad: 2, createdAt: new Date('2026-03-02T10:00:00.000Z') },
        { tipo: 'ENTRADA', cantidad: 3, createdAt: new Date('2026-03-03T10:00:00.000Z') },
        { tipo: 'ENTRADA', cantidad: 4, createdAt: new Date('2026-03-04T10:00:00.000Z') },
        { tipo: 'ENTRADA', cantidad: 5, createdAt: new Date('2026-03-05T10:00:00.000Z') },
      ]);
      await sembrar(otroInsumoId, [{ tipo: 'ENTRADA', cantidad: 99, createdAt: T_NUEVO }]);

      const pagina = await repo.listarPorInsumo(insumoId, { limit: 2 });

      expect(pagina.movimientos).toHaveLength(2);
      expect(pagina.total).toBe(5);
    });

    /**
     * Las dos páginas juntas tienen que dar el universo exacto: ningún id
     * repetido entre ellas y ninguno perdido. Es la propiedad que el usuario
     * percibe como "la bitácora está completa", y la que un `orderBy` no
     * determinista rompe primero.
     */
    it('pagina con limit y offset sin repetir ni saltear filas', async () => {
      await sembrar(insumoId, [
        { tipo: 'ENTRADA', cantidad: 1, createdAt: new Date('2026-03-01T10:00:00.000Z') },
        { tipo: 'ENTRADA', cantidad: 2, createdAt: new Date('2026-03-02T10:00:00.000Z') },
        { tipo: 'SALIDA', cantidad: 3, createdAt: new Date('2026-03-03T10:00:00.000Z') },
        { tipo: 'SALIDA', cantidad: 4, createdAt: new Date('2026-03-04T10:00:00.000Z') },
      ]);
      const universo = await idsEnBase(insumoId);

      const primera = await repo.listarPorInsumo(insumoId, { limit: 2, offset: 0 });
      const segunda = await repo.listarPorInsumo(insumoId, { limit: 2, offset: 2 });

      const idsPrimera = primera.movimientos.map((m) => m.id);
      const idsSegunda = segunda.movimientos.map((m) => m.id);
      expect(idsPrimera).toHaveLength(2);
      expect(idsSegunda).toHaveLength(2);
      expect(idsPrimera.filter((id) => idsSegunda.includes(id))).toEqual([]);
      expect([...idsPrimera, ...idsSegunda].sort()).toEqual([...universo].sort());
      expect(primera.total).toBe(4);
      expect(segunda.total).toBe(4);
    });

    /**
     * **El caso que justifica que el orden sea compuesto.** Los tres asientos
     * comparten el MISMO `createdAt`, así que ordenar solo por fecha deja el
     * desempate en manos del plan de ejecución: con `limit`/`offset`, cada
     * página es una consulta independiente, y sobre una clave no única nada
     * obliga a que dos de ellas desempaten igual — una fila puede repetirse en
     * dos páginas y otra no aparecer en ninguna.
     *
     * Los ids se siembran EXPLÍCITOS y en orden ASCENDENTE a propósito, que es
     * lo único que le da al caso poder de detección real. Con ids aleatorios,
     * el orden físico de las tres filas coincide con el orden de inserción y
     * una consulta sin desempate devuelve las tres igual, sin repetir ninguna:
     * el caso pasaría en verde sobre la implementación defectuosa (verificado
     * quitando el `{ id: 'desc' }`). Insertándolos ascendentes, el orden
     * esperado —`id` DESC— es exactamente el INVERSO del físico, así que el
     * assert de secuencia distingue las dos implementaciones sin depender del
     * azar.
     */
    it('desempata por id descendente cuando el createdAt es el mismo, sin repetir ni perder filas', async () => {
      const mismoInstante = new Date('2026-03-06T12:00:00.000Z');
      // `randomUUID()` emite hexadecimal en minúsculas, y Postgres compara
      // `uuid` byte a byte: el orden de `sort()` sobre estos strings es el
      // mismo que el de la columna.
      const idsAscendentes = [randomUUID(), randomUUID(), randomUUID()].sort();
      await sembrar(
        insumoId,
        idsAscendentes.map((id, indice) => ({
          tipo: 'ENTRADA' as TipoMovimientoInsumo,
          cantidad: indice + 1,
          id,
          createdAt: mismoInstante,
        })),
      );

      const recorridas: string[] = [];
      for (let offset = 0; offset < idsAscendentes.length; offset += 1) {
        const pagina = await repo.listarPorInsumo(insumoId, { limit: 1, offset });
        expect(pagina.movimientos).toHaveLength(1);
        recorridas.push(pagina.movimientos[0].id);
      }

      expect(recorridas).toEqual([...idsAscendentes].reverse());
      expect(new Set(recorridas).size).toBe(idsAscendentes.length);
    });

    it('sin paginación devuelve todos los movimientos del insumo', async () => {
      await sembrar(insumoId, [
        { tipo: 'ENTRADA', cantidad: 1, createdAt: T_VIEJO },
        { tipo: 'ENTRADA', cantidad: 2, createdAt: T_MEDIO },
        { tipo: 'SALIDA', cantidad: 3, createdAt: T_NUEVO },
      ]);

      const pagina = await repo.listarPorInsumo(insumoId, undefined);

      expect(pagina.movimientos).toHaveLength(3);
      expect(pagina.total).toBe(3);
    });

    /**
     * La trazabilidad del origen es el dato que motiva todo el listado: sin
     * él, la bitácora no puede contestar de qué compra vino una entrada. Se
     * siembra un asiento CON origen y otro SIN, y se assertea contra el
     * `itemCompraId` del fixture —no contra un literal—, así el caso no puede
     * quedar satisfecho por una implementación que devuelva un id fijo.
     */
    it('conserva el itemCompraId de cada asiento en el viaje de vuelta', async () => {
      await sembrar(insumoId, [
        { tipo: 'ENTRADA', cantidad: 6, createdAt: T_NUEVO, itemCompraId },
        { tipo: 'SALIDA', cantidad: 2, createdAt: T_VIEJO },
      ]);

      const pagina = await repo.listarPorInsumo(insumoId);

      expect(pagina.movimientos.map((m) => m.itemCompraId)).toEqual([itemCompraId, null]);
    });
  });
});

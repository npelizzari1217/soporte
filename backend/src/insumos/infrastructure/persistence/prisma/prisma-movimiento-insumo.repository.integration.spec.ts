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
 * necesita su propio pool instrumentado para demostrar paralelismo real.
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
import { MovimientoInsumoEntity } from '../../../domain/entities/movimiento-insumo.entity';
import {
  TIPOS_MOVIMIENTO_INSUMO,
  TipoMovimientoInsumo,
} from '../../../domain/entities/tipo-movimiento-insumo';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

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
  });

  // Orden obligado por las FK con RESTRICT: primero la bitácora, después los
  // insumos, y al final los catálogos a los que referencian.
  afterAll(async () => {
    await limpiarMovimientos();
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
});

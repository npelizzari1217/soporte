/**
 * [INTEGRATION] Constraints de `movimientos_insumo` contra Postgres REAL
 * (`soporte_tenant_test`).
 *
 * La migración `20260906120000_movimientos_insumo` toma decisiones que NINGÚN
 * test de unidad puede sostener, porque viven en la base y no en el código: el
 * catálogo cerrado de `tipo`, el `CHECK (cantidad > 0)`, el `ON DELETE
 * RESTRICT` de la FK al insumo, la ausencia estructural de `updated_at` y
 * `deleted_at`, y la trazabilidad nullable a equipo y sector. Este spec existe
 * para que revertirlas ponga algo en rojo.
 *
 * Calcado de `catalogo-insumos-constraints.integration.spec.ts` (Entrega 1):
 * fixtures propios prefijados `MOV_TEST_*`, porque la DB de test es COMPARTIDA
 * y el cleanup del `afterAll` va acotado por prefijo — nunca un TRUNCATE
 * global.
 *
 * El sujeto bajo prueba es la restricción de integridad de la base, no la
 * validación de aplicación: la entidad de dominio, el puerto y el repositorio
 * son las unidades 2 y 3 de `insumos-entrega-2` y todavía no existen.
 *
 * Ref design: openspec/changes/insumos-entrega-2/design.md, decisiones 1 y 4.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  CONDICIONES_STOCK,
  TIPOS_AJUSTE_INSUMO,
  TIPOS_MOVIMIENTO_INSUMO,
} from '../../../domain/entities/tipo-movimiento-insumo';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('Movimientos de insumo — constraints de la migración', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;

  /** Prefijo único por corrida: dos procesos en paralelo no se pisan. */
  const PREFIJO = `MOV_TEST_${randomBytes(2).toString('hex')}`;

  let insumoId: string;
  let equipoId: string;
  let sectorId: string;

  /** Quien registra el movimiento: soft ref a `master.usuarios.id`, sin FK. */
  const usuarioId = randomUUID();

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}_TONER`, nombre: 'Tóner de test' },
    });

    const unidad = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}_UN`, nombre: 'Unidad de test' },
    });

    const insumo = await tenantClient.insumo.create({
      data: {
        codigo: `${PREFIJO}_INS`,
        nombre: 'Insumo de test',
        familiaId: familia.id,
        unidadMedidaId: unidad.id,
      },
    });
    insumoId = insumo.id;

    const equipo = await tenantClient.equipoInformatico.create({
      data: { nombre: `${PREFIJO}_EQUIPO` },
    });
    equipoId = equipo.id;

    const sector = await tenantClient.sector.create({
      data: { codigo: `${PREFIJO}_SEC`, nombre: 'Sector de test' },
    });
    sectorId = sector.id;
  });

  afterAll(async () => {
    // Orden por FKs: la bitácora antes que el insumo, el equipo y el sector.
    await tenantClient.movimientoInsumo.deleteMany({ where: { insumoId } });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.equipoInformatico.deleteMany({ where: { nombre: { startsWith: PREFIJO } } });
    await tenantClient.sector.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await prismaService.onModuleDestroy();
  });

  describe('tipo — catálogo CERRADO por CHECK', () => {
    // Se asserta el NOMBRE del constraint, no un `toThrow()` pelado: con
    // `toThrow()` un fixture roto —un insumo inexistente, por ejemplo— haría
    // pasar el test por el motivo equivocado.
    it('rechaza un tipo fuera del catálogo', async () => {
      await expect(
        tenantClient.movimientoInsumo.create({
          data: { insumoId, tipo: 'DEVOLUCION', cantidad: 1, usuarioId },
        }),
      ).rejects.toThrow(/movimientos_insumo_tipo_check/);
    });

    // Hermano invertido: sin estos casos, un CHECK que rechazara TODO valor
    // dejaría el test de arriba en verde sin probar nada.
    it.each([...TIPOS_MOVIMIENTO_INSUMO])('acepta el tipo %s', async (tipo) => {
      const creado = await tenantClient.movimientoInsumo.create({
        data: { insumoId, tipo, cantidad: 1, usuarioId },
      });

      expect(creado.tipo).toBe(tipo);
    });

    /**
     * El CHECK enumera valores que TypeScript también enumera. El riesgo NO es
     * que un usuario mande un valor inválido —los tipos salen de literales del
     * código, no del body HTTP—: es la DERIVA. Agregar un tipo a
     * `TIPOS_MOVIMIENTO_INSUMO` y olvidar la migración hace que el INSERT lo
     * rechace el CHECK y, sin filtro global de excepciones, salga como 500.
     * Mismo patrón que `prisma_tenant/compras-checks.integration.spec.ts`.
     */
    it('el CHECK real enumera exactamente TIPOS_MOVIMIENTO_INSUMO', async () => {
      const filas = await tenantClient.$queryRaw<{ def: string }[]>`
        SELECT pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE conname = 'movimientos_insumo_tipo_check'
      `;

      expect(filas).toHaveLength(1);
      const enLaDb = [...filas[0].def.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();
      expect(enLaDb).toEqual([...TIPOS_MOVIMIENTO_INSUMO].sort());
    });
  });

  describe('condicion — catálogo CERRADO por CHECK', () => {
    it('rechaza una condición fuera del catálogo', async () => {
      await expect(
        tenantClient.movimientoInsumo.create({
          data: { insumoId, tipo: 'ENTRADA', condicion: 'RECUPERADO', cantidad: 1, usuarioId },
        }),
      ).rejects.toThrow(/movimientos_insumo_condicion_check/);
    });

    it.each([...CONDICIONES_STOCK])('acepta la condición %s', async (condicion) => {
      const creado = await tenantClient.movimientoInsumo.create({
        data: { insumoId, tipo: 'ENTRADA', condicion, cantidad: 1, usuarioId },
      });

      expect(creado.condicion).toBe(condicion);
    });

    // La migración es aditiva y conserva el default: un INSERT sin la columna
    // (una fila previa, o un binario anterior) queda NUEVO.
    it('un INSERT sin condicion queda NUEVO', async () => {
      const filas = await tenantClient.$queryRaw<{ condicion: string }[]>`
        INSERT INTO movimientos_insumo (insumo_id, tipo, cantidad, usuario_id)
        VALUES (${insumoId}::uuid, 'ENTRADA', 1, ${usuarioId}::uuid)
        RETURNING condicion
      `;

      expect(filas).toHaveLength(1);
      expect(filas[0].condicion).toBe('NUEVO');
    });

    it('el CHECK real enumera exactamente CONDICIONES_STOCK', async () => {
      const filas = await tenantClient.$queryRaw<{ def: string }[]>`
        SELECT pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE conname = 'movimientos_insumo_condicion_check'
      `;

      expect(filas).toHaveLength(1);
      const enLaDb = [...filas[0].def.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();
      expect(enLaDb).toEqual([...CONDICIONES_STOCK].sort());
    });
  });

  describe('cantidad — CHECK > 0', () => {
    // El signo lo da el `tipo`, no el número: sin este CHECK la misma salida
    // se podría escribir de dos formas (SALIDA de 5 o ENTRADA de -5) y la suma
    // del stock no sabría cuál es la buena.
    it.each([
      ['negativa', -1],
      ['cero', 0],
    ])('rechaza una cantidad %s', async (_caso, cantidad) => {
      await expect(
        tenantClient.movimientoInsumo.create({
          data: { insumoId, tipo: 'ENTRADA', cantidad, usuarioId },
        }),
      ).rejects.toThrow(/movimientos_insumo_cantidad_check/);
    });

    it('acepta 0.01 — el borde permitido con Decimal(10,2), no un valor cualquiera', async () => {
      const creado = await tenantClient.movimientoInsumo.create({
        data: { insumoId, tipo: 'ENTRADA', cantidad: 0.01, usuarioId },
      });

      expect(Number(creado.cantidad)).toBe(0.01);
    });
  });

  describe('insumo — FK con ON DELETE RESTRICT', () => {
    // Borrar el insumo no debe llevarse puesta su bitácora: los movimientos
    // son el registro contable de quién sacó qué y por qué, y el stock ES esa
    // suma. El camino correcto es desactivarlo.
    it('no deja borrar un insumo que tiene movimientos', async () => {
      await tenantClient.movimientoInsumo.create({
        data: { insumoId, tipo: 'ENTRADA', cantidad: 3, usuarioId },
      });

      await expect(tenantClient.insumo.delete({ where: { id: insumoId } })).rejects.toMatchObject({
        code: 'P2003',
      });
    });

    it('sí deja desactivarlo', async () => {
      const desactivado = await tenantClient.insumo.update({
        where: { id: insumoId },
        data: { activo: false },
      });

      expect(desactivado.activo).toBe(false);

      await tenantClient.insumo.update({ where: { id: insumoId }, data: { activo: true } });
    });
  });

  describe('trazabilidad de la salida — equipo y sector', () => {
    // HAY UN SOLO STOCK: `equipo_id` y `sector_id` registran a DÓNDE fue lo que
    // salió, no de qué depósito salió. Por eso los dos son NULLABLE y ninguno
    // participa de la suma.
    it('acepta un movimiento sin equipo ni sector', async () => {
      const creado = await tenantClient.movimientoInsumo.create({
        data: { insumoId, tipo: 'SALIDA', cantidad: 2, usuarioId },
      });

      expect(creado.equipoId).toBeNull();
      expect(creado.sectorId).toBeNull();
    });

    it('acepta un movimiento con equipo y sector', async () => {
      const creado = await tenantClient.movimientoInsumo.create({
        data: { insumoId, tipo: 'SALIDA', cantidad: 2, usuarioId, equipoId, sectorId },
      });

      expect(creado.equipoId).toBe(equipoId);
      expect(creado.sectorId).toBe(sectorId);
    });

    // Hermano invertido de los dos de arriba: nullable NO es "sin FK". Un id
    // inventado tiene que rebotar, o la trazabilidad apuntaría a la nada.
    it.each([
      ['equipoId', () => ({ equipoId: randomUUID() })],
      ['sectorId', () => ({ sectorId: randomUUID() })],
    ])('rechaza un %s inexistente', async (_campo, extra) => {
      await expect(
        tenantClient.movimientoInsumo.create({
          data: { insumoId, tipo: 'SALIDA', cantidad: 1, usuarioId, ...extra() },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('no deja borrar un equipo que quedó registrado en un movimiento', async () => {
      await tenantClient.movimientoInsumo.create({
        data: { insumoId, tipo: 'SALIDA', cantidad: 1, usuarioId, equipoId },
      });

      await expect(
        tenantClient.equipoInformatico.delete({ where: { id: equipoId } }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });
  });

  describe('motivo — la regla del ajuste es del dominio, no de la base', () => {
    // La base ACEPTA un ajuste sin motivo a propósito: el CHECK condicional
    // sería un segundo dueño de una regla que ya vive en el dominio
    // (`MovimientoInsumoEntity.create`), y dos dueños de la misma regla
    // derivan. Este test fija esa división de responsabilidades: si alguien
    // agrega el CHECK, se entera acá y no en producción con un 500.
    //
    // Se recorre DESDE `TIPOS_AJUSTE_INSUMO`: las dos direcciones del ajuste
    // tienen que comportarse igual frente a la base, y enumerarlas a mano acá
    // dejaría a una sin cubrir el día que se agregue otra.
    it.each([...TIPOS_AJUSTE_INSUMO])('la base acepta un %s sin motivo', async (tipo) => {
      const creado = await tenantClient.movimientoInsumo.create({
        data: { insumoId, tipo, cantidad: 1, usuarioId },
      });

      expect(creado.motivo).toBeNull();
    });

    it.each([...TIPOS_AJUSTE_INSUMO])('y también un %s con motivo', async (tipo) => {
      const creado = await tenantClient.movimientoInsumo.create({
        data: {
          insumoId,
          tipo,
          cantidad: 1,
          usuarioId,
          motivo: 'Conteo físico: faltaban 2 unidades',
        },
      });

      expect(creado.motivo).toBe('Conteo físico: faltaban 2 unidades');
    });
  });

  describe('append-only por estructura', () => {
    // No es un CHECK: es la AUSENCIA de las columnas. Un movimiento no se
    // edita ni se borra, se corrige con otro movimiento. Mismo criterio que
    // `operaciones_compra` (ADR-C4).
    it('la tabla NO tiene columnas updated_at ni deleted_at', async () => {
      const columnas = await tenantClient.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'movimientos_insumo'
      `;
      const nombres = columnas.map((c) => c.column_name);

      // Guarda contra el verde falso del assert de ausencia sobre un fixture
      // vacío: si la consulta no devolviera nada, los dos `not.toContain` de
      // abajo pasarían igual.
      expect(nombres).toContain('created_at');
      expect(nombres).not.toContain('updated_at');
      expect(nombres).not.toContain('deleted_at');
    });
  });

  describe('índice de la consulta de stock por insumo', () => {
    // El stock es `SUM(cantidad) WHERE insumo_id = $1`, y la ficha del insumo
    // lista su bitácora por fecha. El índice compuesto sirve a las dos: su
    // prefijo `insumo_id` cubre la suma. Sin él, cada consulta de stock es un
    // seq scan de TODA la bitácora del inquilino.
    it('existe el índice (insumo_id, created_at)', async () => {
      const indices = await tenantClient.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'movimientos_insumo'
          AND indexname = 'movimientos_insumo_insumo_id_created_at_idx'
      `;

      expect(indices).toHaveLength(1);
      expect(indices[0].indexdef).toMatch(/\(insumo_id, created_at\)/);
    });
  });
});

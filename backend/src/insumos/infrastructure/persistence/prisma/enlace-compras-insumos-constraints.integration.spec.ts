/**
 * [INTEGRATION] Constraints del enlace entre compras e insumos contra Postgres
 * REAL (`soporte_tenant_test`).
 *
 * La migración `20260907120000_enlace_compras_insumos` agrega dos columnas
 * nullables —`items_compra.insumo_id` y `movimientos_insumo.item_compra_id`— y
 * toma sobre ellas decisiones que ningún test de unidad puede sostener, porque
 * viven en la base y no en el código: que el NULL se acepte (los ítems
 * históricos quedan así para siempre, sin backfill), que un id inventado
 * rebote igual —nullable NO es "sin FK"—, que el `ON DELETE RESTRICT` frene el
 * borrado en vez de vaciar el vínculo, y que las dos FK tengan su índice
 * parcial. Este spec existe para que revertir cualquiera de esas decisiones
 * ponga algo en rojo.
 *
 * Calcado de `movimientos-insumo-constraints.integration.spec.ts` (Entrega 2):
 * fixtures propios prefijados `ENL_TEST_*`, porque la DB de test es COMPARTIDA
 * y el cleanup del `afterAll` va acotado por prefijo — nunca un TRUNCATE
 * global.
 *
 * Los rechazos se afirman por el NOMBRE del constraint y no con un `toThrow()`
 * pelado: con `toThrow()` un fixture roto —un insumo inexistente en la fila de
 * apoyo, por ejemplo— haría pasar el test por el motivo equivocado.
 *
 * El sujeto bajo prueba es la restricción de integridad de la base, no la
 * validación de aplicación: el dominio, los repositorios y el enganche de la
 * recepción son las unidades 2 a 7 de `insumos-entrega-3` y todavía no
 * existen.
 *
 * Ref design: openspec/changes/insumos-entrega-3/design.md, decisiones 2 y 6.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('Enlace compras ↔ insumos — constraints de la migración', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;

  /** Prefijo único por corrida: dos procesos en paralelo no se pisan. */
  const PREFIJO = `ENL_TEST_${randomBytes(2).toString('hex')}`;

  let familiaId: string;
  let unidadMedidaId: string;
  let insumoId: string;
  let cicloId: string;
  let compraId: string;
  let itemCompraId: string;

  /** Quien registra el movimiento: soft ref a `master.usuarios.id`, sin FK. */
  const usuarioId = randomUUID();

  /**
   * Crea un insumo válido y devuelve su id. Reutiliza la familia y la unidad
   * del fixture: lo que varía entre casos es el insumo, no su catálogo de
   * apoyo.
   */
  async function crearInsumo(sufijo: string): Promise<string> {
    const insumo = await tenantClient.insumo.create({
      data: {
        codigo: `${PREFIJO}_${sufijo}`,
        nombre: `Insumo de test ${sufijo}`,
        familiaId,
        unidadMedidaId,
      },
    });
    return insumo.id;
  }

  /**
   * Crea un ítem de compra sobre la compra del fixture y devuelve su id.
   *
   * @param insumoIdDelItem Insumo del catálogo, o `null` para el ítem
   *   histórico de texto libre.
   */
  async function crearItemCompra(insumoIdDelItem: string | null): Promise<string> {
    const item = await tenantClient.itemCompra.create({
      data: {
        compraId,
        descripcion: 'Ítem de test',
        cantidad: 10,
        proveedor: 'Proveedor de test',
        monto: 1000,
        fechaCotizacion: new Date('2026-01-01'),
        insumoId: insumoIdDelItem,
      },
    });
    return item.id;
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}_TONER`, nombre: 'Tóner de test' },
    });
    familiaId = familia.id;

    const unidad = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}_UN`, nombre: 'Unidad de test' },
    });
    unidadMedidaId = unidad.id;

    insumoId = await crearInsumo('INS');

    // `activo: false` A PROPÓSITO, mismo criterio que
    // `compras-checks.integration.spec.ts`: `findActive()` resuelve el ciclo
    // vigente con un `findFirst` sin `orderBy`, así que un ciclo activo de más
    // en la DB compartida vuelve intermitente a cualquier spec que lo
    // consulte. Acá solo hace falta un destino de FK válido.
    const ciclo = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: randomUUID(),
        nombre: `${PREFIJO} ciclo`,
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: false,
      },
    });
    cicloId = ciclo.id;

    const compra = await tenantClient.compra.create({
      data: {
        numero: `${PREFIJO}`.slice(0, 20),
        fechaSolicitud: new Date('2026-01-01'),
        motivo: 'Compra de test',
        solicitanteId: randomUUID(),
        cicloId,
      },
    });
    compraId = compra.id;

    itemCompraId = await crearItemCompra(insumoId);
  });

  afterAll(async () => {
    // Orden por FKs: las hijas antes que las padres.
    await tenantClient.movimientoInsumo.deleteMany({ where: { usuarioId } });
    await tenantClient.operacionCompra.deleteMany({ where: { compraId } });
    await tenantClient.itemCompra.deleteMany({ where: { compraId } });
    await tenantClient.compra.deleteMany({ where: { cicloId } });
    await tenantClient.cicloCliente.deleteMany({ where: { id: cicloId } });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await prismaService.onModuleDestroy();
  });

  describe('items_compra.insumo_id — el ítem dice de qué insumo se trata', () => {
    // El caso de los ítems históricos: son texto libre y no hay forma
    // confiable de mapearlos al catálogo, así que la migración NO los
    // backfillea y quedan en NULL para siempre. Este test es el que prueba que
    // la columna nueva no rompió la carga de un ítem como se cargaba ayer.
    it('acepta un ítem sin insumo', async () => {
      const id = await crearItemCompra(null);

      const item = await tenantClient.itemCompra.findUniqueOrThrow({ where: { id } });
      expect(item.insumoId).toBeNull();
    });

    // Hermano invertido: sin este caso, una columna que rechazara TODO valor
    // no nulo dejaría el test de arriba en verde sin probar nada.
    it('acepta un ítem que apunta a un insumo del catálogo', async () => {
      const id = await crearItemCompra(insumoId);

      const item = await tenantClient.itemCompra.findUniqueOrThrow({ where: { id } });
      expect(item.insumoId).toBe(insumoId);
    });

    // Nullable NO es "sin FK": un insumo inventado tiene que rebotar, o el
    // ítem apuntaría a la nada y el enganche de la recepción emitiría stock
    // sobre un insumo que no existe.
    it('rechaza un insumo_id inexistente', async () => {
      await expect(crearItemCompra(randomUUID())).rejects.toThrow(/items_compra_insumo_id_fkey/);
    });

    // ON DELETE RESTRICT y no SET NULL: vaciar el vínculo en silencio dejaría
    // al ítem sin poder explicar el stock que ya emitió. El camino correcto es
    // desactivar el insumo, que tiene baja lógica.
    //
    // Fixtures PROPIOS y no los compartidos: si el RESTRICT no estuviera, este
    // borrado tendría éxito y se llevaría puesto el insumo que usan los demás
    // casos, que fallarían en cadena por un motivo que no es el suyo.
    it('no deja borrar un insumo referenciado por un ítem de compra', async () => {
      const idReferenciado = await crearInsumo('REFERENCIADO');
      await crearItemCompra(idReferenciado);

      await expect(tenantClient.insumo.delete({ where: { id: idReferenciado } })).rejects.toThrow(
        /items_compra_insumo_id_fkey/,
      );
    });

    // Hermano invertido del anterior: el RESTRICT frena por la referencia, no
    // por ser un insumo. Sin este caso, un insumo imborrable por cualquier otro
    // motivo dejaría el test de arriba en verde.
    it('sí deja borrar un insumo que ningún ítem de compra referencia', async () => {
      const idSinReferencias = await crearInsumo('LIBRE');

      await expect(
        tenantClient.insumo.delete({ where: { id: idSinReferencias } }),
      ).resolves.toMatchObject({ id: idSinReferencias });
    });

    // Índice PARCIAL, mismo patrón que `equipos_informaticos_modelo_equipo_id_idx`:
    // sin índice, el RESTRICT de arriba obliga a un seq scan de todos los ítems
    // del inquilino cada vez que alguien borra un insumo. Parcial porque los
    // ítems históricos quedan en NULL para siempre y ninguna consulta los busca
    // por esta columna.
    it('existe el índice parcial sobre insumo_id', async () => {
      const indices = await tenantClient.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'items_compra'
          AND indexname = 'items_compra_insumo_id_idx'
      `;

      expect(indices).toHaveLength(1);
      expect(indices[0].indexdef).toMatch(/WHERE \(insumo_id IS NOT NULL\)/);
    });
  });

  describe('movimientos_insumo.item_compra_id — de qué compra vino la entrada', () => {
    // La entrada manual y toda salida o ajuste no tienen origen en una compra:
    // la columna es nullable justamente para eso. Sin este caso, la columna
    // nueva podría haber roto la bitácora tal como la escribe la Entrega 2.
    it('acepta un movimiento sin ítem de compra', async () => {
      const creado = await tenantClient.movimientoInsumo.create({
        data: { insumoId, tipo: 'ENTRADA', cantidad: 1, usuarioId },
      });

      expect(creado.itemCompraId).toBeNull();
    });

    // Hermano invertido: es la trazabilidad que la columna existe para dar.
    // Sin ella, "¿de qué compra vino esta entrada?" no tiene respuesta.
    it('acepta un movimiento que apunta al ítem de compra que lo originó', async () => {
      const creado = await tenantClient.movimientoInsumo.create({
        data: { insumoId, tipo: 'ENTRADA', cantidad: 2, usuarioId, itemCompraId },
      });

      expect(creado.itemCompraId).toBe(itemCompraId);
    });

    it('rechaza un item_compra_id inexistente', async () => {
      await expect(
        tenantClient.movimientoInsumo.create({
          data: {
            insumoId,
            tipo: 'ENTRADA',
            cantidad: 1,
            usuarioId,
            itemCompraId: randomUUID(),
          },
        }),
      ).rejects.toThrow(/movimientos_insumo_item_compra_id_fkey/);
    });

    // ON DELETE RESTRICT y no SET NULL, mismo criterio que `equipo_id` y
    // `sector_id`: la bitácora es append-only y un SET NULL la reescribiría
    // desde afuera, borrando el origen de una entrada que ya cuenta para el
    // stock.
    //
    // Ítem PROPIO y no el compartido, por el mismo motivo que el borrado del
    // insumo: sin el RESTRICT, el borrado saldría bien y dejaría a los demás
    // casos sin el ítem que referencian.
    it('no deja borrar un ítem de compra referenciado por un movimiento', async () => {
      const idReferenciado = await crearItemCompra(insumoId);
      await tenantClient.movimientoInsumo.create({
        data: { insumoId, tipo: 'ENTRADA', cantidad: 3, usuarioId, itemCompraId: idReferenciado },
      });

      await expect(
        tenantClient.itemCompra.delete({ where: { id: idReferenciado } }),
      ).rejects.toThrow(/movimientos_insumo_item_compra_id_fkey/);
    });

    // Hermano invertido del anterior: el RESTRICT frena por la referencia, no
    // por ser un ítem de compra.
    it('sí deja borrar un ítem de compra sin movimientos', async () => {
      const idSinMovimientos = await crearItemCompra(insumoId);

      await expect(
        tenantClient.itemCompra.delete({ where: { id: idSinMovimientos } }),
      ).resolves.toMatchObject({ id: idSinMovimientos });
    });

    // Índice PARCIAL por el mismo motivo que los de `equipo_id` y `sector_id`:
    // indexa solo las filas que efectivamente registran origen —las entradas
    // por recepción—, y no las salidas, los ajustes ni las entradas manuales,
    // que son la mayoría de la bitácora.
    it('existe el índice parcial sobre item_compra_id', async () => {
      const indices = await tenantClient.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'movimientos_insumo'
          AND indexname = 'movimientos_insumo_item_compra_id_idx'
      `;

      expect(indices).toHaveLength(1);
      expect(indices[0].indexdef).toMatch(/WHERE \(item_compra_id IS NOT NULL\)/);
    });
  });
});

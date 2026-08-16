/**
 * compras-checks.integration.spec.ts — PR-2 (sdd/redisenio-modulo-compras).
 *
 * Un `it` por CADA CHECK de la migración `20260813130000_compras_schema_checks`
 * (design, sección "SCHEMA PRISMA TENANT"). H6 (ver sdd/redisenio-modulo-compras/tasks)
 * fijó que el spec de estos CHECKs vive junto a la migración que los crea —
 * mismo rollback boundary. Cada CHECK se prueba intentando el INSERT raw que
 * lo viola y esperando el rechazo de Postgres: la autoridad es la DB, no la
 * lectura del DDL.
 *
 * Usa un cliente `pg` crudo (no Prisma) — mismo patrón que
 * `prisma-ciclo-repos.integration.spec.ts` (T9.2), que ya verifica un CHECK
 * de esta forma. No pasa por la capa de dominio: el dominio (entidades,
 * casos de uso) recién se construye desde PR-4 en adelante — acá el sujeto
 * bajo prueba es la restricción de integridad de la base, no la validación
 * de aplicación.
 */
import { Client } from 'pg';
import { ESTADOS_APROBACION_ITEM } from '../src/compras/domain/services/estado-compra';
import { TIPOS_OPERACION_COMPRA } from '../src/compras/domain/ports/i-operacion-compra.repository';

/** URL de la DB tenant de test (mismo default usado en otras integration specs del repo). */
const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';

describe('CHECKs de compras/items_compra/operaciones_compra — migración 20260813130000', () => {
  let client: Client;
  let cicloId: string;
  let numeroSeq = 0;

  /**
   * Borra SOLO las filas de este spec, acotadas por su propio `cicloId`.
   *
   * La DB tenant de test es COMPARTIDA con el resto de las integration specs,
   * así que un `DELETE FROM <tabla>` sin filtro le vuela los fixtures a quien
   * corra después. Orden por FKs: hijas antes que padres.
   */
  async function limpiarDatosDeEsteSpec(): Promise<void> {
    await client.query(
      'DELETE FROM operaciones_compra WHERE compra_id IN (SELECT id FROM compras WHERE ciclo_id = $1)',
      [cicloId],
    );
    await client.query(
      'DELETE FROM items_compra WHERE compra_id IN (SELECT id FROM compras WHERE ciclo_id = $1)',
      [cicloId],
    );
    await client.query('DELETE FROM compras WHERE ciclo_id = $1', [cicloId]);
  }

  beforeAll(async () => {
    client = new Client({ connectionString: TENANT_TEST_URL });
    await client.connect();

    // `activo: false` A PROPÓSITO. `PrismaCicloClienteRepository.findActive()`
    // es un `findFirst({ where: { activo: true } })` SIN `orderBy`: con dos
    // ciclos activos, Postgres puede devolver cualquiera de los dos y variar
    // entre corridas. Un ciclo activo de más en la DB compartida vuelve
    // intermitente cualquier spec que resuelva el ciclo activo. Acá sólo hace
    // falta un destino de FK válido, no un ciclo vigente.
    const ciclo = await client.query(
      `INSERT INTO ciclos_cliente (id, ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'Ciclo test CHECKs compras', '2026-01-01', '2026-12-31', false, now())
       RETURNING id`,
    );
    cicloId = ciclo.rows[0].id as string;
  });

  afterAll(async () => {
    await limpiarDatosDeEsteSpec();
    await client.query('DELETE FROM ciclos_cliente WHERE id = $1', [cicloId]);
    await client.end();
  });

  beforeEach(async () => {
    await limpiarDatosDeEsteSpec();
  });

  /** Numero único por test — evita choques con el UNIQUE de `numero` entre corridas del mismo archivo. */
  function siguienteNumero(): string {
    numeroSeq += 1;
    return `COM-2026-${String(90000 + numeroSeq).padStart(5, '0')}`;
  }

  /** Inserta una Compra válida (sin cancelar) y devuelve su id. */
  async function insertCompraValida(): Promise<string> {
    const result = await client.query(
      `INSERT INTO compras (id, numero, fecha_solicitud, motivo, solicitante_id, ciclo_id, updated_at)
       VALUES (gen_random_uuid(), $1, '2026-01-01', 'Motivo de compra de test', gen_random_uuid(), $2, now())
       RETURNING id`,
      [siguienteNumero(), cicloId],
    );
    return result.rows[0].id as string;
  }

  /** Inserta un ItemCompra PENDIENTE válido (todo en default) sobre `compraId`, con overrides opcionales. */
  async function insertItemPendiente(
    compraId: string,
    overrides: { cantidad?: number; monto?: number; moneda?: string } = {},
  ): Promise<string> {
    const cantidad = overrides.cantidad ?? 10;
    const monto = overrides.monto ?? 1000;
    const moneda = overrides.moneda ?? 'ARS';
    const result = await client.query(
      `INSERT INTO items_compra (id, compra_id, descripcion, cantidad, proveedor, monto, moneda, fecha_cotizacion, estado_aprobacion, updated_at)
       VALUES (gen_random_uuid(), $1, 'Item de test', $2, 'Proveedor test', $3, $4, '2026-01-01', 'PENDIENTE', now())
       RETURNING id`,
      [compraId, cantidad, monto, moneda],
    );
    return result.rows[0].id as string;
  }

  // ─── compras_cancelacion_atomica_check ───────────────────────────────────

  describe('CHECK compras_cancelacion_atomica_check', () => {
    it('rechaza cancelada_en seteado sin cancelado_por_id ni motivo_cancelacion', async () => {
      await expect(
        client.query(
          `INSERT INTO compras (id, numero, fecha_solicitud, motivo, solicitante_id, ciclo_id, cancelada_en, updated_at)
           VALUES (gen_random_uuid(), $1, '2026-01-01', 'Motivo', gen_random_uuid(), $2, now(), now())`,
          [siguienteNumero(), cicloId],
        ),
      ).rejects.toThrow(/compras_cancelacion_atomica_check|check constraint/i);
    });

    it('rechaza cancelado_por_id y motivo_cancelacion seteados sin cancelada_en', async () => {
      await expect(
        client.query(
          `INSERT INTO compras (id, numero, fecha_solicitud, motivo, solicitante_id, ciclo_id, cancelado_por_id, motivo_cancelacion, updated_at)
           VALUES (gen_random_uuid(), $1, '2026-01-01', 'Motivo', gen_random_uuid(), $2, gen_random_uuid(), 'Motivo de cancelacion', now())`,
          [siguienteNumero(), cicloId],
        ),
      ).rejects.toThrow(/compras_cancelacion_atomica_check|check constraint/i);
    });

    it('rechaza solo motivo_cancelacion seteado (cancelada_en y cancelado_por_id NULL)', async () => {
      await expect(
        client.query(
          `INSERT INTO compras (id, numero, fecha_solicitud, motivo, solicitante_id, ciclo_id, motivo_cancelacion, updated_at)
           VALUES (gen_random_uuid(), $1, '2026-01-01', 'Motivo', gen_random_uuid(), $2, 'Motivo de cancelacion', now())`,
          [siguienteNumero(), cicloId],
        ),
      ).rejects.toThrow(/compras_cancelacion_atomica_check|check constraint/i);
    });

    it('acepta los 3 campos NULL (compra no cancelada)', async () => {
      const id = await insertCompraValida();
      expect(id).toBeDefined();
    });

    it('acepta los 3 campos seteados (compra cancelada)', async () => {
      const result = await client.query(
        `INSERT INTO compras (id, numero, fecha_solicitud, motivo, solicitante_id, ciclo_id, cancelada_en, cancelado_por_id, motivo_cancelacion, updated_at)
         VALUES (gen_random_uuid(), $1, '2026-01-01', 'Motivo', gen_random_uuid(), $2, now(), gen_random_uuid(), 'Motivo de cancelacion', now())
         RETURNING id`,
        [siguienteNumero(), cicloId],
      );
      expect(result.rowCount).toBe(1);
    });
  });

  // ─── items_compra_cantidad_check ─────────────────────────────────────────

  describe('CHECK items_compra_cantidad_check', () => {
    it('rechaza cantidad = 0', async () => {
      const compraId = await insertCompraValida();
      await expect(insertItemPendiente(compraId, { cantidad: 0 })).rejects.toThrow(
        /items_compra_cantidad_check|check constraint/i,
      );
    });

    it('rechaza cantidad negativa', async () => {
      const compraId = await insertCompraValida();
      await expect(insertItemPendiente(compraId, { cantidad: -1 })).rejects.toThrow(
        /items_compra_cantidad_check|check constraint/i,
      );
    });

    it('acepta cantidad positiva mínima (0.01)', async () => {
      const compraId = await insertCompraValida();
      const id = await insertItemPendiente(compraId, { cantidad: 0.01 });
      expect(id).toBeDefined();
    });
  });

  // ─── items_compra_monto_check ────────────────────────────────────────────

  describe('CHECK items_compra_monto_check', () => {
    it('rechaza monto negativo', async () => {
      const compraId = await insertCompraValida();
      await expect(insertItemPendiente(compraId, { monto: -0.01 })).rejects.toThrow(
        /items_compra_monto_check|check constraint/i,
      );
    });

    it('acepta monto = 0 (borde permitido)', async () => {
      const compraId = await insertCompraValida();
      const id = await insertItemPendiente(compraId, { monto: 0 });
      expect(id).toBeDefined();
    });
  });

  // ─── items_compra_cantidad_comprada_check ────────────────────────────────

  describe('CHECK items_compra_cantidad_comprada_check', () => {
    it('rechaza cantidad_comprada negativa', async () => {
      const compraId = await insertCompraValida();
      const itemId = await insertItemPendiente(compraId, { cantidad: 10 });
      await expect(
        client.query(`UPDATE items_compra SET cantidad_comprada = -1 WHERE id = $1`, [itemId]),
      ).rejects.toThrow(/items_compra_cantidad_comprada_check|check constraint/i);
    });

    it('rechaza cantidad_comprada > cantidad', async () => {
      const compraId = await insertCompraValida();
      const itemId = await insertItemPendiente(compraId, { cantidad: 10 });
      await expect(
        client.query(`UPDATE items_compra SET cantidad_comprada = 10.01 WHERE id = $1`, [itemId]),
      ).rejects.toThrow(/items_compra_cantidad_comprada_check|check constraint/i);
    });

    it('acepta cantidad_comprada === cantidad (borde superior)', async () => {
      const compraId = await insertCompraValida();
      const itemId = await insertItemPendiente(compraId, { cantidad: 10 });
      const result = await client.query(
        `UPDATE items_compra SET cantidad_comprada = 10 WHERE id = $1`,
        [itemId],
      );
      expect(result.rowCount).toBe(1);
    });
  });

  // ─── items_compra_cantidad_entregada_check ───────────────────────────────

  describe('CHECK items_compra_cantidad_entregada_check', () => {
    it('rechaza cantidad_entregada negativa', async () => {
      const compraId = await insertCompraValida();
      const itemId = await insertItemPendiente(compraId, { cantidad: 10 });
      await client.query(`UPDATE items_compra SET cantidad_comprada = 10 WHERE id = $1`, [itemId]);
      await expect(
        client.query(`UPDATE items_compra SET cantidad_entregada = -1 WHERE id = $1`, [itemId]),
      ).rejects.toThrow(/items_compra_cantidad_entregada_check|check constraint/i);
    });

    it('rechaza cantidad_entregada > cantidad_comprada', async () => {
      const compraId = await insertCompraValida();
      const itemId = await insertItemPendiente(compraId, { cantidad: 10 });
      await client.query(`UPDATE items_compra SET cantidad_comprada = 5 WHERE id = $1`, [itemId]);
      await expect(
        client.query(`UPDATE items_compra SET cantidad_entregada = 5.01 WHERE id = $1`, [itemId]),
      ).rejects.toThrow(/items_compra_cantidad_entregada_check|check constraint/i);
    });

    it('acepta cantidad_entregada === cantidad_comprada (borde superior)', async () => {
      const compraId = await insertCompraValida();
      const itemId = await insertItemPendiente(compraId, { cantidad: 10 });
      await client.query(`UPDATE items_compra SET cantidad_comprada = 5 WHERE id = $1`, [itemId]);
      const result = await client.query(
        `UPDATE items_compra SET cantidad_entregada = 5 WHERE id = $1`,
        [itemId],
      );
      expect(result.rowCount).toBe(1);
    });
  });

  // ─── items_compra_estado_aprobacion_check ────────────────────────────────

  describe('CHECK items_compra_estado_aprobacion_check', () => {
    it('rechaza un estado_aprobacion fuera del catálogo', async () => {
      const compraId = await insertCompraValida();
      await expect(
        client.query(
          `INSERT INTO items_compra (id, compra_id, descripcion, cantidad, proveedor, monto, moneda, fecha_cotizacion, estado_aprobacion, updated_at)
           VALUES (gen_random_uuid(), $1, 'Item', 1, 'Proveedor', 100, 'ARS', '2026-01-01', 'FOO', now())`,
          [compraId],
        ),
      ).rejects.toThrow(/items_compra_estado_aprobacion_check|check constraint/i);
    });
  });

  // ─── items_compra_moneda_check ───────────────────────────────────────────

  describe('CHECK items_compra_moneda_check', () => {
    it('rechaza una moneda fuera del catálogo', async () => {
      const compraId = await insertCompraValida();
      await expect(insertItemPendiente(compraId, { moneda: 'XYZ' })).rejects.toThrow(
        /items_compra_moneda_check|check constraint/i,
      );
    });

    it.each(['ARS', 'USD', 'EUR'])('acepta moneda %s', async (moneda) => {
      const compraId = await insertCompraValida();
      const id = await insertItemPendiente(compraId, { moneda });
      expect(id).toBeDefined();
    });
  });

  // ─── items_compra_decision_atomica_check ─────────────────────────────────

  describe('CHECK items_compra_decision_atomica_check', () => {
    it('rechaza PENDIENTE con decidido_por_id seteado', async () => {
      const compraId = await insertCompraValida();
      const itemId = await insertItemPendiente(compraId);
      await expect(
        client.query(`UPDATE items_compra SET decidido_por_id = gen_random_uuid() WHERE id = $1`, [
          itemId,
        ]),
      ).rejects.toThrow(/items_compra_decision_atomica_check|check constraint/i);
    });

    it('rechaza APROBADO sin decidido_por_id ni decidido_en', async () => {
      const compraId = await insertCompraValida();
      const itemId = await insertItemPendiente(compraId);
      await expect(
        client.query(`UPDATE items_compra SET estado_aprobacion = 'APROBADO' WHERE id = $1`, [
          itemId,
        ]),
      ).rejects.toThrow(/items_compra_decision_atomica_check|check constraint/i);
    });

    it('acepta APROBADO con decidido_por_id y decidido_en seteados', async () => {
      const compraId = await insertCompraValida();
      const itemId = await insertItemPendiente(compraId);
      const result = await client.query(
        `UPDATE items_compra
         SET estado_aprobacion = 'APROBADO', decidido_por_id = gen_random_uuid(), decidido_en = now()
         WHERE id = $1`,
        [itemId],
      );
      expect(result.rowCount).toBe(1);
    });

    it('acepta RECHAZADO con decidido_por_id y decidido_en seteados (ADR-C6: también aplica al rechazo)', async () => {
      const compraId = await insertCompraValida();
      const itemId = await insertItemPendiente(compraId);
      const result = await client.query(
        `UPDATE items_compra
         SET estado_aprobacion = 'RECHAZADO', decidido_por_id = gen_random_uuid(), decidido_en = now()
         WHERE id = $1`,
        [itemId],
      );
      expect(result.rowCount).toBe(1);
    });
  });

  // ─── items_compra_faltante_atomico_check ─────────────────────────────────

  describe('CHECK items_compra_faltante_atomico_check', () => {
    it('rechaza cerrado_con_faltante=true sin motivo_cierre_faltante', async () => {
      const compraId = await insertCompraValida();
      const itemId = await insertItemPendiente(compraId);
      await client.query(
        `UPDATE items_compra SET estado_aprobacion = 'APROBADO', decidido_por_id = gen_random_uuid(), decidido_en = now() WHERE id = $1`,
        [itemId],
      );
      await expect(
        client.query(`UPDATE items_compra SET cerrado_con_faltante = true WHERE id = $1`, [itemId]),
      ).rejects.toThrow(/items_compra_faltante_atomico_check|check constraint/i);
    });

    it('rechaza motivo_cierre_faltante seteado con cerrado_con_faltante=false', async () => {
      const compraId = await insertCompraValida();
      const itemId = await insertItemPendiente(compraId);
      await expect(
        client.query(`UPDATE items_compra SET motivo_cierre_faltante = 'Faltante' WHERE id = $1`, [
          itemId,
        ]),
      ).rejects.toThrow(/items_compra_faltante_atomico_check|check constraint/i);
    });
  });

  // ─── items_compra_faltante_solo_aprobado_check ───────────────────────────

  describe('CHECK items_compra_faltante_solo_aprobado_check', () => {
    it('rechaza cerrado_con_faltante=true sobre un ítem PENDIENTE (no APROBADO)', async () => {
      const compraId = await insertCompraValida();
      const itemId = await insertItemPendiente(compraId);
      // Satisface items_compra_faltante_atomico_check (motivo seteado junto con
      // el flag) para aislar la violación al CHECK bajo prueba.
      await expect(
        client.query(
          `UPDATE items_compra
           SET cerrado_con_faltante = true, motivo_cierre_faltante = 'Faltante'
           WHERE id = $1`,
          [itemId],
        ),
      ).rejects.toThrow(/items_compra_faltante_solo_aprobado_check|check constraint/i);
    });

    it('acepta cerrado_con_faltante=true sobre un ítem APROBADO', async () => {
      const compraId = await insertCompraValida();
      const itemId = await insertItemPendiente(compraId);
      await client.query(
        `UPDATE items_compra SET estado_aprobacion = 'APROBADO', decidido_por_id = gen_random_uuid(), decidido_en = now() WHERE id = $1`,
        [itemId],
      );
      const result = await client.query(
        `UPDATE items_compra
         SET cerrado_con_faltante = true, motivo_cierre_faltante = 'Faltante'
         WHERE id = $1`,
        [itemId],
      );
      expect(result.rowCount).toBe(1);
    });
  });

  // ─── operaciones_compra_tipo_check ───────────────────────────────────────

  describe('CHECK operaciones_compra_tipo_check', () => {
    it('rechaza un tipo fuera del catálogo cerrado de 10 valores', async () => {
      const compraId = await insertCompraValida();
      await expect(
        client.query(
          `INSERT INTO operaciones_compra (id, compra_id, tipo, usuario_id, detalle)
           VALUES (gen_random_uuid(), $1, 'TIPO_INEXISTENTE', gen_random_uuid(), 'detalle')`,
          [compraId],
        ),
      ).rejects.toThrow(/operaciones_compra_tipo_check|check constraint/i);
    });

    it.each([
      'CREACION',
      'ITEM_AGREGADO',
      'ITEM_EDITADO',
      'ITEM_ELIMINADO',
      'ITEM_APROBADO',
      'ITEM_RECHAZADO',
      'COMPRA_REGISTRADA',
      'ENTREGA_REGISTRADA',
      'ITEM_CERRADO_CON_FALTANTE',
      'CANCELACION',
    ])('acepta el tipo %s (uno de los 10 comandos mutadores de ADR-C4)', async (tipo) => {
      const compraId = await insertCompraValida();
      const result = await client.query(
        `INSERT INTO operaciones_compra (id, compra_id, tipo, usuario_id, detalle)
         VALUES (gen_random_uuid(), $1, $2, gen_random_uuid(), 'detalle')
         RETURNING id`,
        [compraId, tipo],
      );
      expect(result.rowCount).toBe(1);
    });
  });

  // ─── Estructura append-only de operaciones_compra (S37 por firma, ver diseño) ─
  //
  // No es un CHECK de SQL — es la ausencia estructural de updated_at/deleted_at
  // en la tabla, verificada acá porque es la misma decisión (ADR-C4) que fija
  // esta migración. El puerto (`crear`/`listarPorCompra` sin update/delete) se
  // verifica en PR-12 contra la firma de TypeScript; esto verifica la contraparte
  // física en la DB.

  describe('operaciones_compra es append-only por estructura (sin updated_at/deleted_at)', () => {
    it('la tabla NO tiene columnas updated_at ni deleted_at', async () => {
      const result = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'operaciones_compra'`,
      );
      const columnas = result.rows.map((r: { column_name: string }) => r.column_name);
      expect(columnas).not.toContain('updated_at');
      expect(columnas).not.toContain('deleted_at');
    });
  });

  /**
   * Estos dos CHECKs enumeran valores que TypeScript también enumera. El riesgo
   * NO es que un usuario mande un valor inválido — hoy salen de literales del
   * código, no del body HTTP. El riesgo es la DERIVA: agregar un tipo de
   * operación a la unión de TS y olvidar la migración. El INSERT lo rechaza el
   * CHECK, no hay filtro global de excepciones, y sale como 500 — la misma forma
   * que el bug C1, pero al revés.
   *
   * Un guard en runtime convertiría ese 500 en un 422, que sigue siendo mentira:
   * no es un error del usuario, es un error del desarrollador. Se ataja acá, en
   * el test, antes de que llegue a producción.
   */
  describe('Las listas del CHECK y las de TypeScript no derivan', () => {
    /** Extrae los literales de un CHECK leyendo su definición real de Postgres. */
    async function valoresDelCheck(nombre: string): Promise<string[]> {
      const result = await client.query(
        'SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1',
        [nombre],
      );
      expect(result.rows).toHaveLength(1);
      const definicion: string = result.rows[0].def;
      return [...definicion.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    }

    it('items_compra_estado_aprobacion_check enumera exactamente ESTADOS_APROBACION_ITEM', async () => {
      const enLaDb = await valoresDelCheck('items_compra_estado_aprobacion_check');
      expect(enLaDb).toEqual([...ESTADOS_APROBACION_ITEM].sort());
    });

    it('operaciones_compra_tipo_check enumera exactamente TIPOS_OPERACION_COMPRA', async () => {
      const enLaDb = await valoresDelCheck('operaciones_compra_tipo_check');
      expect(enLaDb).toEqual([...TIPOS_OPERACION_COMPRA].sort());
    });
  });
});

/**
 * [INTEGRATION] Constraints de la migración `unidades_insumo_serie` (sdd/repuestos-numero-de-serie,
 * WU-1) contra Postgres REAL, en una base de INQUILINO EFÍMERA propia.
 *
 * Reproduce el schema tenant hasta la migración previa, deja filas "legadas" (un insumo, una
 * unidad de medida propia y un componente con serial de texto), corre después, a mano, la migración
 * del ciclo y verifica sobre el resultado: cada CHECK real contra los catálogos de dominio (fuente
 * única), los índices únicos parciales y las FK. Nunca toca `soporte_master`, `soporte_master_test`
 * ni una base de tenant real, así que no necesita `usarLockMasterTest()`.
 *
 * Higiene: limpiar filas -> cerrar pool -> dropDatabase.
 */
import { Pool } from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import {
  ESTADOS_UNIDAD_INSUMO,
  SEGUIMIENTOS_INSUMO,
  TIPOS_EVENTO_UNIDAD,
  UNIDAD_SERIAL_MAX_LENGTH,
  normalizarSerial,
} from '../../../domain/entities/unidad-insumo.entity';
import { CONDICIONES_STOCK } from '../../../domain/entities/tipo-movimiento-insumo';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../prisma_tenant/migrations');
const CARPETA_MIGRACION = '20260930140000_unidades_insumo_serie';
const EPHEMERAL_DB_NAME = `soporte_unidades_serie_${randomBytes(4).toString('hex')}_test`;

const leerSql = (carpeta: string): string =>
  fs.readFileSync(path.join(TENANT_MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8');

/** Corre, en orden, todas las migraciones con carpeta anterior a la del ciclo. */
async function reproducirSchemaPrevio(pool: InstanceType<typeof Pool>): Promise<void> {
  const carpetas = fs
    .readdirSync(TENANT_MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .filter((nombre) => nombre < CARPETA_MIGRACION)
    .sort();

  for (const carpeta of carpetas) {
    await pool.query(leerSql(carpeta));
  }
}

/** Los literales entre comillas de la definición de un CHECK, ordenados. */
const literales = (def: string): string[] =>
  [...def.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();

describe('migración unidades_insumo_serie — constraints (WU-1, tenant efímero)', () => {
  let pool: InstanceType<typeof Pool>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const usuarioId = randomUUID();

  let familiaId: string;
  let unidadMedidaId: string;
  let insumoLegadoId: string;
  let insumoId: string;
  let otroInsumoId: string;
  let equipoId: string;

  const definicion = async (nombre: string): Promise<string> => {
    const { rows } = await pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1`,
      [nombre],
    );
    expect(rows).toHaveLength(1);
    return rows[0].def;
  };

  /** Inserta una unidad; los defaults son una unidad EN_DEPOSITO con serial. */
  const insertarUnidad = async (
    over: Partial<{
      insumo: string;
      serie: string | null;
      normalizado: string | null;
      condicion: string;
      estado: string;
      equipo: string | null;
    }> = {},
  ): Promise<string> => {
    const serie = over.serie === undefined ? `SN-${randomBytes(4).toString('hex')}` : over.serie;
    const normalizado =
      over.normalizado !== undefined
        ? over.normalizado
        : serie === null
          ? null
          : normalizarSerial(serie);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO unidades_insumo
         (insumo_id, numero_serie, numero_serie_normalizado, condicion, estado, equipo_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING id`,
      [
        over.insumo ?? insumoId,
        serie,
        normalizado,
        over.condicion ?? 'NUEVO',
        over.estado ?? 'EN_DEPOSITO',
        over.equipo ?? null,
      ],
    );
    return rows[0].id;
  };

  const insertarMovimiento = async (cantidad: number, unidadId: string | null): Promise<string> => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO movimientos_insumo (insumo_id, tipo, cantidad, usuario_id, unidad_id)
       VALUES ($1, 'ENTRADA', $2, $3, $4) RETURNING id`,
      [insumoId, cantidad, usuarioId, unidadId],
    );
    return rows[0].id;
  };

  const insertarComponente = async (
    unidadId: string | null,
    numeroSerie: string | null,
    borrado = false,
  ): Promise<void> => {
    await pool.query(
      `INSERT INTO componentes_equipo (equipo_id, insumo_id, unidad_id, numero_serie, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, now(), ${borrado ? 'now()' : 'NULL'})`,
      [equipoId, insumoId, unidadId, numeroSerie],
    );
  };

  const insertarEvento = async (
    tipo: string,
    unidadId: string,
    movimientoId?: string,
  ): Promise<void> => {
    await pool.query(
      `INSERT INTO eventos_unidad_insumo (unidad_id, tipo, movimiento_id, usuario_id)
       VALUES ($1, $2, $3, $4)`,
      [unidadId, tipo, movimientoId ?? null, usuarioId],
    );
  };

  beforeAll(async () => {
    await admin.createDatabase(EPHEMERAL_DB_NAME);
    const ephemeralUrl = new URL(MASTER_TEST_URL);
    ephemeralUrl.pathname = `/${EPHEMERAL_DB_NAME}`;
    pool = new Pool({ connectionString: ephemeralUrl.toString() });

    await reproducirSchemaPrevio(pool);

    // Filas LEGADAS, anteriores a la migración: un insumo, una unidad de medida y un componente
    // con serial de texto libre.
    familiaId = (
      await pool.query(
        `INSERT INTO familias_insumo (codigo, nombre, updated_at) VALUES ('FAM', 'Familia', now()) RETURNING id`,
      )
    ).rows[0].id;
    // `UNI` y `PAR` ya existen por la migración de datos `seed_unidades_medida`; se verifica abajo.
    await pool.query(
      `INSERT INTO unidades_medida (codigo, nombre, updated_at) VALUES ('LT', 'Litro', now())`,
    );
    unidadMedidaId = (await pool.query(`SELECT id FROM unidades_medida WHERE codigo = 'UNI'`))
      .rows[0].id;
    insumoLegadoId = (
      await pool.query(
        `INSERT INTO insumos (codigo, nombre, familia_id, unidad_medida_id, updated_at)
         VALUES ('LEGADO', 'Insumo legado', $1, $2, now()) RETURNING id`,
        [familiaId, unidadMedidaId],
      )
    ).rows[0].id;
    equipoId = (
      await pool.query(
        `INSERT INTO equipos_informaticos (nombre, updated_at) VALUES ('Equipo fixture WU1', now()) RETURNING id`,
      )
    ).rows[0].id;
    await pool.query(
      `INSERT INTO componentes_equipo (equipo_id, insumo_id, numero_serie, updated_at)
       VALUES ($1, $2, 'SERIAL-LEGADO', now())`,
      [equipoId, insumoLegadoId],
    );

    await pool.query(leerSql(CARPETA_MIGRACION));

    insumoId = (
      await pool.query(
        `INSERT INTO insumos (codigo, nombre, familia_id, unidad_medida_id, seguimiento, updated_at)
         VALUES ('SERIE1', 'Insumo con serie', $1, $2, 'SERIE', now()) RETURNING id`,
        [familiaId, unidadMedidaId],
      )
    ).rows[0].id;
    otroInsumoId = (
      await pool.query(
        `INSERT INTO insumos (codigo, nombre, familia_id, unidad_medida_id, seguimiento, updated_at)
         VALUES ('SERIE2', 'Otro insumo con serie', $1, $2, 'SERIE', now()) RETURNING id`,
        [familiaId, unidadMedidaId],
      )
    ).rows[0].id;
  }, 120_000);

  afterAll(async () => {
    // Orden de higiene: limpiar filas (por FKs) -> cerrar -> dropDatabase (al revés, el DROP falla en silencio).
    for (const tabla of [
      'eventos_unidad_insumo',
      'componentes_equipo',
      'movimientos_insumo',
      'unidades_insumo',
    ]) {
      await pool.query(`DELETE FROM ${tabla}`).catch(() => undefined);
    }
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(EPHEMERAL_DB_NAME);
  }, 30_000);

  // Un test fallido no debe dejar filas que arrastren al siguiente. El componente legado
  // (migración con componentes previos) se conserva.
  afterEach(async () => {
    await pool.query('DELETE FROM eventos_unidad_insumo');
    await pool.query(
      `DELETE FROM componentes_equipo WHERE numero_serie IS DISTINCT FROM 'SERIAL-LEGADO'`,
    );
    await pool.query('DELETE FROM movimientos_insumo');
    await pool.query('DELETE FROM unidades_insumo');
  });

  describe('datos existentes tras la migración', () => {
    it('un insumo existente queda NINGUNO', async () => {
      const { rows } = await pool.query(`SELECT seguimiento FROM insumos WHERE id = $1`, [
        insumoLegadoId,
      ]);
      expect(rows).toEqual([{ seguimiento: 'NINGUNO' }]);
    });

    it('UNI y PAR quedan enteras; el resto no', async () => {
      const { rows } = await pool.query<{ codigo: string; entera: boolean }>(
        `SELECT codigo, entera FROM unidades_medida ORDER BY codigo`,
      );
      const porCodigo = Object.fromEntries(rows.map((r) => [r.codigo, r.entera]));
      expect(porCodigo.UNI).toBe(true);
      expect(porCodigo.PAR).toBe(true);
      expect(porCodigo.LT).toBe(false);
    });

    it('un componente previo conserva su serial de texto y queda sin unidad', async () => {
      const { rows } = await pool.query(
        `SELECT numero_serie, unidad_id FROM componentes_equipo WHERE insumo_id = $1`,
        [insumoLegadoId],
      );
      expect(rows).toEqual([{ numero_serie: 'SERIAL-LEGADO', unidad_id: null }]);
    });
  });

  describe('catálogos — el CHECK real enumera exactamente la fuente única', () => {
    it.each([
      ['insumos_seguimiento_check', SEGUIMIENTOS_INSUMO],
      ['unidades_insumo_estado_check', ESTADOS_UNIDAD_INSUMO],
      ['unidades_insumo_condicion_check', CONDICIONES_STOCK],
      ['eventos_unidad_insumo_tipo_check', TIPOS_EVENTO_UNIDAD],
    ])('%s', async (nombre, catalogo) => {
      expect(literales(await definicion(nombre))).toEqual([...catalogo].sort());
    });

    it('seguimiento fuera del catálogo: rechazado', async () => {
      await expect(
        pool.query(`UPDATE insumos SET seguimiento = 'LOTE' WHERE id = $1`, [insumoId]),
      ).rejects.toThrow(/insumos_seguimiento_check/);
    });

    it('estado fuera del catálogo: rechazado', async () => {
      await expect(insertarUnidad({ estado: 'PERDIDA' })).rejects.toThrow(
        /unidades_insumo_estado_check/,
      );
    });

    it('condición fuera del catálogo: rechazada', async () => {
      await expect(insertarUnidad({ condicion: 'RECUPERADO' })).rejects.toThrow(
        /unidades_insumo_condicion_check/,
      );
    });

    it('evento fuera del catálogo: rechazado', async () => {
      const unidad = await insertarUnidad();
      await expect(insertarEvento('TELETRANSPORTE', unidad)).rejects.toThrow(
        /eventos_unidad_insumo_tipo_check/,
      );
    });

    it.each([...TIPOS_EVENTO_UNIDAD])('acepta el evento %s', async (tipo) => {
      const unidad = await insertarUnidad();
      await expect(insertarEvento(tipo, unidad)).resolves.toBeUndefined();
    });
  });

  describe('coherencia estado / equipo / serial', () => {
    it('la definición real de cada CHECK nombra sus columnas', async () => {
      expect(await definicion('unidades_insumo_equipo_coherente_check')).toMatch(
        /estado.*INSTALADA.*equipo_id IS NOT NULL/s,
      );
      // F1: una pendiente puede estar EN_DEPOSITO o DESCARTADA, nunca INSTALADA ni ENTREGADA.
      const pendiente = await definicion('unidades_insumo_serie_pendiente_check');
      expect(pendiente).toMatch(/numero_serie IS NOT NULL/);
      expect(literales(pendiente)).toEqual(['DESCARTADA', 'EN_DEPOSITO']);
    });

    it('una unidad INSTALADA sin equipo: rechazada', async () => {
      await expect(insertarUnidad({ estado: 'INSTALADA' })).rejects.toThrow(
        /unidades_insumo_equipo_coherente_check/,
      );
    });

    it('una unidad INSTALADA con equipo: aceptada', async () => {
      await expect(insertarUnidad({ estado: 'INSTALADA', equipo: equipoId })).resolves.toBeTruthy();
    });

    it.each(['EN_DEPOSITO', 'ENTREGADA', 'DESCARTADA'])(
      'una unidad %s que refiere un equipo: rechazada',
      async (estado) => {
        await expect(insertarUnidad({ estado, equipo: equipoId })).rejects.toThrow(
          /unidades_insumo_equipo_coherente_check/,
        );
      },
    );

    it('una ENTREGADA sin equipo: aceptada (su destino vive en el movimiento)', async () => {
      await expect(insertarUnidad({ estado: 'ENTREGADA' })).resolves.toBeTruthy();
    });

    it.each(['EN_DEPOSITO', 'DESCARTADA'])(
      'una pendiente (sin serial) %s: aceptada, incluida la descartada',
      async (estado) => {
        await expect(
          insertarUnidad({ serie: null, normalizado: null, estado }),
        ).resolves.toBeTruthy();
      },
    );

    it.each(['ENTREGADA'])('una pendiente %s: rechazada', async (estado) => {
      await expect(insertarUnidad({ serie: null, normalizado: null, estado })).rejects.toThrow(
        /unidades_insumo_serie_pendiente_check/,
      );
    });

    it('una pendiente INSTALADA: rechazada (por el CHECK de serie pendiente)', async () => {
      await expect(
        insertarUnidad({ serie: null, normalizado: null, estado: 'INSTALADA', equipo: equipoId }),
      ).rejects.toThrow(/unidades_insumo_serie_pendiente_check/);
    });

    it.each([
      ['serial sin normalizado', 'ABC', null],
      ['normalizado sin serial', null, 'ABC'],
    ])('%s: rechazado', async (_caso, serie, normalizado) => {
      await expect(insertarUnidad({ serie, normalizado })).rejects.toThrow(
        /unidades_insumo_serie_normalizada_check/,
      );
    });

    it('el largo máximo del dominio cabe en la columna, y uno más no', async () => {
      const cabe = 'A'.repeat(UNIDAD_SERIAL_MAX_LENGTH);
      await expect(insertarUnidad({ serie: cabe, normalizado: cabe })).resolves.toBeTruthy();
      const noCabe = 'B'.repeat(UNIDAD_SERIAL_MAX_LENGTH + 1);
      await expect(insertarUnidad({ serie: noCabe, normalizado: noCabe })).rejects.toThrow(
        /value too long/,
      );
    });
  });

  describe('unicidad del serial por insumo (índice parcial sobre el normalizado)', () => {
    it('otra capitalización y espacios del mismo serial: rechazado', async () => {
      await insertarUnidad({ serie: 'sn 001' });
      await expect(insertarUnidad({ serie: ' SN001 ' })).rejects.toThrow(
        /unidades_insumo_insumo_id_numero_serie_normalizado_key/,
      );
    });

    it('el serial de una unidad DESCARTADA sigue ocupado', async () => {
      await insertarUnidad({ serie: 'SN-DESC', estado: 'DESCARTADA' });
      await expect(insertarUnidad({ serie: 'sn-desc' })).rejects.toThrow(
        /unidades_insumo_insumo_id_numero_serie_normalizado_key/,
      );
    });

    it('el mismo serial en OTRO insumo: permitido', async () => {
      await insertarUnidad({ serie: 'SN-COMPARTIDO' });
      await expect(
        insertarUnidad({ insumo: otroInsumoId, serie: 'SN-COMPARTIDO' }),
      ).resolves.toBeTruthy();
    });

    it('varias pendientes del mismo insumo: permitidas (NULL no ocupa la unicidad)', async () => {
      await insertarUnidad({ serie: null, normalizado: null });
      await expect(insertarUnidad({ serie: null, normalizado: null })).resolves.toBeTruthy();
    });
  });

  describe('movimientos_insumo.unidad_id', () => {
    it('con unidad y cantidad 1: aceptado', async () => {
      const unidad = await insertarUnidad();
      await expect(insertarMovimiento(1, unidad)).resolves.toBeTruthy();
    });

    it.each([2, 0.5])('con unidad y cantidad %s: rechazado', async (cantidad) => {
      const unidad = await insertarUnidad();
      await expect(insertarMovimiento(cantidad, unidad)).rejects.toThrow(
        /movimientos_insumo_unidad_cantidad_check/,
      );
    });

    it('sin unidad, cualquier cantidad positiva: aceptado (legado sin unidad)', async () => {
      await expect(insertarMovimiento(5, null)).resolves.toBeTruthy();
    });

    it('una unidad inexistente: rechazada por la FK', async () => {
      await expect(insertarMovimiento(1, randomUUID())).rejects.toThrow(
        /movimientos_insumo_unidad_id_fkey/,
      );
    });

    it('no deja borrar una unidad con movimientos (RESTRICT)', async () => {
      const unidad = await insertarUnidad();
      await insertarMovimiento(1, unidad);
      await expect(
        pool.query(`DELETE FROM unidades_insumo WHERE id = $1`, [unidad]),
      ).rejects.toThrow(/movimientos_insumo_unidad_id_fkey/);
    });

    it('existe el índice parcial WHERE unidad_id IS NOT NULL', async () => {
      const { rows } = await pool.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes WHERE indexname = 'movimientos_insumo_unidad_id_idx'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].indexdef).toMatch(/WHERE \(?unidad_id IS NOT NULL\)?/);
    });
  });

  describe('componentes_equipo.unidad_id', () => {
    it('con unidad y serial de texto: rechazado', async () => {
      const unidad = await insertarUnidad();
      await expect(insertarComponente(unidad, 'TEXTO-LIBRE')).rejects.toThrow(
        /componentes_equipo_unidad_sin_serie_texto_check/,
      );
    });

    it('con unidad y sin serial de texto: aceptado', async () => {
      const unidad = await insertarUnidad();
      await expect(insertarComponente(unidad, null)).resolves.toBeUndefined();
    });

    it('sin unidad, con serial de texto: aceptado (camino legado)', async () => {
      await expect(insertarComponente(null, 'TEXTO-LIBRE')).resolves.toBeUndefined();
    });

    it('la misma unidad en dos componentes activos: rechazada', async () => {
      const unidad = await insertarUnidad();
      await insertarComponente(unidad, null);
      await expect(insertarComponente(unidad, null)).rejects.toThrow(
        /componentes_equipo_unidad_id_activo_key/,
      );
    });

    it('la misma unidad con un componente retirado y otro activo: permitida', async () => {
      const unidad = await insertarUnidad();
      await insertarComponente(unidad, null, true);
      await expect(insertarComponente(unidad, null)).resolves.toBeUndefined();
    });
  });

  describe('eventos_unidad_insumo', () => {
    it('movimiento_id es único: un movimiento origina a lo sumo un evento', async () => {
      const unidad = await insertarUnidad();
      const movimiento = await insertarMovimiento(1, unidad);
      await insertarEvento('ENTREGA', unidad, movimiento);
      await expect(insertarEvento('INGRESO', unidad, movimiento)).rejects.toThrow(
        /eventos_unidad_insumo_movimiento_id_key/,
      );
    });

    it('varios eventos sin movimiento en la misma unidad: permitidos', async () => {
      const unidad = await insertarUnidad();
      await insertarEvento('INGRESO', unidad);
      await expect(insertarEvento('SERIAL_CARGADO', unidad)).resolves.toBeUndefined();
    });

    it('componente_id y usuario_id van SIN FK: un id ajeno se acepta', async () => {
      const unidad = await insertarUnidad();
      await expect(
        pool.query(
          `INSERT INTO eventos_unidad_insumo (unidad_id, tipo, componente_id, usuario_id)
           VALUES ($1, 'INSTALACION', $2, $3)`,
          [unidad, randomUUID(), randomUUID()],
        ),
      ).resolves.toBeTruthy();
    });

    it('una unidad inexistente: rechazada por la FK', async () => {
      await expect(insertarEvento('INGRESO', randomUUID())).rejects.toThrow(
        /eventos_unidad_insumo_unidad_id_fkey/,
      );
    });

    it('existe el índice (unidad_id, created_at)', async () => {
      const { rows } = await pool.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
         WHERE indexname = 'eventos_unidad_insumo_unidad_id_created_at_idx'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].indexdef).toMatch(/\(unidad_id, created_at\)/);
    });
  });
});

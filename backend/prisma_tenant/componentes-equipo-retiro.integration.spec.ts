/**
 * componentes-equipo-retiro.integration.spec.ts — WU-5 (sdd stock-usado-componentes, ADR-2).
 *
 * Contra Postgres REAL, base de INQUILINO EFÍMERA propia (molde
 * `componentes-insumo-obligatorio.integration.spec.ts`): nunca toca
 * `soporte_master`, `soporte_master_test` ni una base de tenant real, así que no
 * necesita `usarLockMasterTest()`. Reproduce el schema tenant hasta la migración
 * ANTERIOR a `componentes_equipo_retiro`, con un componente legado ya dado de
 * baja, y corre después, a mano, la migración nueva.
 *
 * Higiene: limpiar filas -> cerrar pool -> dropDatabase.
 */
import { Pool } from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';
import { DESTINOS_RETIRO_COMPONENTE } from '../src/equipos/domain/entities/componente-equipo.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const CARPETA_MIGRACION = '20260930130000_componentes_equipo_retiro';
const EPHEMERAL_DB_NAME = `soporte_comp_retiro_${randomBytes(4).toString('hex')}_test`;

const leerSql = (carpeta: string): string =>
  fs.readFileSync(path.join(TENANT_MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8');

/** Corre, en orden, los `migration.sql` con carpeta ESTRICTAMENTE anterior a la migración bajo prueba. */
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

describe('migración componentes_equipo_retiro — constraints (WU-5, tenant efímero)', () => {
  let pool: InstanceType<typeof Pool>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let equipoId: string;
  let insumoId: string;
  let legadoId: string;
  const usuarioId = randomUUID();

  /** Movimientos de stock reales: las FK los exigen. Se crean uno por uso para no chocar con los UNIQUE. */
  const crearMovimiento = async (
    tipo: 'SALIDA' | 'ENTRADA',
    condicion: string,
  ): Promise<string> => {
    const { rows } = await pool.query(
      `INSERT INTO movimientos_insumo (insumo_id, tipo, condicion, cantidad, usuario_id)
       VALUES ($1, $2, $3, 1, $4) RETURNING id`,
      [insumoId, tipo, condicion, usuarioId],
    );
    return rows[0].id as string;
  };

  interface Fila {
    deletedAt?: 'now' | null;
    instalacion?: string | null;
    destino?: string | null;
    motivo?: string | null;
    movimiento?: string | null;
    usuario?: string | null;
  }

  const insertar = async (f: Fila): Promise<void> => {
    await pool.query(
      `INSERT INTO componentes_equipo
         (equipo_id, insumo_id, updated_at, deleted_at, instalacion_movimiento_id,
          baja_destino, baja_motivo, baja_movimiento_id, baja_usuario_id)
       VALUES ($1, $2, now(), ${f.deletedAt === 'now' ? 'now()' : 'NULL'}, $3, $4, $5, $6, $7)`,
      [
        equipoId,
        insumoId,
        f.instalacion ?? null,
        f.destino ?? null,
        f.motivo ?? null,
        f.movimiento ?? null,
        f.usuario ?? null,
      ],
    );
  };

  beforeAll(async () => {
    await admin.createDatabase(EPHEMERAL_DB_NAME);
    const ephemeralUrl = new URL(MASTER_TEST_URL);
    ephemeralUrl.pathname = `/${EPHEMERAL_DB_NAME}`;
    pool = new Pool({ connectionString: ephemeralUrl.toString() });

    await reproducirSchemaPrevio(pool);

    const familia = await pool.query(
      `INSERT INTO familias_insumo (codigo, nombre, es_repuesto, updated_at)
       VALUES ('FIX_RET', 'Familia fixture', true, now()) RETURNING id`,
    );
    const unidad = await pool.query(
      `INSERT INTO unidades_medida (codigo, nombre, updated_at)
       VALUES ('FIX_UN', 'Unidad fixture', now()) RETURNING id`,
    );
    const insumo = await pool.query(
      `INSERT INTO insumos (codigo, nombre, familia_id, unidad_medida_id, updated_at)
       VALUES ('FIX_INS', 'Insumo fixture', $1, $2, now()) RETURNING id`,
      [familia.rows[0].id, unidad.rows[0].id],
    );
    insumoId = insumo.rows[0].id as string;

    const equipo = await pool.query(
      `INSERT INTO equipos_informaticos (nombre, updated_at)
       VALUES ('Equipo fixture WU5', now()) RETURNING id`,
    );
    equipoId = equipo.rows[0].id as string;

    // Componente LEGADO: dado de baja ANTES de la migración, sin registro de retiro.
    const legado = await pool.query(
      `INSERT INTO componentes_equipo (equipo_id, insumo_id, updated_at, deleted_at)
       VALUES ($1, $2, now(), now()) RETURNING id`,
      [equipoId, insumoId],
    );
    legadoId = legado.rows[0].id as string;

    await pool.query(leerSql(CARPETA_MIGRACION));
  }, 120_000);

  afterAll(async () => {
    // Orden de higiene: limpiar filas -> cerrar -> dropDatabase (al revés, el DROP falla en silencio).
    await pool.query('DELETE FROM componentes_equipo').catch(() => undefined);
    await pool.query('DELETE FROM movimientos_insumo').catch(() => undefined);
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(EPHEMERAL_DB_NAME);
  }, 30_000);

  // Un test fallido no debe dejar filas que arrastren al siguiente. El legado se conserva.
  afterEach(async () => {
    await pool.query('DELETE FROM componentes_equipo WHERE id <> $1', [legadoId]);
  });

  describe('migración aditiva — retiro legado', () => {
    it('el componente dado de baja antes de la migración queda intacto, con las cinco columnas en NULL', async () => {
      const { rows } = await pool.query(
        `SELECT deleted_at, instalacion_movimiento_id, baja_destino, baja_motivo,
                baja_movimiento_id, baja_usuario_id
         FROM componentes_equipo WHERE id = $1`,
        [legadoId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].deleted_at).not.toBeNull();
      expect(rows[0].instalacion_movimiento_id).toBeNull();
      expect(rows[0].baja_destino).toBeNull();
      expect(rows[0].baja_motivo).toBeNull();
      expect(rows[0].baja_movimiento_id).toBeNull();
      expect(rows[0].baja_usuario_id).toBeNull();
    });

    it('un INSERT que no menciona las columnas nuevas (un binario anterior) sigue funcionando', async () => {
      await expect(
        pool.query(
          `INSERT INTO componentes_equipo (equipo_id, insumo_id, updated_at) VALUES ($1, $2, now())`,
          [equipoId, insumoId],
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('baja_destino — catálogo CERRADO por CHECK', () => {
    // Postgres evalúa los CHECK por orden alfabético de nombre y reporta el primero que
    // falla: con un destino desconocido dispara `..._coherente_check` (que no lo admite en
    // ninguna rama) antes que `..._destino_check`. Por eso se asserta que la base lo rechaza
    // por cualquiera de los dos, y el catálogo exacto lo fija el test de la definición.
    it('rechaza un destino fuera del catálogo', async () => {
      await expect(
        insertar({ deletedAt: 'now', destino: 'RECICLAJE', motivo: 'x', usuario: usuarioId }),
      ).rejects.toThrow(
        /violates check constraint "componentes_equipo_baja_(destino|coherente)_check"/,
      );
    });

    it('el CHECK real enumera exactamente DESTINOS_RETIRO_COMPONENTE', async () => {
      const { rows } = await pool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
         WHERE conname = 'componentes_equipo_baja_destino_check'`,
      );
      expect(rows).toHaveLength(1);
      const enLaDb = [...(rows[0].def as string).matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();
      expect(enLaDb).toEqual([...DESTINOS_RETIRO_COMPONENTE].sort());
    });
  });

  describe('baja_coherente — las tres ramas del CHECK', () => {
    it('rama 1: acepta un componente activo con todo el registro en NULL', async () => {
      await expect(insertar({})).resolves.toBeUndefined();
    });

    it('rama 1: acepta un legado dado de baja con todo el registro en NULL', async () => {
      await expect(insertar({ deletedAt: 'now' })).resolves.toBeUndefined();
    });

    it('rama 1: rechaza destino NULL con alguna otra columna de retiro cargada', async () => {
      await expect(insertar({ deletedAt: 'now', motivo: 'suelto' })).rejects.toThrow(
        /componentes_equipo_baja_coherente_check/,
      );
      await expect(insertar({ deletedAt: 'now', usuario: usuarioId })).rejects.toThrow(
        /componentes_equipo_baja_coherente_check/,
      );
    });

    it('rama DESCARTE: acepta motivo y usuario, sin movimiento', async () => {
      await expect(
        insertar({
          deletedAt: 'now',
          destino: 'DESCARTE',
          motivo: 'Placa quemada',
          usuario: usuarioId,
        }),
      ).resolves.toBeUndefined();
    });

    it('rama DESCARTE: rechaza sin motivo, sin usuario o con movimiento', async () => {
      await expect(
        insertar({ deletedAt: 'now', destino: 'DESCARTE', usuario: usuarioId }),
      ).rejects.toThrow(/componentes_equipo_baja_coherente_check/);
      await expect(
        insertar({ deletedAt: 'now', destino: 'DESCARTE', motivo: 'x' }),
      ).rejects.toThrow(/componentes_equipo_baja_coherente_check/);
      const entrada = await crearMovimiento('ENTRADA', 'USADO');
      await expect(
        insertar({
          deletedAt: 'now',
          destino: 'DESCARTE',
          motivo: 'x',
          usuario: usuarioId,
          movimiento: entrada,
        }),
      ).rejects.toThrow(/componentes_equipo_baja_coherente_check/);
    });

    it('rama STOCK_USADO: acepta movimiento y usuario, con o sin motivo', async () => {
      const e1 = await crearMovimiento('ENTRADA', 'USADO');
      const e2 = await crearMovimiento('ENTRADA', 'USADO');
      await expect(
        insertar({ deletedAt: 'now', destino: 'STOCK_USADO', movimiento: e1, usuario: usuarioId }),
      ).resolves.toBeUndefined();
      await expect(
        insertar({
          deletedAt: 'now',
          destino: 'STOCK_USADO',
          movimiento: e2,
          usuario: usuarioId,
          motivo: 'Pieza sana',
        }),
      ).resolves.toBeUndefined();
    });

    it('rama STOCK_USADO: rechaza sin movimiento o sin usuario', async () => {
      const entrada = await crearMovimiento('ENTRADA', 'USADO');
      await expect(
        insertar({ deletedAt: 'now', destino: 'STOCK_USADO', usuario: usuarioId }),
      ).rejects.toThrow(/componentes_equipo_baja_coherente_check/);
      await expect(
        insertar({ deletedAt: 'now', destino: 'STOCK_USADO', movimiento: entrada }),
      ).rejects.toThrow(/componentes_equipo_baja_coherente_check/);
    });

    it('un componente ACTIVO con destino de retiro es rechazado (exige deleted_at)', async () => {
      await expect(
        insertar({ destino: 'DESCARTE', motivo: 'x', usuario: usuarioId }),
      ).rejects.toThrow(/componentes_equipo_baja_coherente_check/);
      const entrada = await crearMovimiento('ENTRADA', 'USADO');
      await expect(
        insertar({ destino: 'STOCK_USADO', movimiento: entrada, usuario: usuarioId }),
      ).rejects.toThrow(/componentes_equipo_baja_coherente_check/);
    });
  });

  describe('vínculos con la bitácora — UNIQUE y FK RESTRICT', () => {
    it('acepta una SALIDA vinculada y rechaza que dos componentes compartan la misma', async () => {
      const salida = await crearMovimiento('SALIDA', 'NUEVO');
      await insertar({ instalacion: salida });
      await expect(insertar({ instalacion: salida })).rejects.toThrow(
        /componentes_equipo_instalacion_movimiento_id_key/,
      );
    });

    it('rechaza que dos componentes compartan la misma ENTRADA de devolución', async () => {
      const entrada = await crearMovimiento('ENTRADA', 'USADO');
      await insertar({
        deletedAt: 'now',
        destino: 'STOCK_USADO',
        movimiento: entrada,
        usuario: usuarioId,
      });
      await expect(
        insertar({
          deletedAt: 'now',
          destino: 'STOCK_USADO',
          movimiento: entrada,
          usuario: usuarioId,
        }),
      ).rejects.toThrow(/componentes_equipo_baja_movimiento_id_key/);
    });

    it('rechaza un movimiento inexistente en las dos columnas (FK)', async () => {
      await expect(insertar({ instalacion: randomUUID() })).rejects.toThrow(
        /componentes_equipo_instalacion_movimiento_id_fkey/,
      );
      await expect(
        insertar({
          deletedAt: 'now',
          destino: 'STOCK_USADO',
          movimiento: randomUUID(),
          usuario: usuarioId,
        }),
      ).rejects.toThrow(/componentes_equipo_baja_movimiento_id_fkey/);
    });

    it('ambas FK son ON DELETE RESTRICT: un movimiento respaldando un componente no se borra', async () => {
      // confdeltype 'r' = ON DELETE RESTRICT.
      const { rows } = await pool.query(
        `SELECT conname, confdeltype FROM pg_constraint
         WHERE conrelid = 'componentes_equipo'::regclass AND contype = 'f'
           AND confrelid = 'movimientos_insumo'::regclass ORDER BY conname`,
      );
      expect(rows).toEqual([
        { conname: 'componentes_equipo_baja_movimiento_id_fkey', confdeltype: 'r' },
        { conname: 'componentes_equipo_instalacion_movimiento_id_fkey', confdeltype: 'r' },
      ]);

      const salida = await crearMovimiento('SALIDA', 'NUEVO');
      await insertar({ instalacion: salida });
      await expect(
        pool.query('DELETE FROM movimientos_insumo WHERE id = $1', [salida]),
      ).rejects.toThrow(/componentes_equipo_instalacion_movimiento_id_fkey/);
    });
  });
});

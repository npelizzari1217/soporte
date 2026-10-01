/**
 * [INTEGRATION] Constraints de `equipos_informaticos_baja` (sdd/baja-equipo-completo, WU-1) contra
 * Postgres REAL, en una base de INQUILINO EFÍMERA propia: schema previo + un equipo histórico
 * `activo = false` + la migración del ciclo. Los CHECK de catálogo se comparan contra las constantes
 * de dominio (fuente única). No toca master ni un tenant real: sin `usarLockMasterTest()`.
 * Higiene: limpiar filas -> cerrar pool -> dropDatabase.
 */
import { Pool } from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import {
  CATEGORIAS_BAJA_EQUIPO,
  DESTINOS_BAJA_EQUIPO,
} from '../../../domain/entities/equipo-informatico.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../prisma_tenant/migrations');
const CARPETA_MIGRACION = '20261001120000_equipos_informaticos_baja';
const EPHEMERAL_DB_NAME = `soporte_equipos_baja_${randomBytes(4).toString('hex')}_test`;

const leerSql = (carpeta: string): string =>
  fs.readFileSync(path.join(TENANT_MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8');

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

interface DatosBaja {
  activo: boolean;
  destino: string | null;
  categoria: string | null;
  motivo: string | null;
  fecha: Date | null;
  usuario: string | null;
}

const COMPLETOS: DatosBaja = {
  activo: false,
  destino: 'DESCARTE',
  categoria: 'VEJEZ',
  motivo: null,
  fecha: new Date('2026-10-01T12:00:00Z'),
  usuario: randomUUID(),
};

describe('migración equipos_informaticos_baja — constraints (WU-1, tenant efímero)', () => {
  let pool: InstanceType<typeof Pool>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  const definicion = async (nombre: string): Promise<string> => {
    const { rows } = await pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1`,
      [nombre],
    );
    expect(rows).toHaveLength(1);
    return rows[0].def;
  };

  const insertarEquipo = async (
    datos: Partial<DatosBaja> & { activo: boolean },
  ): Promise<string> => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO equipos_informaticos
         (nombre, activo, baja_destino, baja_categoria, baja_motivo, baja_fecha, baja_usuario_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now()) RETURNING id`,
      [
        `Equipo ${randomBytes(3).toString('hex')}`,
        datos.activo,
        datos.destino ?? null,
        datos.categoria ?? null,
        datos.motivo ?? null,
        datos.fecha ?? null,
        datos.usuario ?? null,
      ],
    );
    return rows[0].id;
  };

  beforeAll(async () => {
    await admin.createDatabase(EPHEMERAL_DB_NAME);
    const ephemeralUrl = new URL(MASTER_TEST_URL);
    ephemeralUrl.pathname = `/${EPHEMERAL_DB_NAME}`;
    pool = new Pool({ connectionString: ephemeralUrl.toString() });

    await reproducirSchemaPrevio(pool);
    // Fila HISTÓRICA anterior a la migración: dado de baja por SQL, sin ningún dato de baja.
    await pool.query(
      `INSERT INTO equipos_informaticos (nombre, activo, updated_at) VALUES ('Historico', false, now())`,
    );
    await pool.query(leerSql(CARPETA_MIGRACION));
  }, 120_000);

  afterAll(async () => {
    // Orden de higiene: limpiar filas -> cerrar -> dropDatabase (al revés, el DROP falla en silencio).
    await pool.query('DELETE FROM equipos_informaticos').catch(() => undefined);
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(EPHEMERAL_DB_NAME);
  }, 30_000);

  describe('catálogos cerrados contra el dominio', () => {
    it('baja_destino admite exactamente DESTINOS_BAJA_EQUIPO', async () => {
      const def = await definicion('equipos_informaticos_baja_destino_check');
      expect(literales(def)).toEqual([...DESTINOS_BAJA_EQUIPO].sort());
    });

    it('baja_categoria admite exactamente CATEGORIAS_BAJA_EQUIPO', async () => {
      const def = await definicion('equipos_informaticos_baja_categoria_check');
      expect(literales(def)).toEqual([...CATEGORIAS_BAJA_EQUIPO].sort());
    });
  });

  describe('equipos_informaticos_baja_coherente_check', () => {
    it('la migración no abortó por la fila histórica activo = false sin datos', async () => {
      const { rows } = await pool.query(
        `SELECT activo, baja_destino FROM equipos_informaticos WHERE nombre = 'Historico'`,
      );
      expect(rows).toEqual([{ activo: false, baja_destino: null }]);
    });

    it('admite un equipo vigente sin datos y uno dado de baja sin ningún dato (rama histórica)', async () => {
      await expect(insertarEquipo({ activo: true })).resolves.toEqual(expect.any(String));
      await expect(insertarEquipo({ activo: false })).resolves.toEqual(expect.any(String));
    });

    it('admite un equipo dado de baja con los datos completos', async () => {
      await expect(insertarEquipo(COMPLETOS)).resolves.toEqual(expect.any(String));
    });

    it('admite OTRA con motivo', async () => {
      await expect(
        insertarEquipo({ ...COMPLETOS, categoria: 'OTRA', motivo: 'no enciende' }),
      ).resolves.toEqual(expect.any(String));
    });

    it('rechaza un equipo vigente con cualquier dato de baja', async () => {
      const campos: Array<Partial<DatosBaja>> = [
        { destino: 'DESCARTE' },
        { categoria: 'VEJEZ' },
        { motivo: 'texto' },
        { fecha: new Date() },
        { usuario: randomUUID() },
        { ...COMPLETOS, activo: true },
      ];
      for (const datos of campos) {
        await expect(insertarEquipo({ activo: true, ...datos })).rejects.toThrow(
          /equipos_informaticos_baja_coherente_check/,
        );
      }
    });

    it('rechaza un equipo dado de baja con los datos incompletos', async () => {
      const faltantes: Array<Partial<DatosBaja>> = [
        { destino: null },
        { categoria: null },
        { fecha: null },
        { usuario: null },
        { destino: null, categoria: null, fecha: null, usuario: null, motivo: 'texto' },
      ];
      for (const faltante of faltantes) {
        await expect(insertarEquipo({ ...COMPLETOS, ...faltante })).rejects.toThrow(
          /equipos_informaticos_baja_coherente_check/,
        );
      }
    });

    it('rechaza la categoría OTRA sin motivo', async () => {
      await expect(
        insertarEquipo({ ...COMPLETOS, categoria: 'OTRA', motivo: null }),
      ).rejects.toThrow(/equipos_informaticos_baja_coherente_check/);
    });
  });
});

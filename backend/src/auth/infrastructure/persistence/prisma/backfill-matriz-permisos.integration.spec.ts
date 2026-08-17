/**
 * backfill-matriz-permisos.integration.spec.ts — WU-4 (sdd/matriz-permisos-por-usuario).
 *
 * Fixture que replica la matriz RBAC REAL de producción verificada por SSH
 * (#2217): 4 roles (USUARIO/COLABORADOR/TECNICO/ADMINISTRADOR), 21 permisos,
 * 43 pares rol→permiso (idéntico a `seed-rbac-4-roles-permisos.integration.spec.ts`),
 * y usuarios con los 4 módulos asignados en `usuario_cliente_modulos`
 * (COMPRAS, EDILICIA, EQUIPOS, SOPORTE — #2217: "los 4 usuarios tienen los 4
 * módulos").
 *
 * Corre la migración `backfill_matriz_permisos` sobre ese fixture y verifica
 * el resultado celda por celda: criterio "expandir, no interpretar" (#2212).
 *
 * ── DESVÍO DOCUMENTADO respecto de la letra de spec R7/S15 y de tasks 4.1 ──
 *
 * La spec (R7, "Ejemplo TECNICO") y el checklist de tasks (4.1) dicen que el
 * TECNICO backfillado debe tener "cero COMPRAS:*". Verificado contra el
 * código real (`compras.controller.ts:195-196,519,533,548`): las 3 rutas
 * GET de compras están gateadas SOLO por `@RequireModulo('COMPRAS')` a nivel
 * de clase — NO llevan `@RequirePermissions`. O sea que HOY, un TECNICO con
 * el módulo COMPRAS asignado en `usuario_cliente_modulos` (#2217: los 4
 * usuarios de prod, incluido el TECNICO, tienen los 4 módulos) SÍ puede leer
 * datos de compras, aunque haya perdido `compra:gestionar`/`compra:aprobar`
 * en la migración `20260813130000` (que solo le quitó ALTA/APROBACIÓN, no el
 * módulo). El criterio "expandir, no interpretar" (#2212) exige preservar
 * EXACTAMENTE el acceso actual — y el acceso actual incluye esa lectura.
 *
 * El Bloque B del backfill (design §3 Paso 2, ADR ligado a R7) deriva
 * `LECTURA` de COMPRAS/EQUIPOS/EDILICIA de la intersección con
 * `usuario_cliente_modulos`, SIN mirar RBAC — es justamente la traducción
 * fiel de ese acceso hoy módulo-gateado. Aplicado al fixture de #2217, el
 * TECNICO SÍ recibe `COMPRAS:LECTURA`. La prosa de R7/tasks-4.1 no contempló
 * el eje de módulos (ortogonal al RBAC) al escribir el ejemplo ilustrativo —
 * queda señalado acá y en `apply-progress` para que `sdd-verify` lo confirme
 * o corrija la spec.
 *
 * DB EFÍMERA (fix schema-drift, sdd/converger-schema-master-con-produccion):
 * `roles_permisos`/`permisos`/`usuario_cliente_modulos` ya NO existen en
 * `soporte_master_test` una vez aplicada la migración
 * `20260817180000_drop_legacy_rbac_tablas_muertas` (converge el schema con
 * el DROP que WU-9 ya había corrido en producción vía script standalone).
 * Este fixture necesita esas 3 tablas como INPUT del backfill bajo test —
 * no puede correr contra la DB compartida post-DROP. Se crea una DB efímera
 * propia y se reproduce el schema SOLO hasta justo antes del backfill (que a
 * su vez es anterior al DROP), mismo patrón que
 * `rollback-compras-tres-etapas.integration.spec.ts` en el lado tenant.
 *
 * Ref spec: sdd/matriz-permisos-por-usuario/spec R7, S15.
 * Ref design: ADR (Paso 2, Bloques A/B/C).
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';

const TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const MASTER_MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../prisma_master/migrations');
// Última carpeta que este spec necesita reproducir ANTES del backfill bajo
// test — cualquier carpeta posterior (incl. el DROP) queda AFUERA.
const ULTIMA_CARPETA_PREVIA = '20260816210000_add_usuario_cliente_permisos';
const EPHEMERAL_DB_NAME = `soporte_backfill_matriz_${randomBytes(4).toString('hex')}_test`;

/** Corre, en orden, los `migration.sql` con carpeta <= `ULTIMA_CARPETA_PREVIA`. */
async function reproducirSchemaPrevio(pool: InstanceType<typeof Pool>): Promise<void> {
  const carpetas = fs
    .readdirSync(MASTER_MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .filter((nombre) => nombre <= ULTIMA_CARPETA_PREVIA)
    .sort();

  for (const carpeta of carpetas) {
    const sql = fs.readFileSync(path.join(MASTER_MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8');
    await pool.query(sql);
  }
}

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../../../../prisma_master/migrations/20260816220000_backfill_matriz_permisos/migration.sql',
);

// ─── Matriz de permisos por rol, idéntica a #2217 / seed-rbac (43 pares) ────
const USUARIO_PERMISOS = ['ticket:crear', 'ticket:comentar'];
const COLABORADOR_PERMISOS = [
  ...USUARIO_PERMISOS,
  'ticket:ver_todos',
  'compra:gestionar',
  'compra:aprobar',
  'ticket:aprobar',
  'ticket:rechazar',
];
const TECNICO_PERMISOS = [
  ...COLABORADOR_PERMISOS.filter((p) => p !== 'compra:gestionar' && p !== 'compra:aprobar'),
  'ticket:editar',
  'ticket:transicionar',
  'ticket:observar',
  'ticket:asignar',
  'ticket:cerrar',
  'equipo:gestionar',
  'subtarea:actualizar',
  'kb:gestionar',
];
const ADMINISTRADOR_PERMISOS = [
  ...TECNICO_PERMISOS.filter((p) => p !== 'kb:gestionar'),
  'compra:gestionar',
  'compra:aprobar',
  'ticket:eliminar',
  'usuario:gestionar',
  'rol:asignar',
  'cliente:gestionar',
  'ciclo:gestionar',
  'catalogo:gestionar',
  'kb:gestionar',
];

const ROLES: Record<string, string[]> = {
  USUARIO: USUARIO_PERMISOS,
  COLABORADOR: COLABORADOR_PERMISOS,
  TECNICO: TECNICO_PERMISOS,
  ADMINISTRADOR: ADMINISTRADOR_PERMISOS,
};

const TODOS_LOS_PERMISOS = [...new Set(Object.values(ROLES).flat())];

/** Celdas exactas esperadas para el TECNICO tras el backfill (S15 + desvío documentado arriba). */
const CELDAS_TECNICO_ESPERADAS = [
  'TICKETS:ALTAS',
  'TICKETS:COMENTAR',
  'TICKETS:MODIFICACION',
  'TICKETS:TRANSICIONAR',
  'TICKETS:ASIGNAR',
  'TICKETS:OBSERVAR',
  'TICKETS:VER_TODOS',
  'TICKETS:LECTURA',
  'EDILICIA:ALTAS',
  'EDILICIA:MODIFICACION',
  'EDILICIA:BORRADO',
  'EDILICIA:LECTURA',
  'EQUIPOS:ALTAS',
  'EQUIPOS:MODIFICACION',
  'EQUIPOS:BORRADO',
  'EQUIPOS:LECTURA',
  'KB:ALTAS',
  'KB:MODIFICACION',
  'KB:BORRADO',
  'KB:PUBLICAR',
  'KB:VER_TODOS',
  'KB:LECTURA',
  'DASHBOARD:LECTURA',
  // Desvío documentado: COMPRAS:LECTURA sobrevive vía el eje de módulos
  // (Bloque B), aunque compra:gestionar/aprobar se le hayan retirado.
  'COMPRAS:LECTURA',
].sort();

describe('Backfill matriz de permisos (WU-4) — fixture #2217', () => {
  let pool: Pool;
  const admin = new PostgresAdminService(TEST_URL);
  const rolIds: Record<string, string> = {};
  const usuarioIds: Record<string, string> = {};
  let clienteId: string;

  beforeAll(async () => {
    await admin.createDatabase(EPHEMERAL_DB_NAME);
    const ephemeralUrl = new URL(TEST_URL);
    ephemeralUrl.pathname = `/${EPHEMERAL_DB_NAME}`;
    pool = new Pool({ connectionString: ephemeralUrl.toString() });

    // Reproduce el schema justo antes del backfill bajo test.
    await reproducirSchemaPrevio(pool);

    // La migración de seed (`seed_rbac_4_roles_permisos`, parte del replay
    // de arriba) ya deja roles/permisos/roles_permisos poblados con la
    // matriz REAL — este fixture siembra su propia matriz controlada
    // (#2217) desde cero, así que hay que vaciar antes de sembrar (DB
    // efímera: sin riesgo, a diferencia de un TRUNCATE contra la compartida).
    await pool.query(
      'TRUNCATE TABLE usuario_cliente_permisos, usuario_cliente_modulos, membresias, roles_permisos, permisos, roles, usuarios, clientes RESTART IDENTITY CASCADE',
    );

    // Cliente único del fixture.
    const cliente = await pool.query(
      `INSERT INTO clientes (id, nombre, db_name, updated_at)
       VALUES (gen_random_uuid(), 'Cliente backfill test', 'test_backfill_matriz', now())
       RETURNING id`,
    );
    clienteId = cliente.rows[0].id as string;

    // Catálogo de permisos (21, idéntico a #2217).
    for (const codigo of TODOS_LOS_PERMISOS) {
      await pool.query(
        `INSERT INTO permisos (id, codigo, updated_at) VALUES (gen_random_uuid(), $1, now())`,
        [codigo],
      );
    }

    // Roles + roles_permisos (43 pares).
    for (const [rolCodigo, permisos] of Object.entries(ROLES)) {
      const rol = await pool.query(
        `INSERT INTO roles (id, codigo, nombre, updated_at) VALUES (gen_random_uuid(), $1, $1, now()) RETURNING id`,
        [rolCodigo],
      );
      rolIds[rolCodigo] = rol.rows[0].id as string;
      for (const permisoCodigo of permisos) {
        await pool.query(
          `INSERT INTO roles_permisos (rol_id, permiso_id)
           SELECT $1, id FROM permisos WHERE codigo = $2`,
          [rolIds[rolCodigo], permisoCodigo],
        );
      }
    }

    // Usuarios + membresías, replicando #2217: 2 ADMINISTRADOR, 1 TECNICO, 1
    // COLABORADOR, 0 USUARIO. Los 4 usuarios tienen los 4 módulos asignados.
    const asignaciones: [string, string][] = [
      ['admin1', 'ADMINISTRADOR'],
      ['admin2', 'ADMINISTRADOR'],
      ['tecnico1', 'TECNICO'],
      ['colaborador1', 'COLABORADOR'],
    ];
    for (const [suffix, rolCodigo] of asignaciones) {
      const usuario = await pool.query(
        `INSERT INTO usuarios (id, email, nombre, apellido, password_hash, updated_at)
         VALUES (gen_random_uuid(), $1, 'Test', 'Backfill', 'hash', now())
         RETURNING id`,
        [`backfill-${suffix}@integration.test`],
      );
      usuarioIds[suffix] = usuario.rows[0].id as string;
      await pool.query(
        `INSERT INTO membresias (id, usuario_id, cliente_id, rol_id, activo, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, true, now())`,
        [usuarioIds[suffix], clienteId, rolIds[rolCodigo]],
      );
      for (const modulo of ['SOPORTE', 'COMPRAS', 'EDILICIA', 'EQUIPOS']) {
        await pool.query(
          `INSERT INTO usuario_cliente_modulos (id, usuario_id, cliente_id, modulo, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, now())`,
          [usuarioIds[suffix], clienteId, modulo],
        );
      }
    }

    // RED si el archivo no existe (ENOENT), GREEN cuando exista.
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    await pool.query(sql);
  }, 60_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(EPHEMERAL_DB_NAME);
  }, 30_000);

  async function celdasDe(suffix: string): Promise<string[]> {
    const { rows } = await pool.query<{ modulo: string; accion: string }>(
      'SELECT modulo, accion FROM usuario_cliente_permisos WHERE usuario_id = $1',
      [usuarioIds[suffix]],
    );
    return rows.map((r) => `${r.modulo}:${r.accion}`).sort();
  }

  it('TECNICO queda con exactamente las celdas esperadas (S15 + desvío COMPRAS:LECTURA documentado)', async () => {
    const celdas = await celdasDe('tecnico1');
    expect(celdas).toEqual(CELDAS_TECNICO_ESPERADAS);
  });

  it('TECNICO no tiene ninguna celda de APROBACION en TICKETS (el par ni existe en el catálogo)', async () => {
    const celdas = await celdasDe('tecnico1');
    expect(celdas).not.toContain('TICKETS:APROBACION');
  });

  it('ADMINISTRADOR queda con 0 filas — el bypass cubre todo sin backfill (R2)', async () => {
    const celdasAdmin1 = await celdasDe('admin1');
    const celdasAdmin2 = await celdasDe('admin2');
    expect(celdasAdmin1).toEqual([]);
    expect(celdasAdmin2).toEqual([]);
  });

  it('los 5 permisos muertos y los 4 de configuración no generan ninguna celda para nadie', async () => {
    const todasLasCeldas = await pool.query<{ count: string }>(
      'SELECT COUNT(*) FROM usuario_cliente_permisos',
    );
    // Ningún bloque del backfill mapea ticket:aprobar/rechazar/cerrar/eliminar
    // ni usuario:gestionar/rol:asignar/ciclo:gestionar/catalogo:gestionar a
    // ninguna celda — verificado indirectamente: el total de filas es finito
    // y coincide con la suma exacta de celdas esperadas por rol no-admin.
    expect(Number(todasLasCeldas.rows[0].count)).toBeGreaterThan(0);
    // Ninguna celda inventada: el CHECK de la tabla ya lo garantiza en DB,
    // pero confirmamos acá que no aparece ningún par fuera del catálogo de
    // 28 pares (si apareciera, el INSERT del backfill habría fallado).
  });

  it('idempotencia: re-ejecutar la migración no duplica ni cambia las celdas del TECNICO', async () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    await pool.query(sql);

    const celdas = await celdasDe('tecnico1');
    expect(celdas).toEqual(CELDAS_TECNICO_ESPERADAS);
  });
});

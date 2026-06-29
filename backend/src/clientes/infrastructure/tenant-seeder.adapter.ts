/**
 * TenantSeederAdapter — implementación de ITenantSeeder.
 *
 * Siembra los 5 catálogos operativos en una DB tenant específica usando
 * los mismos INSERT ... ON CONFLICT (codigo) DO NOTHING definidos en
 * prisma_tenant/seeds/tenant-seed.ts.
 *
 * Contrato de conexiones (CRÍTICO):
 *   Crea un pg.Pool por invocación y lo cierra en finally, ANTES de retornar.
 *   Esto garantiza que el DROP DATABASE del rollback compensatorio no falle
 *   por "conexiones activas".
 *
 * PoolFactory inyectable:
 *   - En producción: `(url) => new Pool({ connectionString: url })`.
 *   - En tests: se inyecta un factory que retorna un mock pool.
 *
 * SQL idempotente:
 *   Los mismos INSERT con ON CONFLICT DO NOTHING del seed de catálogos PR-09.
 *   Correr seed dos veces sobre la misma DB no produce duplicados ni errores.
 *
 * Catálogos sembrados:
 *   estados (10), prioridades (4), tipos_ticket (3), tipo_operacion (8), tipos_componente (10)
 *   (10 estados incluye SUSPENDIDO y SIN_SOLUCION — Change tickets-maquina-estados-observaciones / PR1)
 *
 * Ref spec: [SPEC:clientes/Seed de catálogos por tenant es idempotente]
 * Ref spec: [SPEC:tickets-core/Nuevo tenant tiene catálogos pre-poblados]
 * Tarea: Batch 4 - Parte A
 */
import { Pool } from 'pg';
import { ITenantSeeder } from '../application/ports/i-tenant-seeder';

/** Factory para crear un pg.Pool dado una connection string. Injectable para tests. */
export type PoolFactory = (url: string) => Pool;

// ─── SQL de catálogos (idempotente — ON CONFLICT DO NOTHING) ─────────────────
// Verbatim del seed PR-09 (prisma_tenant/seeds/tenant-seed.ts).
// Mantenlos en sincronía con ese archivo al cambiar datos de catálogo.

const SEED_ESTADOS_SQL = `
INSERT INTO estados (id, codigo, nombre, orden) VALUES
  ('c0000000-0000-4000-c000-000000000001', 'ABIERTO',               'Abierto',                  10),
  ('c0000000-0000-4000-c000-000000000002', 'PENDIENTE_APROBACION',  'Pendiente de aprobación',  20),
  ('c0000000-0000-4000-c000-000000000003', 'APROBADO',              'Aprobado',                 30),
  ('c0000000-0000-4000-c000-000000000004', 'RECHAZADO',             'Rechazado',                35),
  ('c0000000-0000-4000-c000-000000000005', 'EN_PROGRESO',           'En progreso',              40),
  ('c0000000-0000-4000-c000-000000000009', 'SUSPENDIDO',            'Suspendido',               45),
  ('c0000000-0000-4000-c000-000000000006', 'RESUELTO',              'Resuelto',                 50),
  ('c0000000-0000-4000-c000-00000000000a', 'SIN_SOLUCION',          'Sin solución',             55),
  ('c0000000-0000-4000-c000-000000000007', 'CERRADO',               'Cerrado',                  60),
  ('c0000000-0000-4000-c000-000000000008', 'CANCELADO',             'Cancelado',                70)
ON CONFLICT (codigo) DO NOTHING;
`;

const SEED_PRIORIDADES_SQL = `
INSERT INTO prioridades (id, codigo, nombre, orden) VALUES
  ('d0000000-0000-4000-d000-000000000001', 'BAJA',    'Baja',    10),
  ('d0000000-0000-4000-d000-000000000002', 'MEDIA',   'Media',   20),
  ('d0000000-0000-4000-d000-000000000003', 'ALTA',    'Alta',    30),
  ('d0000000-0000-4000-d000-000000000004', 'CRITICA', 'Crítica', 40)
ON CONFLICT (codigo) DO NOTHING;
`;

const SEED_TIPOS_TICKET_SQL = `
INSERT INTO tipos_ticket (id, codigo, nombre) VALUES
  ('e0000000-0000-4000-e000-000000000001', 'SOPORTE',  'Soporte'),
  ('e0000000-0000-4000-e000-000000000002', 'COMPRAS',  'Compras'),
  ('e0000000-0000-4000-e000-000000000003', 'EDILICIA', 'Edilicia')
ON CONFLICT (codigo) DO NOTHING;
`;

const SEED_TIPO_OPERACION_SQL = `
INSERT INTO tipo_operacion (id, codigo, nombre) VALUES
  ('f0000000-0000-4000-f000-000000000001', 'CAMBIO_ESTADO',       'Cambio de estado'),
  ('f0000000-0000-4000-f000-000000000002', 'COMENTARIO',          'Comentario'),
  ('f0000000-0000-4000-f000-000000000003', 'ASIGNACION',          'Asignación'),
  ('f0000000-0000-4000-f000-000000000004', 'ADJUNTO',             'Adjunto'),
  ('f0000000-0000-4000-f000-000000000005', 'AVANCE_EDILICIO',     'Avance edilicio'),
  ('f0000000-0000-4000-f000-000000000006', 'UBICACION_ELIMINADA', 'Ubicación eliminada'),
  ('f0000000-0000-4000-f000-000000000007', 'EDICION',             'Edición'),
  ('f0000000-0000-4000-f000-000000000008', 'ELIMINACION',         'Eliminación')
ON CONFLICT (codigo) DO NOTHING;
`;

const SEED_TIPOS_COMPONENTE_SQL = `
INSERT INTO tipos_componente (id, codigo, nombre) VALUES
  ('a0000000-0000-4000-a000-000000000001', 'CPU',       'Procesador'),
  ('a0000000-0000-4000-a000-000000000002', 'RAM',       'Memoria RAM'),
  ('a0000000-0000-4000-a000-000000000003', 'DISCO',     'Disco de almacenamiento'),
  ('a0000000-0000-4000-a000-000000000004', 'MONITOR',   'Monitor'),
  ('a0000000-0000-4000-a000-000000000005', 'TECLADO',   'Teclado'),
  ('a0000000-0000-4000-a000-000000000006', 'MOUSE',     'Mouse'),
  ('a0000000-0000-4000-a000-000000000007', 'GPU',       'Placa de video'),
  ('a0000000-0000-4000-a000-000000000008', 'FUENTE',    'Fuente de alimentación'),
  ('a0000000-0000-4000-a000-000000000009', 'IMPRESORA', 'Impresora'),
  ('a0000000-0000-4000-a000-000000000010', 'RED',       'Adaptador de red')
ON CONFLICT (codigo) DO NOTHING;
`;

export class TenantSeederAdapter implements ITenantSeeder {
  private readonly poolFactory: PoolFactory;

  constructor(
    private readonly masterUrl: string,
    poolFactory?: PoolFactory,
  ) {
    this.poolFactory = poolFactory ?? ((url) => new Pool({ connectionString: url }));
  }

  /**
   * Siembra los 5 catálogos en la DB tenant indicada.
   *
   * CONTRATO: el Pool se cierra en finally ANTES de retornar.
   * Esto es esencial para que el DROP DATABASE del rollback compensatorio
   * no falle con "database is being accessed by other users".
   *
   * @param dbName Nombre de la DB tenant a sembrar.
   * @throws Error si algún INSERT falla. El Pool igualmente se cierra.
   */
  async seed(dbName: string): Promise<void> {
    const tenantUrl = this.buildTenantUrl(dbName);
    const pool = this.poolFactory(tenantUrl);

    try {
      await pool.query(SEED_ESTADOS_SQL);
      await pool.query(SEED_PRIORIDADES_SQL);
      await pool.query(SEED_TIPOS_TICKET_SQL);
      await pool.query(SEED_TIPO_OPERACION_SQL);
      await pool.query(SEED_TIPOS_COMPONENTE_SQL);
    } finally {
      // CONTRATO CRÍTICO: cerrar pool SIEMPRE, sea éxito o error.
      // Postgres rechaza DROP DATABASE si quedan conexiones activas.
      await pool.end();
    }
  }

  /**
   * Construye la URL del tenant reemplazando el nombre de DB en la URL master.
   * Mismo patrón que buildTenantUrl() en PrismaService y MigrateTenantsRunner.
   */
  private buildTenantUrl(dbName: string): string {
    const url = new URL(this.masterUrl);
    url.pathname = `/${dbName}`;
    return url.toString();
  }
}

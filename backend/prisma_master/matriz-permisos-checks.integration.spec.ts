/**
 * matriz-permisos-checks.integration.spec.ts — WU-2 (sdd/matriz-permisos-por-usuario).
 *
 * Prueba el CHECK compuesto de `usuario_cliente_permisos` (migración
 * `add_usuario_cliente_permisos`) desde dos ángulos: (S1) Postgres rechaza un
 * par `(modulo, accion)` inválido; (S2) el CHECK real, leído vía
 * `pg_get_constraintdef`, enumera EXACTAMENTE los mismos 28 pares que
 * `PARES_VALIDOS` del dominio — ni de más ni de menos.
 *
 * Precedente copiado literal: `backend/prisma_tenant/compras-checks.integration.spec.ts:476-497`
 * (patrón `dcc867f`) — mismo helper `valoresDelCheck`, misma forma de leer el
 * CHECK sin pasar por Prisma.
 *
 * Ref spec: sdd/matriz-permisos-por-usuario/spec R1, S1, S2.
 * Ref design: ADR-P2, ADR-P3.
 */
import { Client } from 'pg';
import { PARES_VALIDOS } from '../src/shared/domain/acciones';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

describe('CHECK usuario_cliente_permisos_modulo_accion_check', () => {
  let client: Client;
  let usuarioId: string;
  let clienteId: string;

  beforeAll(async () => {
    client = new Client({ connectionString: MASTER_TEST_URL });
    await client.connect();

    // Fixture mínimo: la tabla no tiene FK físico (soft ref, mismo patrón que
    // usuario_cliente_modulos), así que UUIDs random alcanzan como destino.
    const usuario = await client.query(
      `INSERT INTO usuarios (id, email, nombre, apellido, password_hash, updated_at)
       VALUES (gen_random_uuid(), $1, 'Test', 'Matriz', 'hash', now())
       RETURNING id`,
      [`matriz-checks-${Date.now()}@integration.test`],
    );
    usuarioId = usuario.rows[0].id as string;

    const cliente = await client.query(
      `INSERT INTO clientes (id, nombre, db_name, updated_at)
       VALUES (gen_random_uuid(), 'Cliente test matriz-checks', $1, now())
       RETURNING id`,
      [`test_matriz_checks_${Date.now()}`],
    );
    clienteId = cliente.rows[0].id as string;
  });

  afterAll(async () => {
    await client.query('DELETE FROM usuario_cliente_permisos WHERE usuario_id = $1', [usuarioId]);
    await client.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
    await client.query('DELETE FROM clientes WHERE id = $1', [clienteId]);
    await client.end();
  });

  // ─── S1 — el CHECK rechaza un par inválido ───────────────────────────────

  it('S1: rechaza INSERT (usuario, cliente, DASHBOARD, APROBACION) — par inexistente', async () => {
    await expect(
      client.query(
        `INSERT INTO usuario_cliente_permisos (usuario_id, cliente_id, modulo, accion)
         VALUES ($1, $2, 'DASHBOARD', 'APROBACION')`,
        [usuarioId, clienteId],
      ),
    ).rejects.toThrow(/usuario_cliente_permisos_modulo_accion_check|check constraint/i);
  });

  it('acepta un par válido (TICKETS, LECTURA)', async () => {
    await client.query(
      `INSERT INTO usuario_cliente_permisos (usuario_id, cliente_id, modulo, accion)
       VALUES ($1, $2, 'TICKETS', 'LECTURA')`,
      [usuarioId, clienteId],
    );
    const { rows } = await client.query(
      'SELECT modulo, accion FROM usuario_cliente_permisos WHERE usuario_id = $1',
      [usuarioId],
    );
    expect(rows).toEqual([{ modulo: 'TICKETS', accion: 'LECTURA' }]);
  });

  // ─── S2 — test de deriva: el CHECK == PARES_VALIDOS, exactamente ────────

  describe('Deriva: el CHECK real enumera exactamente PARES_VALIDOS', () => {
    /**
     * Extrae los literales de un CHECK leyendo su definición real de Postgres.
     *
     * DESVÍO del precedente `compras-checks.integration.spec.ts:478-486`
     * (copiado literal al principio): la forma concatenada de ADR-P2
     * (`modulo || ':' || accion`) hace que Postgres imprima el separador
     * `':'::text` como un literal MÁS dentro de la definición — verificado
     * corriendo `pg_get_constraintdef` real (exactamente la incógnita que
     * ADR-P2 marcaba como NO VERIFICADA). El matcher genérico de literales
     * lo capturaba como un 29º elemento falso. Se filtra acá exigiendo la
     * forma `MODULO:ACCION` (dos tramos de mayúsculas separados por ':'),
     * que es justo el shape de `CodigoAccion` y excluye al separador suelto.
     */
    async function valoresDelCheck(nombre: string): Promise<string[]> {
      const result = await client.query(
        'SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1',
        [nombre],
      );
      expect(result.rows).toHaveLength(1);
      const definicion: string = result.rows[0].def;
      return [...definicion.matchAll(/'([A-Z_]+:[A-Z_]+)'/g)].map((m) => m[1]).sort();
    }

    it('usuario_cliente_permisos_modulo_accion_check enumera exactamente PARES_VALIDOS', async () => {
      const enLaDb = await valoresDelCheck('usuario_cliente_permisos_modulo_accion_check');
      expect(enLaDb).toEqual([...PARES_VALIDOS].sort());
    });
  });
});

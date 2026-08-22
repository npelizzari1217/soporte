/**
 * Regresión del turno exclusivo sobre la master de test (`lock-master-test.ts`).
 *
 * QUÉ BUG CIERRA: `soporte_master_test` es una sola base compartida y trece
 * specs le hacen TRUNCATE de `usuarios`/`clientes`/`refresh_tokens` en su
 * `beforeEach`. Con dos corridas de tests solapadas, el TRUNCATE de una borraba
 * el usuario de la otra entre `crearUsuario()` y `login()`, y el login moría
 * guardando el refresh token con `P2003` (ForeignKeyConstraintViolation).
 * Reproducido: dos procesos en paralelo dejaban `autorizacion.e2e.spec.ts` y
 * `compras.e2e.spec.ts` con 27 tests caídos CADA UNO.
 *
 * Estos tests NO usan `usarLockMasterTest()` ni la clave real: derivan la clave
 * de nombres de base ficticios, para no pelearse el turno con nadie ni tocar
 * una sola fila. Lo que verifican es lo NUESTRO — cómo se deriva la clave y que
 * el turno sea de verdad excluyente — no que Postgres sepa hacer locks.
 */
import { Client } from 'pg';

import { URL_MASTER_TEST_POR_DEFECTO, claveDeLock } from './lock-master-test';

const URL_ADMIN = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;

/** Nombre inventado: la clave que sale de acá no colisiona con la del turno real. */
const BASE_FICTICIA = 'soporte_master_test_lock_regresion';

describe('lock-master-test — turno exclusivo sobre la master compartida', () => {
  describe('claveDeLock', () => {
    it('depende SOLO del nombre de la base, no del host ni de las credenciales', () => {
      // Si dependiera de la URL entera, dos specs que escriben la misma conexión
      // de formas distintas tomarían turnos DISTINTOS sobre la MISMA base — es
      // decir, no se excluirían, que es exactamente el bug que esto cierra.
      const conUsuario = claveDeLock('postgresql://soporte:soporte@localhost:5432/soporte_x_test');
      const conOtroUsuario = claveDeLock('postgresql://otro:otra@127.0.0.1:5432/soporte_x_test');

      expect(conUsuario).toBe(conOtroUsuario);
    });

    it('da claves distintas para bases distintas', () => {
      // Y al revés: dos masters de test distintas no tienen por qué esperarse.
      const unaBase = claveDeLock('postgresql://soporte:soporte@localhost:5432/soporte_x_test');
      const otraBase = claveDeLock('postgresql://soporte:soporte@localhost:5432/soporte_y_test');

      expect(unaBase).not.toBe(otraBase);
    });

    it('entra en el rango de int32 que acepta pg_advisory_lock', () => {
      const clave = claveDeLock(`postgresql://soporte:soporte@localhost:5432/${BASE_FICTICIA}`);

      expect(Number.isInteger(clave)).toBe(true);
      expect(clave).toBeGreaterThanOrEqual(-(2 ** 31));
      expect(clave).toBeLessThan(2 ** 31);
    });
  });

  describe('exclusión real contra Postgres', () => {
    let primero: Client;
    let segundo: Client;
    const clave = claveDeLock(`postgresql://soporte:soporte@localhost:5432/${BASE_FICTICIA}`);

    beforeAll(async () => {
      primero = new Client({ connectionString: URL_ADMIN });
      segundo = new Client({ connectionString: URL_ADMIN });
      await primero.connect();
      await segundo.connect();
    }, 30_000);

    afterAll(async () => {
      await primero?.end();
      await segundo?.end();
    }, 30_000);

    it('mientras una sesión tiene el turno, otra NO lo puede tomar; al soltarlo, sí', async () => {
      const tomar = async (client: Client): Promise<boolean> => {
        const { rows } = await client.query<{ tomado: boolean }>(
          'SELECT pg_try_advisory_lock($1) AS tomado',
          [clave],
        );
        return rows[0].tomado;
      };

      expect(await tomar(primero)).toBe(true);

      // El caso que importa: acá es donde antes las dos corridas entraban juntas
      // y se truncaban la base mutuamente.
      expect(await tomar(segundo)).toBe(false);

      await primero.query('SELECT pg_advisory_unlock($1)', [clave]);

      // Y el turno tiene que quedar realmente libre — un lock que no se suelta
      // cuelga la corrida siguiente, que es la falla opuesta y peor.
      expect(await tomar(segundo)).toBe(true);
      await segundo.query('SELECT pg_advisory_unlock($1)', [clave]);
    }, 30_000);
  });
});

/**
 * entorno-test.setup.ts — defaults de test para las 3 variables de entorno
 * requeridas por `src/config/entorno.ts`.
 *
 * Ref spec: REQ-7, REQ-8. Ref design: ADR-E2.
 * Ref tasks: WU-1 1.6, 1.7.
 *
 * Registrado como `setupFiles` en `vitest.config.ts`: es el único hook de
 * Vitest que corre ANTES de importar el archivo de spec, o sea antes del
 * import-time del grafo de módulos (`src/config/entorno.ts` incluido). Un
 * `beforeAll` llega tarde para esto.
 *
 * SIEMPRE `??=`, NUNCA asignación directa: pisar el valor ya presente en el
 * shell rompería el override que un operador usa para apuntar la suite a
 * otra base, y dejaría al guardarraíl de host (`globalSetup`) auditando un
 * valor que ya no es el efectivo. No carga `.env`: meter valores de
 * desarrollo en la suite es riesgo gratuito.
 */
import { URL_MASTER_TEST_POR_DEFECTO } from '../src/testing/lock-master-test';

process.env.DATABASE_URL_MASTER ??= URL_MASTER_TEST_POR_DEFECTO;
process.env.APP_BASE_URL ??= 'http://localhost:5173';
process.env.JWT_SECRET ??= 'jwt-secret-de-test';

// No es una variable requerida: apaga el `@Cron` del barrido de webhooks (odd/webhooks, T5). Un e2e
// que levanta la app no debe enviar avisos reales ni consumir intentos de las entregas que verifica.
process.env.WEBHOOK_SWEEP_HABILITADO ??= 'false';

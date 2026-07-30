/**
 * setup-env — Vitest global setup: env SMTP DUMMY para toda la suite.
 *
 * Judgment Day PR3 Ronda 1 (notif-email-estado-ticket): `EMAIL_SENDER` en
 * `tickets.module.ts` volvió a ser fail-fast — `NodemailerEmailSender.fromEnv()`
 * lanza `SmtpConfigError` (ver `email-config.ts`) si falta config SMTP, y ESE
 * throw ya no se captura al cablear el módulo.
 *
 * Muchos specs de wiring bootstrapean el grafo de DI completo de
 * `TicketsModule`/`AppModule` (`tickets.module.wiring.spec.ts`,
 * `equipos.module.spec.ts`, `compras.module.spec.ts`,
 * `reparaciones.module.wiring.spec.ts`, `app.module.spec.ts`,
 * `app.module.validation-pipe.spec.ts`, `tickets.dto.validation-pipe.spec.ts`,
 * `smoke.e2e.spec.ts`) sin `SMTP_*` en el entorno — sin este setup, esos
 * tests (hoy verdes) romperían al primer `Test.createTestingModule().compile()`.
 *
 * Estos valores son DUMMY — `nodemailer.createTransport()` no abre conexión
 * real al construirse (solo al primer `sendMail()`), así que no hay riesgo de
 * intentar hablar con un SMTP real en CI/local. NO usar este archivo como
 * sustituto de config real en producción.
 */
process.env.SMTP_HOST ??= 'localhost';
process.env.SMTP_PORT ??= '1025';
process.env.SMTP_USER ??= 'test';
process.env.SMTP_PASS ??= 'test';
process.env.SMTP_FROM ??= 'Soporte <no-reply@soporte.test>';

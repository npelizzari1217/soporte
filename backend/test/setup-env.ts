/**
 * setup-env — Vitest global setup.
 *
 * El dummy `SMTP_*` (notif-email-estado-ticket PR3, Judgment Day Ronda 1) se
 * ELIMINÓ en PR6 (runtime-config-table): `EMAIL_SENDER`/`NodemailerEmailSender`
 * ya NO leen `process.env` — el adapter es puro y recibe la `SmtpConfig` ya
 * resuelta por `IConfigResolver` en `send(email, config)` (Dz6/Dz11). El
 * fail-fast de boot por config SMTP faltante se corrió a send-time (spec
 * Requirement 6): la app arranca siempre, con o sin config SMTP en DB — los
 * specs de wiring (`tickets.module.wiring.spec.ts`, `app.module.spec.ts`,
 * etc.) ya no dependen de ninguna variable de entorno SMTP.
 */

/**
 * CONFIG_ENCRYPTION_KEY — DUMMY para toda la suite (runtime-config-table PR1).
 *
 * SECRET_CIPHER (`shared.module.ts`) es fail-fast (F1): el `useFactory` valida
 * presencia+longitud AL BOOTSTRAP y NO captura el throw. Muchos specs de
 * wiring bootstrapean SharedModule/AppModule completo sin esta variable en
 * el entorno — sin este dummy, esos tests (hoy verdes) romperían al primer
 * `Test.createTestingModule().compile()`.
 *
 * Este valor es un base64 DUMMY de 32 bytes fijo — NO usar como sustituto de
 * una clave real en producción (generar con `openssl rand -base64 32`).
 */
process.env.CONFIG_ENCRYPTION_KEY ??= 'DQx0u+iZRVSHHHG3qEpFzAYUXVuEKCDHwipgW9BlR3c=';

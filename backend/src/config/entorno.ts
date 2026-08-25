/**
 * entorno.ts — adaptador, único con side-effect del contrato de entorno.
 *
 * Ref spec: REQ-1, REQ-3, REQ-6. Ref design: ADR-E1 (snapshot congelado al
 * importar, no getters perezosos).
 * Ref tasks: WU-1 1.5.
 *
 * Importar este módulo está pensado para SER el guard: se evalúa al
 * importarse, antes de que cualquier consumidor (DI factory, decorador,
 * listener) llegue a leer una variable de entorno requerida. Si falta alguna,
 * `construirEntorno` lanza y el import falla.
 *
 * YA ESTÁ EN EL GRAFO DE ARRANQUE (desde WU-2): `main.ts` lo importa antes de
 * `AppModule`, y `DATABASE_URL_MASTER`/`APP_BASE_URL` se leen desde acá en los
 * 5 archivos que antes hacían `process.env.X ?? ''`: `SharedModule`,
 * `ClientesModule` (3 factories de provisioning) y los 3 listeners de
 * notificaciones/CSAT — 8 lecturas en total, porque
 * `TicketNotificacionListener` lo lee una vez por handler. Faltar cualquiera
 * de esas dos variables aborta el arranque nombrándola.
 *
 * `JWT_SECRET` TAMBIÉN se exige ya, aunque nadie la consuma desde acá
 * todavía: `construirEntorno` valida las 3 claves de `VARIABLES_REQUERIDAS`,
 * así que desde WU-2 una instancia sin `JWT_SECRET` NO arranca. Cubierto por
 * `test/entorno-corte-arranque.spec.ts`.
 *
 * Lo que WU-3 todavía debe es el consumo: `auth.module.ts` sigue leyendo
 * `process.env.JWT_SECRET ?? 'soporte-dev-secret-change-in-prod'`. En el
 * proceso real ese default ya es inalcanzable —el guard aborta antes—, pero
 * el secreto sigue publicado en el repo y cualquier consumidor que arme
 * `AuthModule` sin pasar por `main.ts` (los specs) todavía cruza esa lectura
 * cruda.
 *
 * Y hay una divergencia más fina mientras eso dure: `leerValidada` trimea, la
 * lectura cruda no. Con `JWT_SECRET=" abc "` este contrato expone `"abc"` y
 * `JwtModule` firma con `" abc "` — dos valores para el mismo secreto. Se
 * cierra sola cuando WU-3 mueva el consumo acá.
 */
import { construirEntorno, type EntornoRequerido } from './validar-entorno';

export const entorno: Readonly<EntornoRequerido> = construirEntorno(process.env);

/**
 * entorno.ts — adaptador, único con side-effect del contrato de entorno.
 *
 * Ref spec: REQ-1, REQ-3, REQ-6. Ref design: ADR-E1 (snapshot congelado al
 * importar, no getters perezosos).
 *
 * Importar este módulo ES el guard: se evalúa al importarse, antes de que
 * cualquier consumidor (DI factory, decorador, listener) llegue a leer una
 * variable de entorno requerida. Si falta alguna, `construirEntorno` lanza,
 * el import falla y el proceso no arranca. `main.ts` lo importa antes de
 * `AppModule` justamente para que nada del grafo se le adelante.
 *
 * La invariante que vale la pena sostener acá, con su borde exacto: en el
 * código de PRODUCCIÓN de `src/` ya no queda ninguna lectura cruda de las 3
 * variables requeridas — todas salen de `entorno`, validadas y trimeadas por
 * `leerValidada` (`validar-entorno.ts`), así que todos esos consumidores ven
 * el mismo valor.
 *
 * DOS EXCEPCIONES, y están así a propósito. Que WU-4 las herede escritas en
 * vez de descubrirlas contando hits:
 * - `src/testing/lock-master-test.ts` lee `DATABASE_URL_MASTER` crudo con un
 *   default, porque tiene que funcionar en la suite ANTES de que exista un
 *   contrato validado y sin arrastrar el guard a cada spec.
 * - Los `*.spec.ts` bajo `src/` (unos 48 archivos) la leen crudo por la misma
 *   razón.
 *
 * Sostener la invariante es trabajo de la regla de ESLint que llega en WU-4, y
 * TODAVÍA NO EXISTE: hoy nada impide escribir una lectura cruda nueva. Lo que
 * seguro no la sostiene es una lista de consumidores en este comentario, que
 * se desactualiza el día que alguien agregue el próximo.
 *
 * El secreto de desarrollo que `auth.module.ts` traía publicado como default
 * se eliminó: ninguna instancia arranca sin un `JWT_SECRET` propio.
 *
 * El frontend espeja este contrato desde `frontend/next.config.ts`. Las
 * salvedades de ESE lado (sobre todo qué inlinea la clave `env`) están
 * documentadas ahí, no acá: dos copias de la misma prosa divergen igual que
 * dos copias de la misma constante.
 *
 * Cubierto por `test/entorno-corte-arranque.spec.ts` (corte de arranque) y
 * `src/auth/auth.module.spec.ts` (que el secreto bakeado en
 * `JwtModule.register` sale de `entorno`, no de una lectura cruda).
 */
import { construirEntorno, type EntornoRequerido } from './validar-entorno';

export const entorno: Readonly<EntornoRequerido> = construirEntorno(process.env);

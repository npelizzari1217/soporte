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
 * DOS EXCEPCIONES, y están así a propósito. Escritas acá para que el alcance
 * de la regla no haya que redescubrirlo contando hits:
 * - `src/testing/lock-master-test.ts` lee `DATABASE_URL_MASTER` crudo con un
 *   default, porque tiene que funcionar en la suite ANTES de que exista un
 *   contrato validado y sin arrastrar el guard a cada spec.
 * - Los `*.spec.ts` bajo `src/` la leen crudo por la misma razón. No van
 *   contados a propósito: un número acá se desactualiza igual que una lista.
 *
 * Sostener la invariante es trabajo de la regla de ESLint `no-restricted-syntax`
 * en `eslint.config.js` (WU-4), probada en `regla-env-vacio.lint.spec.ts`.
 * Rechaza, sobre `src/` Y sobre `scripts/`, que una lectura de `process.env`
 * degrade a string vacío. Cubre:
 * - `??` y `||`, incluido el fallback encadenado
 *   (`process.env.A || process.env.B || ''`), porque ahí ancla `process.env`
 *   como descendiente y no en una ruta fija;
 * - el ternario en sus DOS orientaciones, así que invertir la condición no lo
 *   esquiva (`!process.env.X ? '' : process.env.X` y
 *   `process.env.X === undefined ? '' : process.env.X`);
 * - el vacío escrito como `''` o como template vacío;
 * - el corchete sobre la variable (`process.env['X']`) o sobre `env` mismo
 *   (`process["env"].X`).
 *
 * Lo que la regla NO ve, para que nadie le atribuya más de lo que hace. Es un
 * selector léxico, así que se le escapan:
 * - la indirección: `const u = process.env.X; u ?? ''`;
 * - el destructuring con default: `const { X = '' } = process.env`;
 * - los vacíos escritos de forma indirecta (`?? String()`, `?? ''.trim()`);
 * - los defaults degradantes que no son el vacío exacto (`?? ' '`, `?? '-'`);
 * - el ternario cuya rama NO es la lectura pelada de env, sino algo derivado
 *   de ella: `process.env.A ? process.env.A.trim() : ''`, o el encadenado en
 *   forma de ternario. A diferencia de `??`/`||`, acá el ancla SÍ es una ruta
 *   fija, y es a propósito: exigir que una rama sea la lectura y la otra el
 *   vacío es lo que evita marcar `process.env.FLAG ? 'si' : ''`, que arma una
 *   etiqueta y no es esta enfermedad. Se eligió precisión sobre alcance.
 *
 * Y no alcanza `test/`, que está fuera del alcance de `pnpm lint`. Lo que
 * seguro no sostiene la invariante es una lista de consumidores en este
 * comentario, que se desactualiza el día que alguien agregue el próximo.
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

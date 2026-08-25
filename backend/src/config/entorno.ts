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
 * - Los `*.spec.ts` bajo `src/` (unos 48 archivos) la leen crudo por la misma
 *   razón.
 *
 * Sostener la invariante es trabajo de la regla de ESLint `no-restricted-syntax`
 * en `eslint.config.js` (WU-4), probada en `regla-env-vacio.lint.spec.ts`.
 * Rechaza, sobre `src/` y `scripts/`, que una lectura de `process.env` degrade
 * a string vacío en sus cuatro formas: con `??` y con `||`, y con el vacío
 * escrito como `''` o como template vacío. Ancla `process.env` como
 * descendiente, así que también cubre el fallback encadenado
 * (`process.env.A || process.env.B || ''`).
 *
 * Lo que la regla NO ve, para que nadie le atribuya más de lo que hace: es un
 * selector léxico, así que se le escapa la indirección
 * (`const u = process.env.X; u ?? ''`) y los otros defaults degradantes que no
 * son el vacío (`?? ' '`, `?? '-'`). Y no alcanza `test/`, que está fuera del
 * alcance de `pnpm lint`. Lo que seguro no sostiene la invariante es una lista
 * de consumidores en este comentario, que se desactualiza el día que alguien
 * agregue el próximo.
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

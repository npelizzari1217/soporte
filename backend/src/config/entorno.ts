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
 * TODAVÍA NO ESTÁ EN EL GRAFO DE ARRANQUE. Al cerrar WU-1 el único importador
 * es su propio spec: `main.ts` no lo importa y los 8 sitios con `?? ''` siguen
 * intactos, así que hoy el proceso sigue arrancando sin `JWT_SECRET` y firmando
 * con el default de desarrollo. Lo conectan WU-2 (`DATABASE_URL_MASTER`,
 * `APP_BASE_URL` y el import en `main.ts`) y WU-3 (`JWT_SECRET`). Hasta
 * entonces este módulo no protege nada — no lo leas como si ya lo hiciera.
 */
import { construirEntorno } from './validar-entorno';

export const entorno = construirEntorno(process.env);

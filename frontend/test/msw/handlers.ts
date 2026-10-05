import { http, HttpResponse, type RequestHandler } from "msw";

/**
 * Base handlers — extended per test via `server.use(...)`.
 *
 * `GET /api/insumos` está acá porque el catálogo de insumos lo consultan los dos
 * diálogos del ítem de compra, que a su vez cuelgan del detalle de la compra:
 * sin este handler, cualquier test de esas pantallas dispara una request real
 * que falla, y el ruido se confunde con un fallo del test. Devuelve el catálogo
 * VACÍO a propósito — el test que necesita insumos declara los suyos con
 * `server.use(...)`, y ninguno hereda datos que no pidió.
 *
 * `GET /api/modelos-equipo` está acá por el mismo motivo (WU-3,
 * modelos-equipo-catalogo-y-compatibilidad): los dos diálogos de equipo y el
 * listado ahora consultan `useModelosEquipo()` para el selector/columna
 * `Marca`. VACÍO por default; el test que necesita modelos declara los suyos.
 *
 * `GET /api/clientes/actual/link-soporte` está acá porque el header del shell lo consulta en cada
 * pantalla: sin link (`url: null`) el botón no aparece, y los tests que no hablan de él no ven ruido.
 */
export const handlers: RequestHandler[] = [
  http.get("/api/insumos", () => HttpResponse.json([])),
  http.get("/api/modelos-equipo", () => HttpResponse.json([])),
  http.get("/api/clientes/actual/link-soporte", () => HttpResponse.json({ url: null })),
];

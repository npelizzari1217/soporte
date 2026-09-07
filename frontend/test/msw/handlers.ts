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
 */
export const handlers: RequestHandler[] = [http.get("/api/insumos", () => HttpResponse.json([]))];

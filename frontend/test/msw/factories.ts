import { http, HttpResponse, type JsonBodyType } from "msw";

/**
 * MSW handler factories shared across feature test suites (B1+).
 *
 * `paginatedListHandler` mocks the common `{ items, total, page, pageSize }`
 * shape used by every server-paginated list endpoint in this app (tickets,
 * KB, compras, etc. — spec §2 "Mapa endpoint→pantalla"). Keeping this here
 * avoids each feature re-implementing pagination-shaped MSW responses.
 */
export function paginatedListHandler<T>(path: string, allItems: T[], pageSize = 10) {
  return http.get(`/api/${path}`, ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("pagina") ?? "1");
    const size = Number(url.searchParams.get("porPagina") ?? pageSize);
    const start = (page - 1) * size;
    const items = allItems.slice(start, start + size);

    return HttpResponse.json({
      items,
      total: allItems.length,
      page,
      pageSize: size,
    });
  });
}

/** Shorthand for a simple `GET /api/{path}` → 200 JSON body handler. */
export function jsonGetHandler(path: string, body: JsonBodyType) {
  return http.get(`/api/${path}`, () => HttpResponse.json(body));
}

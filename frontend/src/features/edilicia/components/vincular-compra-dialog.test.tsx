import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { VincularCompraDialog } from "./vincular-compra-dialog";

/** Envuelve filas en la página que devuelve `GET /reparaciones` (odd/reparaciones-paginadas). */
function paginaDe<T>(items: T[]) {
  return { items, total: items.length, pagina: 1, porPagina: 10 };
}

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function compra(id: string, numero: string, motivo: string) {
  return { id, numero, fechaSolicitud: "2026-01-01", motivo, estado: "PENDIENTE", comprado: false, cerrado: false, totalesPorMoneda: {} };
}

/** Compra activa que NO está en la primera página del listado por defecto. */
const COMPRA_FUERA_DE_PRIMERA_PAGINA = compra("compra30", "COM-0030", "Pintura aula 3");

/**
 * `GET /compras` paginado: sin `busqueda` devuelve solo la primera página (2 de
 * 25); con `busqueda` filtra por motivo o número, como el backend. Cualquier
 * pedido sin `estado=ACTIVAS` responde 500 para que el test lo note.
 */
function mockComprasActivas(urlsPedidas: string[] = []) {
  return http.get("/api/compras", ({ request }) => {
    urlsPedidas.push(request.url);
    const url = new URL(request.url);
    if (url.searchParams.get("estado") !== "ACTIVAS") {
      return HttpResponse.json({ items: [], total: 0, pagina: 1, porPagina: 20 }, { status: 500 });
    }
    const busqueda = url.searchParams.get("busqueda");
    if (busqueda === null) {
      return HttpResponse.json({
        items: [compra("compra1", "COM-0001", "Repuesto"), compra("compra2", "COM-0002", "Cañería")],
        total: 25,
        pagina: 1,
        porPagina: 20,
      });
    }
    const universo = [compra("compra1", "COM-0001", "Repuesto"), compra("compra2", "COM-0002", "Cañería"), COMPRA_FUERA_DE_PRIMERA_PAGINA];
    const termino = busqueda.toLowerCase();
    const items = universo.filter((c) => c.motivo.toLowerCase().includes(termino) || c.numero.toLowerCase().includes(termino));
    return HttpResponse.json({ items, total: items.length, pagina: 1, porPagina: 20 });
  });
}

/** Nombre accesible de una opción: el motivo primero y el número después. */
function opcion(motivo: string, numero: string): string {
  return `${motivo} — ${numero}`;
}

function renderDialogo(permisos: string[] = ["COMPRAS:LECTURA"]) {
  return renderWithProviders(
    <VincularCompraDialog
      reparacionId="rep1"
      numero="EDI-0001"
      comprasQueBloquean={[]}
      puedeVincularEnTipo
      trigger={<button>Gestionar compras</button>}
    />,
    { user: buildUser({ permisos }) },
  );
}

describe("VincularCompraDialog", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("sin búsqueda lista GET /compras?estado=ACTIVAS mostrando el motivo como texto principal y el número como secundario", async () => {
    server.use(mockComprasActivas());
    const user = userEvent.setup();
    renderDialogo();

    await user.click(screen.getByRole("button", { name: /gestionar compras/i }));
    const dialogo = await screen.findByRole("dialog");

    expect(await within(dialogo).findByRole("radio", { name: opcion("Repuesto", "COM-0001") })).toBeInTheDocument();
    expect(within(dialogo).getByRole("radio", { name: opcion("Cañería", "COM-0002") })).toBeInTheDocument();
    // La primera página no es el universo: el panel lo dice en vez de esconderlo.
    expect(within(dialogo).getByText(/se muestran 2 de 25 compras activas/i)).toBeInTheDocument();
  });

  it("buscar por motivo encuentra una compra que NO está en la primera página y la vincula", async () => {
    const urlsPedidas: string[] = [];
    let bodyRecibido: unknown = null;
    server.use(
      mockComprasActivas(urlsPedidas),
      http.post("/api/reparaciones/rep1/compras", async ({ request }) => {
        bodyRecibido = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
      http.get("/api/reparaciones", () => HttpResponse.json(paginaDe([]))),
    );
    const user = userEvent.setup();
    renderDialogo();

    await user.click(screen.getByRole("button", { name: /gestionar compras/i }));
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByRole("radio", { name: opcion("Repuesto", "COM-0001") });
    expect(within(dialogo).queryByRole("radio", { name: /pintura aula 3/i })).not.toBeInTheDocument();

    await user.type(within(dialogo).getByLabelText(/buscar compra/i), "  pintura  ");

    const pintura = await within(dialogo).findByRole("radio", { name: opcion("Pintura aula 3", "COM-0030") });
    expect(within(dialogo).queryByRole("radio", { name: opcion("Repuesto", "COM-0001") })).not.toBeInTheDocument();
    // El término viaja recortado, junto con el filtro de activas.
    const ultima = new URL(urlsPedidas[urlsPedidas.length - 1]!);
    expect(ultima.searchParams.get("busqueda")).toBe("pintura");
    expect(ultima.searchParams.get("estado")).toBe("ACTIVAS");

    await user.click(pintura);
    await user.click(within(dialogo).getByRole("button", { name: /^vincular$/i }));

    await waitFor(() => expect(bodyRecibido).toEqual({ compraId: "compra30" }));
  });

  it("una búsqueda sin coincidencias muestra el mensaje de vacío y deja Vincular deshabilitado", async () => {
    server.use(mockComprasActivas());
    const user = userEvent.setup();
    renderDialogo();

    await user.click(screen.getByRole("button", { name: /gestionar compras/i }));
    const dialogo = await screen.findByRole("dialog");
    await user.type(within(dialogo).getByLabelText(/buscar compra/i), "zzz");

    expect(await within(dialogo).findByText("Ninguna compra activa coincide con «zzz».")).toBeInTheDocument();
    expect(within(dialogo).queryAllByRole("radio")).toHaveLength(0);
    expect(within(dialogo).getByRole("button", { name: /^vincular$/i })).toBeDisabled();
  });

  it("mientras la búsqueda está en curso muestra el estado de carga", async () => {
    server.use(
      http.get("/api/compras", async () => {
        await delay("infinite");
        return HttpResponse.json({ items: [], total: 0, pagina: 1, porPagina: 20 });
      }),
    );
    const user = userEvent.setup();
    renderDialogo();

    await user.click(screen.getByRole("button", { name: /gestionar compras/i }));
    const dialogo = await screen.findByRole("dialog");

    expect(await within(dialogo).findByText("Buscando compras…")).toBeInTheDocument();
  });

  it("un término de más de 100 caracteres muestra el tope y no consulta al servidor con él", async () => {
    const urlsPedidas: string[] = [];
    server.use(mockComprasActivas(urlsPedidas));
    const user = userEvent.setup();
    renderDialogo();

    await user.click(screen.getByRole("button", { name: /gestionar compras/i }));
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByRole("radio", { name: opcion("Repuesto", "COM-0001") });

    await user.click(within(dialogo).getByLabelText(/buscar compra/i));
    await user.paste("a".repeat(101));

    expect(await within(dialogo).findByText("La búsqueda no puede superar los 100 caracteres")).toBeInTheDocument();
    // Pasada la demora, ningún pedido llevó el término inválido.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(urlsPedidas.some((u) => new URL(u).searchParams.has("busqueda"))).toBe(false);
  });

  it("Enter en el buscador no envía el formulario aunque haya una compra marcada", async () => {
    let posts = 0;
    server.use(
      mockComprasActivas(),
      http.post("/api/reparaciones/rep1/compras", () => {
        posts += 1;
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderDialogo();

    await user.click(screen.getByRole("button", { name: /gestionar compras/i }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(await within(dialogo).findByRole("radio", { name: opcion("Repuesto", "COM-0001") }));

    await user.click(within(dialogo).getByLabelText(/buscar compra/i));
    await user.keyboard("{Enter}");

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(posts).toBe(0);
    // El caso hermano: con el botón, la misma selección sí se vincula.
    await user.click(within(dialogo).getByRole("button", { name: /^vincular$/i }));
    await waitFor(() => expect(posts).toBe(1));
  });

  it("cambiar el término descarta la compra marcada: no se vincula algo que dejó de verse", async () => {
    server.use(mockComprasActivas());
    const user = userEvent.setup();
    renderDialogo();

    await user.click(screen.getByRole("button", { name: /gestionar compras/i }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(await within(dialogo).findByRole("radio", { name: opcion("Repuesto", "COM-0001") }));
    expect(within(dialogo).getByRole("button", { name: /^vincular$/i })).toBeEnabled();

    await user.type(within(dialogo).getByLabelText(/buscar compra/i), "pintura");

    await within(dialogo).findByRole("radio", { name: opcion("Pintura aula 3", "COM-0030") });
    expect(within(dialogo).getByRole("button", { name: /^vincular$/i })).toBeDisabled();
  });

  // El panel se abre pudiendo vincular O desvincular: cada acción de adentro
  // tiene su propio gate, así que abrir no habilita nada. Gatearlo solo por
  // vincular dejaba a quien únicamente puede desvincular viendo el chip
  // «Bloqueada» sin forma de sacarlo, aunque el backend le permite el DELETE.
  // Vincular espeja las DOS precondiciones del backend: ALTAS sobre el tipo de
  // la reparación (odd/permisos-por-tipo-ticket) y la celda COMPRAS:LECTURA.
  it.each<[string, boolean, string[], boolean]>([
    ["con ALTAS sobre el tipo y COMPRAS:LECTURA", true, ["COMPRAS:LECTURA"], true],
    ["con solo EDILICIA:BORRADO", false, ["EDILICIA:BORRADO"], true],
    ["con ALTAS sobre el tipo pero sin COMPRAS:LECTURA", true, [], false],
    ["sin ALTAS sobre el tipo, aunque tenga las celdas EDILICIA:ALTAS y COMPRAS:LECTURA", false, ["EDILICIA:ALTAS", "COMPRAS:LECTURA"], false],
  ])("el botón de abrir el panel se muestra pudiendo vincular O con EDILICIA:BORRADO — %s", async (_label, puedeVincularEnTipo, permisos, shouldShow) => {
    server.use(mockComprasActivas());

    renderWithProviders(
      <VincularCompraDialog
        reparacionId="rep1"
        numero="EDI-0001"
        comprasQueBloquean={[]}
        puedeVincularEnTipo={puedeVincularEnTipo}
        trigger={<button>Gestionar compras</button>}
      />,
      { user: buildUser({ permisos }) },
    );

    if (shouldShow) {
      expect(screen.getByRole("button", { name: /gestionar compras/i })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("button", { name: /gestionar compras/i })).not.toBeInTheDocument();
    }
  });

  it.each([
    ["con EDILICIA:BORRADO", ["COMPRAS:LECTURA", "EDILICIA:BORRADO"], true],
    ["sin EDILICIA:BORRADO", ["COMPRAS:LECTURA"], false],
  ])("la acción de desvincular respeta la celda EDILICIA:BORRADO del módulo (L21) — %s", async (_label, permisos, shouldShow) => {
    server.use(mockComprasActivas());
    const user = userEvent.setup();

    renderWithProviders(
      <VincularCompraDialog
        reparacionId="rep1"
        numero="EDI-0001"
        comprasQueBloquean={[{ id: "compra1", numero: "COM-0001" }]}
        puedeVincularEnTipo
        trigger={<button>Gestionar compras</button>}
      />,
      { user: buildUser({ permisos }) },
    );

    await user.click(screen.getByRole("button", { name: /gestionar compras/i }));
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findAllByText("COM-0001");

    if (shouldShow) {
      expect(within(dialogo).getByRole("button", { name: /desvincular/i })).toBeInTheDocument();
    } else {
      expect(within(dialogo).queryByRole("button", { name: /desvincular/i })).not.toBeInTheDocument();
    }
  });

  it("vincular envía POST /reparaciones/:id/compras con { compraId } y refresca el listado", async () => {
    let bodyRecibido: unknown = null;
    server.use(
      mockComprasActivas(),
      http.post("/api/reparaciones/rep1/compras", async ({ request }) => {
        bodyRecibido = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
      http.get("/api/reparaciones", () => HttpResponse.json(paginaDe([]))),
    );
    const user = userEvent.setup();

    renderWithProviders(
      <VincularCompraDialog
        reparacionId="rep1"
        numero="EDI-0001"
        comprasQueBloquean={[]}
        puedeVincularEnTipo
        trigger={<button>Gestionar compras</button>}
      />,
      { user: buildUser({ permisos: ["COMPRAS:LECTURA"] }) },
    );

    await user.click(screen.getByRole("button", { name: /gestionar compras/i }));
    const dialogo = await screen.findByRole("dialog");

    await user.click(await within(dialogo).findByRole("radio", { name: opcion("Repuesto", "COM-0001") }));
    await user.click(within(dialogo).getByRole("button", { name: /^vincular$/i }));

    await waitFor(() => expect(bodyRecibido).toEqual({ compraId: "compra1" }));
  });

  it("desvincular envía DELETE /reparaciones/:id/compras/:compraId y refresca el listado", async () => {
    let compraIdBorrada: string | null = null;
    server.use(
      mockComprasActivas(),
      http.delete("/api/reparaciones/rep1/compras/compra1", () => {
        compraIdBorrada = "compra1";
        return new HttpResponse(null, { status: 204 });
      }),
      http.get("/api/reparaciones", () => HttpResponse.json(paginaDe([]))),
    );
    const user = userEvent.setup();

    renderWithProviders(
      <VincularCompraDialog
        reparacionId="rep1"
        numero="EDI-0001"
        comprasQueBloquean={[{ id: "compra1", numero: "COM-0001" }]}
        puedeVincularEnTipo
        trigger={<button>Gestionar compras</button>}
      />,
      { user: buildUser({ permisos: ["COMPRAS:LECTURA", "EDILICIA:BORRADO"] }) },
    );

    await user.click(screen.getByRole("button", { name: /gestionar compras/i }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: /desvincular/i }));

    await waitFor(() => expect(compraIdBorrada).toBe("compra1"));
  });
});

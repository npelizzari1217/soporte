import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { VincularCompraDialog } from "./vincular-compra-dialog";

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

/** Compra completada vinculada al ticket: no figura entre las activas, así que no achica el selector. */
const VINCULADA_COMPLETADA = { id: "compra9", numero: "COM-0009", grupo: "COMPLETADAS", bloquea: false };

/**
 * Compras vinculadas al ticket (`GET /tickets/:id/compras`, odd/ticket-unificado). Por defecto una
 * activa que bloquea y una completada que ya no, que igual se puede desvincular.
 */
function mockComprasDelTicket(
  vinculadas: unknown[] = [{ id: "compra1", numero: "COM-0001", grupo: "ACTIVAS", bloquea: true }, VINCULADA_COMPLETADA],
) {
  return http.get("/api/tickets/tk1/compras", () => HttpResponse.json(vinculadas));
}

/** Nombre accesible de una opción: el motivo primero y el número después. */
function opcion(motivo: string, numero: string): string {
  return `${motivo} — ${numero}`;
}

function renderDialog(puedeModificarEnTipo: boolean, permisos: string[]) {
  return renderWithProviders(
    <VincularCompraDialog ticketId="tk1" numero="EDI-0001" puedeModificarEnTipo={puedeModificarEnTipo} />,
    { user: buildUser({ rol: "TECNICO", permisos }) },
  );
}

/** Abre el panel con permiso de gestión y espera a que carguen las compras del ticket. */
async function abrirPanel(user: ReturnType<typeof userEvent.setup>) {
  renderDialog(true, ["COMPRAS:LECTURA"]);
  await user.click(screen.getByRole("button", { name: "Gestionar compras" }));
  const dialogo = await screen.findByRole("dialog");
  await within(dialogo).findByText("COM-0009");
  return dialogo;
}

describe("VincularCompraDialog (odd/ticket-unificado, S4)", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    server.use(mockComprasActivas(), mockComprasDelTicket());
  });

  it("lista las compras vinculadas del ticket, con las que bloquean marcadas", async () => {
    const user = userEvent.setup();
    renderDialog(true, ["COMPRAS:LECTURA"]);

    await user.click(screen.getByRole("button", { name: "Gestionar compras" }));
    const dialogo = await screen.findByRole("dialog");

    const activa = (await within(dialogo).findByText("COM-0001")).closest("li") as HTMLElement;
    expect(within(activa).getByText("Bloquea")).toBeInTheDocument();
    const completada = within(dialogo).getByText("COM-0009").closest("li") as HTMLElement;
    expect(within(completada).queryByText("Bloquea")).toBeNull();
    expect(within(completada).getByText("Completada")).toBeInTheDocument();
  });

  it("el selector se alimenta de GET /compras?estado=ACTIVAS y no repite las ya vinculadas", async () => {
    const user = userEvent.setup();
    const dialogo = await abrirPanel(user);

    expect(await within(dialogo).findByRole("radio", { name: opcion("Cañería", "COM-0002") })).toBeInTheDocument();
    expect(within(dialogo).queryByRole("radio", { name: /COM-0001/ })).toBeNull();
  });

  // Vincular y desvincular exigen lo mismo que el backend: MODIFICACION sobre el tipo del ticket y
  // la celda COMPRAS:LECTURA. Ni ALTAS ni EDILICIA:BORRADO alcanzan (JD-A-001, JD-B-004).
  it.each<[string, boolean, string[], string | null, boolean]>([
    ["con MODIFICACION y COMPRAS:LECTURA", true, ["COMPRAS:LECTURA"], "Gestionar compras", true],
    ["con COMPRAS:LECTURA y EDILICIA:BORRADO, sin MODIFICACION", false, ["COMPRAS:LECTURA", "EDILICIA:BORRADO"], "Ver compras", false],
    ["con MODIFICACION y EDILICIA:BORRADO, sin COMPRAS:LECTURA", true, ["EDILICIA:BORRADO", "EDILICIA:ALTAS"], null, false],
  ])("%s", async (_caso, puedeModificarEnTipo, permisos, boton, gestiona) => {
    const user = userEvent.setup();
    renderDialog(puedeModificarEnTipo, permisos);

    if (boton === null) {
      // Sin COMPRAS:LECTURA el backend no le muestra las compras: no hay panel que abrir.
      expect(screen.queryByRole("button", { name: /compras/i })).toBeNull();
      return;
    }
    expect(screen.queryByRole("button", { name: boton === "Ver compras" ? "Gestionar compras" : "Ver compras" })).toBeNull();
    await user.click(screen.getByRole("button", { name: boton }));
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByText("COM-0001");

    if (gestiona) {
      expect(within(dialogo).getAllByRole("button", { name: /desvincular/i })).toHaveLength(2);
      expect(within(dialogo).getByLabelText(/vincular compra/i)).toBeInTheDocument();
    } else {
      expect(within(dialogo).queryByRole("button", { name: /desvincular/i })).toBeNull();
      expect(within(dialogo).queryByLabelText(/vincular compra/i)).toBeNull();
    }
  });

  it("vincular envía POST /tickets/:id/compras con { compraId } y refresca las compras del ticket", async () => {
    let bodyRecibido: unknown = null;
    let lecturas = 0;
    server.use(
      http.get("/api/tickets/tk1/compras", () => {
        lecturas += 1;
        return HttpResponse.json([]);
      }),
      http.post("/api/tickets/tk1/compras", async ({ request }) => {
        bodyRecibido = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderDialog(true, ["COMPRAS:LECTURA"]);

    await user.click(screen.getByRole("button", { name: "Gestionar compras" }));
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByText(/sin compras vinculadas/i);

    await user.click(await within(dialogo).findByRole("radio", { name: opcion("Repuesto", "COM-0001") }));
    await user.click(within(dialogo).getByRole("button", { name: /^vincular$/i }));

    await waitFor(() => expect(bodyRecibido).toEqual({ compraId: "compra1" }));
    await waitFor(() => expect(lecturas).toBeGreaterThan(1));
  });

  it("desvincular envía DELETE /tickets/:id/compras/:compraId", async () => {
    let compraIdBorrada: string | null = null;
    server.use(
      http.delete("/api/tickets/tk1/compras/:compraId", ({ params }) => {
        compraIdBorrada = String(params.compraId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderDialog(true, ["COMPRAS:LECTURA"]);

    await user.click(screen.getByRole("button", { name: "Gestionar compras" }));
    const dialogo = await screen.findByRole("dialog");
    const completada = (await within(dialogo).findByText("COM-0009")).closest("li") as HTMLElement;
    await user.click(within(completada).getByRole("button", { name: /desvincular/i }));

    await waitFor(() => expect(compraIdBorrada).toBe("compra9"));
  });

  // Búsqueda por descripción o número (feat/compra-por-descripcion): el usuario reconoce la compra
  // por su motivo, no por su número. Vive en el panel, así que vale también desde el detalle.
  describe("búsqueda de la compra a vincular", () => {
    beforeEach(() => {
      server.use(mockComprasActivas(), mockComprasDelTicket([VINCULADA_COMPLETADA]));
    });

    it("sin búsqueda lista GET /compras?estado=ACTIVAS mostrando el motivo como texto principal y el número como secundario", async () => {
      const user = userEvent.setup();
      const dialogo = await abrirPanel(user);

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
        http.post("/api/tickets/tk1/compras", async ({ request }) => {
          bodyRecibido = await request.json();
          return new HttpResponse(null, { status: 201 });
        }),
      );
      const user = userEvent.setup();
      const dialogo = await abrirPanel(user);
      await within(dialogo).findByRole("radio", { name: opcion("Repuesto", "COM-0001") });
      expect(within(dialogo).queryByRole("radio", { name: /pintura aula 3/i })).not.toBeInTheDocument();

      await user.type(within(dialogo).getByLabelText(/vincular compra/i), "  pintura  ");

      const pintura = await within(dialogo).findByRole("radio", { name: opcion("Pintura aula 3", "COM-0030") });
      expect(within(dialogo).queryByRole("radio", { name: opcion("Repuesto", "COM-0001") })).not.toBeInTheDocument();
      // El término viaja recortado, junto con el filtro de activas.
      const ultima = new URL(urlsPedidas[urlsPedidas.length - 1] ?? "");
      expect(ultima.searchParams.get("busqueda")).toBe("pintura");
      expect(ultima.searchParams.get("estado")).toBe("ACTIVAS");

      await user.click(pintura);
      await user.click(within(dialogo).getByRole("button", { name: /^vincular$/i }));

      await waitFor(() => expect(bodyRecibido).toEqual({ compraId: "compra30" }));
    });

    it("buscar por número también encuentra la compra", async () => {
      const user = userEvent.setup();
      const dialogo = await abrirPanel(user);

      await user.type(within(dialogo).getByLabelText(/vincular compra/i), "COM-0030");

      expect(await within(dialogo).findByRole("radio", { name: opcion("Pintura aula 3", "COM-0030") })).toBeInTheDocument();
      expect(within(dialogo).queryByRole("radio", { name: opcion("Cañería", "COM-0002") })).not.toBeInTheDocument();
    });

    it("una búsqueda sin coincidencias muestra el mensaje de vacío y deja Vincular deshabilitado", async () => {
      const user = userEvent.setup();
      const dialogo = await abrirPanel(user);
      await user.type(within(dialogo).getByLabelText(/vincular compra/i), "zzz");

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
      const dialogo = await abrirPanel(user);

      expect(await within(dialogo).findByText("Buscando compras…")).toBeInTheDocument();
    });

    it("si GET /compras falla muestra el error en vez de una lista vacía", async () => {
      server.use(http.get("/api/compras", () => HttpResponse.json({ message: "falla" }, { status: 500 })));
      const user = userEvent.setup();
      const dialogo = await abrirPanel(user);

      expect(await within(dialogo).findByText("No se pudieron cargar las compras.")).toBeInTheDocument();
      expect(within(dialogo).queryByText("No hay compras activas para vincular.")).toBeNull();
    });

    it("un término de más de 100 caracteres muestra el tope y no consulta al servidor con él", async () => {
      const urlsPedidas: string[] = [];
      server.use(mockComprasActivas(urlsPedidas));
      const user = userEvent.setup();
      const dialogo = await abrirPanel(user);
      await within(dialogo).findByRole("radio", { name: opcion("Repuesto", "COM-0001") });

      await user.click(within(dialogo).getByLabelText(/vincular compra/i));
      await user.paste("a".repeat(101));

      expect(await within(dialogo).findByText("La búsqueda no puede superar los 100 caracteres")).toBeInTheDocument();
      // Pasada la demora, ningún pedido llevó el término inválido.
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(urlsPedidas.some((u) => new URL(u).searchParams.has("busqueda"))).toBe(false);
    });

    it("Enter en el buscador no envía el formulario aunque haya una compra marcada", async () => {
      let posts = 0;
      server.use(
        http.post("/api/tickets/tk1/compras", () => {
          posts += 1;
          return new HttpResponse(null, { status: 201 });
        }),
      );
      const user = userEvent.setup();
      const dialogo = await abrirPanel(user);
      await user.click(await within(dialogo).findByRole("radio", { name: opcion("Repuesto", "COM-0001") }));

      await user.click(within(dialogo).getByLabelText(/vincular compra/i));
      await user.keyboard("{Enter}");

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(posts).toBe(0);
      // El caso hermano: con el botón, la misma selección sí se vincula.
      await user.click(within(dialogo).getByRole("button", { name: /^vincular$/i }));
      await waitFor(() => expect(posts).toBe(1));
    });

    it("cambiar el término descarta la compra marcada: no se vincula algo que dejó de verse", async () => {
      const user = userEvent.setup();
      const dialogo = await abrirPanel(user);
      await user.click(await within(dialogo).findByRole("radio", { name: opcion("Repuesto", "COM-0001") }));
      expect(within(dialogo).getByRole("button", { name: /^vincular$/i })).toBeEnabled();

      await user.type(within(dialogo).getByLabelText(/vincular compra/i), "pintura");

      await within(dialogo).findByRole("radio", { name: opcion("Pintura aula 3", "COM-0030") });
      expect(within(dialogo).getByRole("button", { name: /^vincular$/i })).toBeDisabled();
    });
  });
});

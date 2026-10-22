import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { TipoTicketFormDialog } from "./tipo-ticket-form-dialog";
import type { TipoTicket } from "@/features/tickets/types";

/**
 * TipoTicketFormDialog — regresión de dialogos-reset-valores-vigentes: mismo
 * molde que `SectorFormDialog` (D1), más la particularidad D1b: es el único
 * de los cuatro con `<Select>` de valor no controlado y con `modulo`
 * ausente en la rama de alta.
 */
function buildTipo(overrides: Partial<TipoTicket> = {}): TipoTicket {
  return {
    id: "t1",
    codigo: "INC",
    nombre: "Tipo Original",
    modulo: "TICKETS",
    activo: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("TipoTicketFormDialog", () => {
  it("reabrir tras un cambio de la prop `tipo` muestra el valor vigente, no el del primer render", async () => {
    const user = userEvent.setup();
    const tipoV1 = buildTipo();
    const tipoV2 = buildTipo({ nombre: "Tipo Actualizado" });

    const { rerender } = renderWithProviders(<TipoTicketFormDialog tipo={tipoV1} trigger={<button>Editar</button>} />);

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: /cerrar/i }));

    rerender(<TipoTicketFormDialog tipo={tipoV2} trigger={<button>Editar</button>} />);

    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText(/^nombre$/i)).toHaveValue("Tipo Actualizado");
  });

  it("editar un solo campo tras la reapertura y guardar no pisa los demás con el snapshot del primer render", async () => {
    const user = userEvent.setup();
    const tipoV1 = buildTipo();
    const tipoV2 = buildTipo({ modulo: "COMPRAS" });
    let capturado: Record<string, unknown> = {};
    server.use(
      http.patch("/api/catalogos/tipos-ticket/t1", async ({ request }) => {
        capturado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...tipoV2, ...capturado });
      }),
    );

    const { rerender } = renderWithProviders(<TipoTicketFormDialog tipo={tipoV1} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: /cerrar/i }));
    rerender(<TipoTicketFormDialog tipo={tipoV2} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    // Solo se toca `nombre`; `modulo` NO se edita en esta apertura.
    const nombreInput = screen.getByLabelText(/^nombre$/i);
    await user.clear(nombreInput);
    await user.type(nombreInput, "Tipo Renombrado");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado.nombre).toBe("Tipo Renombrado"));
    expect(capturado.modulo).toBe("COMPRAS");
  });

  it("de alta, elegir un módulo y cerrar sin guardar no lo conserva al reabrir (D1b)", async () => {
    const user = userEvent.setup();

    renderWithProviders(<TipoTicketFormDialog trigger={<button>Nuevo</button>} />);

    await user.click(screen.getByRole("button", { name: "Nuevo" }));
    await user.selectOptions(screen.getByLabelText(/^módulo$/i), "EDILICIA");
    await user.click(screen.getByRole("button", { name: /cerrar/i }));

    await user.click(screen.getByRole("button", { name: "Nuevo" }));

    expect(screen.getByLabelText(/^módulo$/i)).toHaveValue("");
  });

  it("al editar un tipo fijo del sistema, el código es de solo lectura; el nombre se edita", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <TipoTicketFormDialog tipo={buildTipo({ codigo: "PREVENTIVO" })} trigger={<button>Editar</button>} />,
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText(/^código$/i)).toHaveAttribute("readonly");
    expect(screen.getByLabelText(/^nombre$/i)).not.toHaveAttribute("readonly");
  });

  it("al editar un tipo que no es del sistema, el código sigue editable", async () => {
    const user = userEvent.setup();

    renderWithProviders(<TipoTicketFormDialog tipo={buildTipo()} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText(/^código$/i)).not.toHaveAttribute("readonly");
  });

  describe("módulos ofrecidos (S4, odd/tasks/tipos-ticket-por-modulo.md)", () => {
    const opcionesDeModulo = () =>
      Array.from((screen.getByLabelText(/^módulo$/i) as HTMLSelectElement).options)
        .filter((opcion) => opcion.value !== "")
        .map((opcion) => opcion.value);

    it("de alta, solo ofrece los módulos con un alta que permite elegir el tipo", async () => {
      const user = userEvent.setup();
      renderWithProviders(<TipoTicketFormDialog trigger={<button>Nuevo</button>} />);

      await user.click(screen.getByRole("button", { name: "Nuevo" }));

      expect(opcionesDeModulo()).toEqual(["TICKETS", "EDILICIA"]);
    });

    it("al editar un tipo de COMPRAS conserva su módulo como opción vigente, sin sumar EQUIPOS", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <TipoTicketFormDialog tipo={buildTipo({ modulo: "COMPRAS" })} trigger={<button>Editar</button>} />,
      );

      await user.click(screen.getByRole("button", { name: "Editar" }));

      expect(screen.getByLabelText(/^módulo$/i)).toHaveValue("COMPRAS");
      expect(opcionesDeModulo()).toEqual(["TICKETS", "EDILICIA", "COMPRAS"]);
    });
  });

  describe("Copiar permisos de (S4, odd/tasks/permisos-por-tipo-ticket.md)", () => {
    const SOPORTE = buildTipo({ id: "11111111-1111-4111-8111-111111111111", codigo: "SOPORTE", nombre: "Soporte" });
    const REDES = buildTipo({ id: "22222222-2222-4222-8222-222222222222", codigo: "REDES", nombre: "Redes" });
    const EDILICIA = buildTipo({
      id: "33333333-3333-4333-8333-333333333333",
      codigo: "EDILICIA",
      nombre: "Edilicia",
      modulo: "EDILICIA",
    });

    function catalogo(tipos: TipoTicket[] = [SOPORTE, REDES, EDILICIA]) {
      server.use(http.get("/api/catalogos/tipos-ticket", () => HttpResponse.json(tipos)));
    }

    const selectCopiar = () => screen.getByLabelText(/^copiar permisos de$/i) as HTMLSelectElement;
    const opcionesDeCopia = () => Array.from(selectCopiar().options).map((o) => o.textContent);

    async function abrirAlta() {
      const user = userEvent.setup();
      renderWithProviders(<TipoTicketFormDialog trigger={<button>Nuevo</button>} />);
      await user.click(screen.getByRole("button", { name: "Nuevo" }));
      return user;
    }

    it("de alta, arranca en 'Ninguno (cerrado)' y explica que el tipo nuevo nace cerrado", async () => {
      catalogo();
      await abrirAlta();

      expect(selectCopiar()).toHaveValue("");
      expect(selectCopiar().selectedOptions[0]).toHaveTextContent("Ninguno (cerrado)");
      expect(
        screen.getByText(
          "El tipo nuevo nace cerrado: solo los administradores lo ven hasta que se asignen permisos. Al elegir un tipo, cada usuario recibe en el nuevo los mismos permisos que tiene en ese.",
        ),
      ).toBeInTheDocument();
    });

    it("ofrece solo los tipos del módulo elegido", async () => {
      catalogo();
      const user = await abrirAlta();

      await user.selectOptions(screen.getByLabelText(/^módulo$/i), "TICKETS");
      await waitFor(() => expect(opcionesDeCopia()).toEqual(["Ninguno (cerrado)", "Soporte", "Redes"]));

      await user.selectOptions(screen.getByLabelText(/^módulo$/i), "EDILICIA");
      expect(opcionesDeCopia()).toEqual(["Ninguno (cerrado)", "Edilicia"]);
    });

    it("cambiar el módulo vuelve a 'Ninguno' el tipo elegido, y el alta no lo envía", async () => {
      catalogo();
      let capturado: Record<string, unknown> = {};
      server.use(
        http.post("/api/catalogos/tipos-ticket", async ({ request }) => {
          capturado = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(buildTipo({ ...capturado }), { status: 201 });
        }),
      );
      const user = await abrirAlta();
      await user.type(screen.getByLabelText(/^código$/i), "ELECT");
      await user.type(screen.getByLabelText(/^nombre$/i), "Electricidad");
      await user.selectOptions(screen.getByLabelText(/^módulo$/i), "TICKETS");
      await waitFor(() => expect(opcionesDeCopia()).toContain("Soporte"));
      await user.selectOptions(selectCopiar(), SOPORTE.id);

      await user.selectOptions(screen.getByLabelText(/^módulo$/i), "EDILICIA");
      expect(selectCopiar()).toHaveValue("");
      await user.selectOptions(screen.getByLabelText(/^módulo$/i), "TICKETS");
      expect(selectCopiar()).toHaveValue("");
      await user.click(screen.getByRole("button", { name: /^crear$/i }));

      await waitFor(() => expect(capturado.codigo).toBe("ELECT"));
      expect(capturado).toEqual({ codigo: "ELECT", nombre: "Electricidad", modulo: "TICKETS" });
    });

    it("con un tipo elegido, el alta envía copiarPermisosDeTipoId", async () => {
      catalogo();
      let capturado: Record<string, unknown> = {};
      server.use(
        http.post("/api/catalogos/tipos-ticket", async ({ request }) => {
          capturado = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(buildTipo({ ...capturado }), { status: 201 });
        }),
      );
      const user = await abrirAlta();
      await user.type(screen.getByLabelText(/^código$/i), "ELECT");
      await user.type(screen.getByLabelText(/^nombre$/i), "Electricidad");
      await user.selectOptions(screen.getByLabelText(/^módulo$/i), "TICKETS");
      await waitFor(() => expect(opcionesDeCopia()).toContain("Redes"));
      await user.selectOptions(selectCopiar(), REDES.id);
      await user.click(screen.getByRole("button", { name: /^crear$/i }));

      await waitFor(() => expect(capturado.codigo).toBe("ELECT"));
      expect(capturado).toEqual({
        codigo: "ELECT",
        nombre: "Electricidad",
        modulo: "TICKETS",
        copiarPermisosDeTipoId: REDES.id,
      });
    });

    it("reabrir el alta tras elegir un tipo y cerrar sin guardar vuelve a 'Ninguno'", async () => {
      catalogo();
      const user = await abrirAlta();
      await user.selectOptions(screen.getByLabelText(/^módulo$/i), "TICKETS");
      await waitFor(() => expect(opcionesDeCopia()).toContain("Soporte"));
      await user.selectOptions(selectCopiar(), SOPORTE.id);
      await user.click(screen.getByRole("button", { name: /cerrar/i }));

      await user.click(screen.getByRole("button", { name: "Nuevo" }));

      expect(selectCopiar()).toHaveValue("");
    });

    it("al editar un tipo no se ofrece copiar permisos ni se envía el campo", async () => {
      catalogo();
      let capturado: Record<string, unknown> = {};
      server.use(
        http.patch("/api/catalogos/tipos-ticket/t1", async ({ request }) => {
          capturado = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(buildTipo({ ...capturado }));
        }),
      );
      const user = userEvent.setup();
      renderWithProviders(<TipoTicketFormDialog tipo={buildTipo()} trigger={<button>Editar</button>} />);
      await user.click(screen.getByRole("button", { name: "Editar" }));

      expect(screen.queryByLabelText(/^copiar permisos de$/i)).not.toBeInTheDocument();
      await user.selectOptions(screen.getByLabelText(/^módulo$/i), "EDILICIA");
      await user.click(screen.getByRole("button", { name: /^guardar$/i }));

      await waitFor(() => expect(capturado.modulo).toBe("EDILICIA"));
      expect(capturado).toEqual({ codigo: "INC", nombre: "Tipo Original", modulo: "EDILICIA" });
    });
  });
});

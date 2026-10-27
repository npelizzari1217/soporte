import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { CompraCreateDialog } from "./compra-create-dialog";
import { permisosDeTest, renderConPermisos } from "@/shared/hooks/use-permisos-por-tipo.test-helpers";
import type { TipoTicket } from "@/features/tickets/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const TIPO_SOPORTE_ID = "11111111-1111-4111-8111-111111111111";
const TIPO_EDILICIA_ID = "22222222-2222-4222-8222-222222222222";
const TIPO_MANTENIMIENTO_ID = "33333333-3333-4333-8333-333333333333";

function tipo(id: string, codigo: string, nombre: string, modulo: TipoTicket["modulo"]): TipoTicket {
  return { id, codigo, nombre, modulo, activo: true, createdAt: "", updatedAt: "" };
}

/** Catálogo activo: tres tipos de módulos distintos; el backend admite cualquiera en una compra. */
const TIPOS: TipoTicket[] = [
  tipo(TIPO_SOPORTE_ID, "SOPORTE", "Soporte", "TICKETS"),
  tipo(TIPO_EDILICIA_ID, "EDILICIA", "Edilicia", "EDILICIA"),
  tipo(TIPO_MANTENIMIENTO_ID, "MANTENIMIENTO", "Mantenimiento", "EDILICIA"),
];

function mockTipos(tipos: TipoTicket[] = TIPOS) {
  server.use(http.get("/api/catalogos/tipos-ticket", () => HttpResponse.json(tipos)));
}

/** La celda `COMPRAS:ALTAS` decide la acción; el tipo, sobre qué compras (S2). */
const tecnico = buildUser({ rol: "TECNICO", permisos: ["COMPRAS:ALTAS"] });

async function completarCabecera(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/motivo/i), "Reposición de insumos");
  await user.type(screen.getByLabelText(/fecha de solicitud/i), "2026-02-01");
}

async function abrirDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /nueva compra/i }));
  return user;
}

describe("CompraCreateDialog", () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.mocked(toast.error).mockClear();
    mockTipos();
  });

  it("envía el POST con el payload correcto — SIN numero/solicitanteId/cicloId — y navega a la compra creada", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post("/api/compras", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "compra-nueva" }, { status: 201 });
      }),
    );

    renderWithProviders(<CompraCreateDialog />, { user: buildUser({ permisos: ["COMPRAS:ALTAS"] }) });

    const user = await abrirDialog();
    await completarCabecera(user);
    await screen.findByRole("option", { name: "Soporte" });
    await user.selectOptions(screen.getByLabelText("Tipo"), TIPO_SOPORTE_ID);
    await user.click(screen.getByRole("button", { name: /crear$/i }));

    await waitFor(() => expect(capturedBody.motivo).toBe("Reposición de insumos"));
    expect(capturedBody.fechaSolicitud).toBe("2026-02-01");
    expect(capturedBody.tipoTicketId).toBe(TIPO_SOPORTE_ID);
    expect(capturedBody).not.toHaveProperty("numero");
    expect(capturedBody).not.toHaveProperty("solicitanteId");
    expect(capturedBody).not.toHaveProperty("cicloId");

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/compras/compra-nueva"));
    await waitFor(() => expect(screen.queryByLabelText(/motivo/i)).not.toBeInTheDocument());
  });

  it("muestra el error de dominio del backend (409, sin ciclo activo) al usuario, sin cerrar el dialog", async () => {
    const MENSAJE_BACKEND = "No hay un ciclo activo para crear la compra.";
    server.use(
      http.post("/api/compras", () =>
        HttpResponse.json({ statusCode: 409, message: MENSAJE_BACKEND }, { status: 409 }),
      ),
    );

    renderWithProviders(<CompraCreateDialog />, { user: buildUser({ permisos: ["COMPRAS:ALTAS"] }) });

    const user = await abrirDialog();
    await completarCabecera(user);
    await screen.findByRole("option", { name: "Soporte" });
    await user.selectOptions(screen.getByLabelText("Tipo"), TIPO_SOPORTE_ID);
    await user.click(screen.getByRole("button", { name: /crear$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
    expect(screen.getByLabelText(/motivo/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  describe("tipo de ticket (odd/compras-por-tipo, S3)", () => {
    function capturarAltas(): Record<string, unknown>[] {
      const bodies: Record<string, unknown>[] = [];
      server.use(
        http.post("/api/compras", async ({ request }) => {
          bodies.push((await request.json()) as Record<string, unknown>);
          return HttpResponse.json({ id: "compra-nueva" }, { status: 201 });
        }),
      );
      return bodies;
    }

    it("ofrece solo los tipos con ALTAS para la sesión y manda el elegido", async () => {
      const bodies = capturarAltas();
      renderConPermisos(<CompraCreateDialog />, {
        user: tecnico,
        permisos: permisosDeTest({
          [TIPO_SOPORTE_ID]: ["LECTURA", "ALTAS"],
          // Ve las compras de Edilicia, pero no puede crearlas: no se ofrece.
          [TIPO_EDILICIA_ID]: ["LECTURA"],
          [TIPO_MANTENIMIENTO_ID]: ["LECTURA", "ALTAS"],
        }),
      });

      const user = await abrirDialog();
      await completarCabecera(user);
      await screen.findByRole("option", { name: "Soporte" });
      expect(screen.getByRole("option", { name: "Mantenimiento" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Edilicia" })).not.toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText("Tipo"), TIPO_MANTENIMIENTO_ID);
      await user.click(screen.getByRole("button", { name: /crear$/i }));

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0].tipoTicketId).toBe(TIPO_MANTENIMIENTO_ID);
    });

    it("sin tipo elegido no envía el alta y pide elegir uno", async () => {
      const bodies = capturarAltas();
      renderConPermisos(<CompraCreateDialog />, {
        user: tecnico,
        permisos: permisosDeTest({ [TIPO_SOPORTE_ID]: ["LECTURA", "ALTAS"] }),
      });

      const user = await abrirDialog();
      await completarCabecera(user);
      await screen.findByRole("option", { name: "Soporte" });
      expect(screen.getByLabelText("Tipo")).toHaveValue("");
      await user.click(screen.getByRole("button", { name: /crear$/i }));

      expect(await screen.findByText("Elija un tipo", { selector: "p" })).toBeInTheDocument();
      expect(bodies).toHaveLength(0);
    });

    it("sin ALTAS sobre ningún tipo, lo explica y deshabilita Crear", async () => {
      const bodies = capturarAltas();
      renderConPermisos(<CompraCreateDialog />, {
        user: tecnico,
        permisos: permisosDeTest({ [TIPO_SOPORTE_ID]: ["LECTURA"], [TIPO_EDILICIA_ID]: ["LECTURA"] }),
      });

      await abrirDialog();

      expect(await screen.findByText(/no tiene permiso de alta sobre ningún tipo/i)).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Soporte" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /crear$/i })).toBeDisabled();
      expect(bodies).toHaveLength(0);
    });

    it("mientras el catálogo carga, no afirma que falte el permiso ni deshabilita Crear", async () => {
      server.use(
        http.get("/api/catalogos/tipos-ticket", async () => {
          await delay("infinite");
          return HttpResponse.json(TIPOS);
        }),
      );
      renderConPermisos(<CompraCreateDialog />, {
        user: tecnico,
        permisos: permisosDeTest({ [TIPO_SOPORTE_ID]: ["LECTURA", "ALTAS"] }),
      });

      await abrirDialog();
      await screen.findByLabelText("Tipo");

      expect(screen.queryByText(/no tiene permiso de alta/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /crear$/i })).toBeEnabled();
    });

    it("si el catálogo falla, lo informa y deshabilita Crear, sin culpar al permiso", async () => {
      server.use(
        http.get("/api/catalogos/tipos-ticket", () =>
          HttpResponse.json({ statusCode: 500, message: "Error" }, { status: 500 }),
        ),
      );
      renderConPermisos(<CompraCreateDialog />, {
        user: tecnico,
        permisos: permisosDeTest({ [TIPO_SOPORTE_ID]: ["LECTURA", "ALTAS"] }),
      });

      await abrirDialog();

      expect(await screen.findByText(/no se pudieron cargar los tipos de ticket/i)).toBeInTheDocument();
      expect(screen.queryByText(/no tiene permiso de alta/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /crear$/i })).toBeDisabled();
    });

    it("ADMINISTRADOR, sin restricción por tipo, ve todos los tipos activos", async () => {
      renderWithProviders(<CompraCreateDialog />, { user: buildUser({ permisos: ["COMPRAS:ALTAS"] }) });

      await abrirDialog();

      await screen.findByRole("option", { name: "Soporte" });
      expect(screen.getByRole("option", { name: "Edilicia" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Mantenimiento" })).toBeInTheDocument();
    });

    it("un 403 del backend (sin ALTAS sobre el tipo) muestra su mensaje y no cierra el diálogo", async () => {
      const MENSAJE_BACKEND = "No tiene permiso para crear compras del tipo Soporte.";
      server.use(
        http.post("/api/compras", () =>
          HttpResponse.json({ statusCode: 403, message: MENSAJE_BACKEND }, { status: 403 }),
        ),
      );
      renderConPermisos(<CompraCreateDialog />, {
        user: tecnico,
        permisos: permisosDeTest({ [TIPO_SOPORTE_ID]: ["LECTURA", "ALTAS"] }),
      });

      const user = await abrirDialog();
      await completarCabecera(user);
      await screen.findByRole("option", { name: "Soporte" });
      await user.selectOptions(screen.getByLabelText("Tipo"), TIPO_SOPORTE_ID);
      await user.click(screen.getByRole("button", { name: /crear$/i }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
      expect(screen.getByLabelText(/motivo/i)).toBeInTheDocument();
      expect(pushMock).not.toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ItemCreateDialog } from "./item-create-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const COMPRA_ID = "compra-1";

async function abrirDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /agregar ítem/i }));
  return user;
}

const compraDetalleFixture = {
  id: COMPRA_ID,
  numero: "COM-2026-00001",
  fechaSolicitud: "2026-01-01",
  motivo: "Insumos",
  descripcion: null,
  solicitanteId: "u1",
  cicloId: "ciclo-1",
  estado: "PENDIENTE",
  comprado: false,
  cerrado: false,
  totalesPorMoneda: {},
  canceladaEn: null,
  canceladoPorId: null,
  motivoCancelacion: null,
  items: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("ItemCreateDialog", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it("al abrir muestra los campos de alta de ítem", async () => {
    renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
      user: buildUser({ permisos: ["COMPRAS:ALTAS"] }),
    });

    await abrirDialog();

    expect(await screen.findByLabelText(/descripción/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cantidad/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/proveedor/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/monto/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/moneda/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fecha de cotización/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/observaciones/i)).toBeInTheDocument();
  });

  it("valida cantidad > 0 y monto >= 0 antes de pegarle a la API (feedback inmediato)", async () => {
    renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
      user: buildUser({ permisos: ["COMPRAS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/descripción/i), "Insumo");
    await user.clear(screen.getByLabelText(/cantidad/i));
    await user.type(screen.getByLabelText(/cantidad/i), "0");
    await user.type(screen.getByLabelText(/proveedor/i), "ACME");
    await user.selectOptions(screen.getByLabelText(/moneda/i), "ARS");
    await user.type(screen.getByLabelText(/fecha de cotización/i), "2026-01-01");
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    expect(await screen.findByText(/la cantidad debe ser mayor a 0/i)).toBeInTheDocument();
  });

  it("envía el POST con el payload correcto y cierra al tener éxito", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(compraDetalleFixture, { status: 201 });
      }),
    );

    renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
      user: buildUser({ permisos: ["COMPRAS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/descripción/i), "Insumo");
    await user.clear(screen.getByLabelText(/cantidad/i));
    await user.type(screen.getByLabelText(/cantidad/i), "3");
    await user.type(screen.getByLabelText(/proveedor/i), "ACME");
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "150.5");
    await user.selectOptions(screen.getByLabelText(/moneda/i), "USD");
    await user.type(screen.getByLabelText(/fecha de cotización/i), "2026-01-01");
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    await waitFor(() => expect(capturedBody.descripcion).toBe("Insumo"));
    expect(capturedBody.cantidad).toBe(3);
    expect(capturedBody.proveedor).toBe("ACME");
    expect(capturedBody.monto).toBe(150.5);
    expect(capturedBody.moneda).toBe("USD");
    expect(capturedBody.fechaCotizacion).toBe("2026-01-01");

    await waitFor(() => expect(screen.queryByLabelText(/descripción/i)).not.toBeInTheDocument());
  });

  /**
   * El monto se MUESTRA formateado al salir del campo (`1.234.567,89`) pero
   * lo que viaja tiene que seguir siendo el número crudo: el schema usa
   * `z.coerce.number()` y la cadena formateada se convertiría en `NaN`,
   * perdiendo la carga del usuario.
   */
  describe("monto formateado al salir del campo", () => {
    it("tras el blur el payload lleva el número CRUDO, no la cadena formateada", async () => {
      let capturedBody: Record<string, unknown> = {};
      server.use(
        http.post(`/api/compras/${COMPRA_ID}/items`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(compraDetalleFixture, { status: 201 });
        }),
      );

      renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
        user: buildUser({ permisos: ["COMPRAS:ALTAS"] }),
      });

      const user = await abrirDialog();
      await user.type(screen.getByLabelText(/descripción/i), "Insumo");
      await user.clear(screen.getByLabelText(/cantidad/i));
      await user.type(screen.getByLabelText(/cantidad/i), "1");
      await user.type(screen.getByLabelText(/proveedor/i), "ACME");
      const monto = screen.getByLabelText(/monto/i);
      await user.clear(monto);
      await user.type(monto, "1234567.89");
      await user.tab();

      expect(monto).toHaveValue("1.234.567,89");

      await user.selectOptions(screen.getByLabelText(/moneda/i), "ARS");
      await user.type(screen.getByLabelText(/fecha de cotización/i), "2026-01-01");
      await user.click(screen.getByRole("button", { name: /agregar$/i }));

      await waitFor(() => expect(capturedBody.monto).toBe(1234567.89));
    });

    it("volver a enfocar devuelve el valor editable, sin puntos de miles que borrar a mano", async () => {
      renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
        user: buildUser({ permisos: ["COMPRAS:ALTAS"] }),
      });

      const user = await abrirDialog();
      const monto = screen.getByLabelText(/monto/i);
      await user.clear(monto);
      await user.type(monto, "1234567.89");
      await user.tab();
      await user.click(monto);

      expect(monto).toHaveValue("1234567.89");
    });

    it("blur con el campo vacío deja el campo vacío, sin NaN ni un 0 fantasma", async () => {
      renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
        user: buildUser({ permisos: ["COMPRAS:ALTAS"] }),
      });

      const user = await abrirDialog();
      const monto = screen.getByLabelText(/monto/i);
      await user.clear(monto);
      await user.tab();

      expect(monto).toHaveValue("");
    });

    it("cero fantasma (R2/R3): tipear un monto y borrarlo antes de enviar NO pega a la API y muestra el error de requerido", async () => {
      let pegoALaApi = false;
      server.use(
        http.post(`/api/compras/${COMPRA_ID}/items`, () => {
          pegoALaApi = true;
          return HttpResponse.json(compraDetalleFixture, { status: 201 });
        }),
      );

      renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
        user: buildUser({ permisos: ["COMPRAS:ALTAS"] }),
      });

      const user = await abrirDialog();
      await user.type(screen.getByLabelText(/descripción/i), "Insumo");
      await user.clear(screen.getByLabelText(/cantidad/i));
      await user.type(screen.getByLabelText(/cantidad/i), "1");
      await user.type(screen.getByLabelText(/proveedor/i), "ACME");
      const monto = screen.getByLabelText(/monto/i);
      await user.clear(monto);
      await user.type(monto, "1500.50");
      await user.clear(monto);
      await user.selectOptions(screen.getByLabelText(/moneda/i), "ARS");
      await user.type(screen.getByLabelText(/fecha de cotización/i), "2026-01-01");
      await user.click(screen.getByRole("button", { name: /agregar$/i }));

      expect(await screen.findByText(/el monto es requerido/i)).toBeInTheDocument();
      await new Promise((r) => setTimeout(r, 50));
      expect(pegoALaApi).toBe(false);
    });

    /**
     * `MontoInput` deja el texto crudo en el form hasta el blur, y `Enter`
     * dentro de un `<form>` dispara el submit sin pasar por ahí: el resolver
     * tiene que aceptar el formato es-AR (`"1.000,50"`) igual que lo hace tras
     * el blur. `toHaveFocus()` es la guarda: si algún día se introduce un
     * blur antes del submit, este test dejaría de probar lo que dice.
     *
     * El POST se difiere con una promesa manual: si se resolviera de entrada,
     * el cierre del diálogo en `onSuccess` movería el foco dentro del mismo
     * `await user.keyboard("{Enter}")`, antes de poder comprobarlo.
     */
    it("Enter sin blur con monto en formato es-AR envía el número correcto", async () => {
      let resolverRespuesta: () => void = () => {};
      const respuestaPendiente = new Promise<void>((resolve) => {
        resolverRespuesta = resolve;
      });
      let capturedBody: Record<string, unknown> = {};
      server.use(
        http.post(`/api/compras/${COMPRA_ID}/items`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          await respuestaPendiente;
          return HttpResponse.json(compraDetalleFixture, { status: 201 });
        }),
      );

      renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
        user: buildUser({ permisos: ["COMPRAS:ALTAS"] }),
      });

      const user = await abrirDialog();
      await user.type(screen.getByLabelText(/descripción/i), "Insumo");
      await user.clear(screen.getByLabelText(/cantidad/i));
      await user.type(screen.getByLabelText(/cantidad/i), "1");
      await user.type(screen.getByLabelText(/proveedor/i), "ACME");
      await user.selectOptions(screen.getByLabelText(/moneda/i), "ARS");
      await user.type(screen.getByLabelText(/fecha de cotización/i), "2026-01-01");
      const monto = screen.getByLabelText(/monto/i);
      await user.click(monto);
      await user.paste("1.234.567,89");
      await user.keyboard("{Enter}");

      expect(monto).toHaveFocus();
      resolverRespuesta();
      await waitFor(() => expect(capturedBody.monto).toBe(1234567.89));
    });

    /** Hermano invertido: un valor inválido sigue bloqueando el envío por Enter sin blur. */
    it("Enter sin blur con monto inválido sigue bloqueando el envío", async () => {
      let pegoALaApi = false;
      server.use(
        http.post(`/api/compras/${COMPRA_ID}/items`, () => {
          pegoALaApi = true;
          return HttpResponse.json(compraDetalleFixture, { status: 201 });
        }),
      );

      renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
        user: buildUser({ permisos: ["COMPRAS:ALTAS"] }),
      });

      const user = await abrirDialog();
      await user.type(screen.getByLabelText(/descripción/i), "Insumo");
      await user.clear(screen.getByLabelText(/cantidad/i));
      await user.type(screen.getByLabelText(/cantidad/i), "1");
      await user.type(screen.getByLabelText(/proveedor/i), "ACME");
      await user.selectOptions(screen.getByLabelText(/moneda/i), "ARS");
      await user.type(screen.getByLabelText(/fecha de cotización/i), "2026-01-01");
      const monto = screen.getByLabelText(/monto/i);
      await user.click(monto);
      await user.paste("abc");
      await user.keyboard("{Enter}");

      expect(await screen.findByText(/ingresá un monto válido/i)).toBeInTheDocument();
      await new Promise((r) => setTimeout(r, 50));
      expect(pegoALaApi).toBe(false);
    });

    it("hermano invertido: reemplazar el monto por 2000 sí envía el request", async () => {
      let capturedBody: Record<string, unknown> = {};
      server.use(
        http.post(`/api/compras/${COMPRA_ID}/items`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(compraDetalleFixture, { status: 201 });
        }),
      );

      renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
        user: buildUser({ permisos: ["COMPRAS:ALTAS"] }),
      });

      const user = await abrirDialog();
      await user.type(screen.getByLabelText(/descripción/i), "Insumo");
      await user.clear(screen.getByLabelText(/cantidad/i));
      await user.type(screen.getByLabelText(/cantidad/i), "1");
      await user.type(screen.getByLabelText(/proveedor/i), "ACME");
      const monto = screen.getByLabelText(/monto/i);
      await user.clear(monto);
      await user.type(monto, "2000");
      await user.selectOptions(screen.getByLabelText(/moneda/i), "ARS");
      await user.type(screen.getByLabelText(/fecha de cotización/i), "2026-01-01");
      await user.click(screen.getByRole("button", { name: /agregar$/i }));

      await waitFor(() => expect(capturedBody.monto).toBe(2000));
    });
  });

  it("muestra el error de dominio del backend (422) al usuario, sin cerrar el dialog", async () => {
    const MENSAJE_BACKEND = "La compra está cancelada.";
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
      user: buildUser({ permisos: ["COMPRAS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/descripción/i), "Insumo");
    await user.clear(screen.getByLabelText(/cantidad/i));
    await user.type(screen.getByLabelText(/cantidad/i), "1");
    await user.type(screen.getByLabelText(/proveedor/i), "ACME");
    await user.selectOptions(screen.getByLabelText(/moneda/i), "ARS");
    await user.type(screen.getByLabelText(/fecha de cotización/i), "2026-01-01");
    await user.click(screen.getByRole("button", { name: /agregar$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
    expect(screen.getByLabelText(/descripción/i)).toBeInTheDocument();
  });

  /**
   * El insumo del ítem (insumos-entrega-3). `GET /insumos` es lectura abierta
   * para cualquier autenticado del inquilino y devuelve los insumos vigentes,
   * habilitados y deshabilitados.
   */
  describe("insumo del ítem", () => {
    const CATALOGO = [
      {
        id: "ins-1",
        codigo: "TON-001",
        nombre: "Tóner negro",
        familiaId: "fam-1",
        unidadMedidaId: "um-1",
        stockMinimo: null,
        activo: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "ins-2",
        codigo: "PAP-002",
        nombre: "Papel A4",
        familiaId: "fam-1",
        unidadMedidaId: "um-1",
        stockMinimo: null,
        activo: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    function mockCatalogo() {
      server.use(http.get("/api/insumos", () => HttpResponse.json(CATALOGO)));
    }

    function capturarPost(): { body: Record<string, unknown> } {
      const capturado: { body: Record<string, unknown> } = { body: {} };
      server.use(
        http.post(`/api/compras/${COMPRA_ID}/items`, async ({ request }) => {
          capturado.body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(compraDetalleFixture, { status: 201 });
        }),
      );
      return capturado;
    }

    async function completarCamposObligatorios(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByLabelText(/descripción/i), "Insumo");
      await user.clear(screen.getByLabelText(/cantidad/i));
      await user.type(screen.getByLabelText(/cantidad/i), "1");
      await user.type(screen.getByLabelText(/proveedor/i), "ACME");
      await user.clear(screen.getByLabelText(/monto/i));
      await user.type(screen.getByLabelText(/monto/i), "100");
      await user.selectOptions(screen.getByLabelText(/moneda/i), "ARS");
      await user.type(screen.getByLabelText(/fecha de cotización/i), "2026-01-01");
    }

    it("ofrece los insumos del catálogo por código y nombre, con «Sin insumo» como opción vacía", async () => {
      mockCatalogo();
      renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
        user: buildUser({ permisos: ["COMPRAS:ALTAS"] }),
      });

      await abrirDialog();

      const select = await screen.findByLabelText(/insumo \(opcional\)/i);
      await waitFor(() => expect(screen.getByRole("option", { name: /TON-001 — Tóner negro/ })).toBeInTheDocument());
      expect(screen.getByRole("option", { name: "Sin insumo" })).toBeInTheDocument();
      expect(select).toHaveValue("");
    });

    /**
     * El catálogo trae los deshabilitados y el backend los acepta en el alta
     * (`validarInsumoElegible` sin `exigirHabilitado`). El fixture incluye a
     * `ins-2` deshabilitado justamente para que este assert pueda fallar.
     */
    it("el insumo deshabilitado aparece marcado y sigue siendo elegible", async () => {
      mockCatalogo();
      const capturado = capturarPost();
      renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
        user: buildUser({ permisos: ["COMPRAS:ALTAS"] }),
      });

      const user = await abrirDialog();
      await screen.findByRole("option", { name: /PAP-002 — Papel A4 \(deshabilitado\)/ });
      await completarCamposObligatorios(user);
      await user.selectOptions(screen.getByLabelText(/insumo \(opcional\)/i), "ins-2");
      await user.click(screen.getByRole("button", { name: /agregar$/i }));

      await waitFor(() => expect(capturado.body.insumoId).toBe("ins-2"));
    });

    it("el insumo elegido viaja en el POST", async () => {
      mockCatalogo();
      const capturado = capturarPost();
      renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
        user: buildUser({ permisos: ["COMPRAS:ALTAS"] }),
      });

      const user = await abrirDialog();
      await screen.findByRole("option", { name: /TON-001 — Tóner negro/ });
      await completarCamposObligatorios(user);
      await user.selectOptions(screen.getByLabelText(/insumo \(opcional\)/i), "ins-1");
      await user.click(screen.getByRole("button", { name: /agregar$/i }));

      await waitFor(() => expect(capturado.body.insumoId).toBe("ins-1"));
    });

    /**
     * Hermano invertido del anterior, y assert de ausencia sobre un catálogo
     * CARGADO: las dos opciones existían y no se eligió ninguna.
     */
    it("dejarlo en «Sin insumo» no manda ningún insumoId", async () => {
      mockCatalogo();
      const capturado = capturarPost();
      renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
        user: buildUser({ permisos: ["COMPRAS:ALTAS"] }),
      });

      const user = await abrirDialog();
      await screen.findByRole("option", { name: /TON-001 — Tóner negro/ });
      await completarCamposObligatorios(user);
      await user.click(screen.getByRole("button", { name: /agregar$/i }));

      await waitFor(() => expect(capturado.body.descripcion).toBe("Insumo"));
      expect(Object.keys(capturado.body)).not.toContain("insumoId");
    });

    it("cerrar el diálogo con un insumo elegido y reabrirlo vuelve a «Sin insumo»", async () => {
      mockCatalogo();
      renderWithProviders(<ItemCreateDialog compraId={COMPRA_ID} />, {
        user: buildUser({ permisos: ["COMPRAS:ALTAS"] }),
      });

      const user = await abrirDialog();
      await screen.findByRole("option", { name: /TON-001 — Tóner negro/ });
      await user.selectOptions(screen.getByLabelText(/insumo \(opcional\)/i), "ins-1");
      expect(screen.getByLabelText(/insumo \(opcional\)/i)).toHaveValue("ins-1");

      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByLabelText(/insumo \(opcional\)/i)).not.toBeInTheDocument());
      await user.click(screen.getByRole("button", { name: /agregar ítem/i }));

      expect(await screen.findByLabelText(/insumo \(opcional\)/i)).toHaveValue("");
    });
  });
});

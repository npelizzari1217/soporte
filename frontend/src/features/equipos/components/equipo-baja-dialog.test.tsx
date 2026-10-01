import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { EquipoBajaDialog } from "./equipo-baja-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const EQUIPO_ID = "55555555-5555-4555-8555-555555555555";
const RUTA_RESUMEN = `/api/equipos/${EQUIPO_ID}/baja/resumen`;
const RUTA_BAJA = `/api/equipos/${EQUIPO_ID}/baja`;
const INSUMO = "11111111-1111-4111-8111-111111111111";

function pieza(n: number, extra: Record<string, unknown> = {}) {
  return {
    componenteId: `comp-${n}`,
    descripcion: `Pieza ${n}`,
    insumoId: INSUMO,
    insumoNombre: "Insumo",
    unidadId: null,
    numeroSerie: null,
    seguimiento: "NINGUNO",
    requiereSerial: false,
    serialSugerido: null,
    causaQueImpideDevolver: null,
    ...extra,
  };
}

function resumen(piezas: unknown[] = [pieza(1), pieza(2), pieza(3), pieza(4)], extra: Record<string, unknown> = {}) {
  return {
    equipoId: EQUIPO_ID,
    nombre: "PC-1",
    ticketsAbiertos: 1,
    largoMaximoTexto: { VEJEZ: 460, DONACION: 455, ROTURA: 458, OTRA: 480 },
    piezas,
    ...extra,
  };
}

function montar(datos: JsonBodyType = resumen()) {
  let pedidos = 0;
  server.use(
    http.get(RUTA_RESUMEN, () => {
      pedidos += 1;
      return HttpResponse.json(datos);
    }),
  );
  renderWithProviders(<EquipoBajaDialog equipoId={EQUIPO_ID} />, { user: buildUser({ permisos: ["EQUIPOS:BORRADO"] }) });
  return { pedidos: () => pedidos };
}

function capturar(respuesta?: () => Response) {
  const cuerpos: unknown[] = [];
  server.use(
    http.post(RUTA_BAJA, async ({ request }) => {
      cuerpos.push(await request.json());
      return respuesta ? respuesta() : HttpResponse.json({ id: EQUIPO_ID, activo: false });
    }),
  );
  return cuerpos;
}

async function abrir(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Dar de baja" }));
  await screen.findByRole("button", { name: "Confirmar baja" });
}

const confirmar = () => screen.getByRole("button", { name: "Confirmar baja" });

describe("EquipoBajaDialog", () => {
  it("el resumen muestra 4 piezas, el destino «devolver al stock» y 1 ticket abierto", async () => {
    const user = userEvent.setup();
    montar();
    await abrir(user);

    expect(screen.getByText("El equipo tiene 4 piezas activas.")).toBeInTheDocument();
    expect(screen.getAllByText(/Vuelve al stock como usada/)).toHaveLength(4);
    expect(screen.getByLabelText(/Devolver todas las piezas al stock/)).toBeChecked();
    expect(screen.getByText(/El equipo tiene 1 ticket abierto; va a seguir abierto y apuntando a este equipo\./)).toBeInTheDocument();
  });

  it("STOCK_USADO confirma con un solo botón y envía destino y categoría", async () => {
    const user = userEvent.setup();
    montar();
    const cuerpos = capturar();
    await abrir(user);

    await user.click(confirmar());

    await waitFor(() => expect(cuerpos).toEqual([{ destino: "STOCK_USADO", categoria: "VEJEZ" }]));
  });

  it("con DESCARTE el botón sigue deshabilitado con «PC-2» y se habilita con «PC-1», también con espacios", async () => {
    const user = userEvent.setup();
    montar();
    const cuerpos = capturar();
    await abrir(user);

    await user.click(screen.getByLabelText(/Descartar todas las piezas/));
    expect(confirmar()).toBeDisabled();
    await user.type(screen.getByLabelText("Escribí el nombre del equipo para confirmar"), "PC-2");
    expect(confirmar()).toBeDisabled();
    await user.clear(screen.getByLabelText("Escribí el nombre del equipo para confirmar"));
    await user.type(screen.getByLabelText("Escribí el nombre del equipo para confirmar"), "  PC-1 ");
    expect(confirmar()).toBeEnabled();

    await user.click(confirmar());
    await waitFor(() => expect(cuerpos).toEqual([{ destino: "DESCARTE", categoria: "VEJEZ" }]));
  });

  it("el serial del legado SERIE se precarga desde serialSugerido y viaja en seriales", async () => {
    const user = userEvent.setup();
    montar(resumen([pieza(1, { seguimiento: "SERIE", requiereSerial: true, serialSugerido: "SN-77" })]));
    const cuerpos = capturar();
    await abrir(user);

    expect(screen.getByLabelText("Número de serie de Pieza 1")).toHaveValue("SN-77");
    await user.click(confirmar());

    await waitFor(() =>
      expect(cuerpos).toEqual([
        { destino: "STOCK_USADO", categoria: "VEJEZ", seriales: [{ componenteId: "comp-1", numeroSerie: "SN-77" }] },
      ]),
    );
  });

  it("una pieza que impide devolver se lista y deshabilita el botón; con DESCARTE ya no bloquea", async () => {
    const user = userEvent.setup();
    montar(resumen([pieza(1, { causaQueImpideDevolver: "INSUMO_BORRADO" })]));
    await abrir(user);

    expect(screen.getByText(/Pieza 1: el repuesto fue eliminado del catálogo/)).toBeInTheDocument();
    expect(confirmar()).toBeDisabled();

    await user.click(screen.getByLabelText(/Descartar todas las piezas/));
    expect(screen.queryByText(/Pieza 1: el repuesto fue eliminado/)).not.toBeInTheDocument();
  });

  it("el contador sigue el tope de cada categoría y «Otra» exige texto", async () => {
    const user = userEvent.setup();
    montar();
    await abrir(user);

    expect(screen.getByTestId("contador-motivo")).toHaveTextContent("0 / 460");
    await user.selectOptions(screen.getByLabelText("Categoría"), "DONACION");
    expect(screen.getByTestId("contador-motivo")).toHaveTextContent("0 / 455");

    await user.selectOptions(screen.getByLabelText("Categoría"), "OTRA");
    expect(screen.getByText("Motivo (obligatorio)")).toBeInTheDocument();
    expect(confirmar()).toBeDisabled();
    await user.type(screen.getByLabelText("Motivo (obligatorio)"), "Se rompió");
    expect(screen.getByTestId("contador-motivo")).toHaveTextContent("9 / 480");
    expect(confirmar()).toBeEnabled();
  });

  it("el 422 de piezas lista cada pieza con su causa", async () => {
    const user = userEvent.setup();
    montar();
    capturar(() =>
      HttpResponse.json(
        {
          statusCode: 422,
          message: "Piezas problemáticas",
          code: "BAJA_EQUIPO_PIEZAS_PROBLEMATICAS",
          piezas: [
            { componenteId: "comp-2", insumoId: INSUMO, causa: "INSUMO_BORRADO" },
            { componenteId: "comp-3", insumoId: INSUMO, causa: "SERIAL_DUPLICADO" },
          ],
        },
        { status: 422 },
      ),
    );
    await abrir(user);
    await user.click(confirmar());

    const alerta = (await screen.findByText(/estas piezas no pueden volver al stock\./)).closest("div") as HTMLElement;
    expect(within(alerta).getByText(/Pieza 2: el repuesto fue eliminado del catálogo/)).toBeInTheDocument();
    expect(within(alerta).getByText(/Pieza 3: ese número de serie ya existe en el stock/)).toBeInTheDocument();
  });

  it("el 422 del motivo muestra el largo máximo", async () => {
    const user = userEvent.setup();
    montar();
    capturar(() =>
      HttpResponse.json(
        { statusCode: 422, message: "x", code: "MOTIVO_BAJA_EQUIPO_INVALIDO", largoMaximo: 400 },
        { status: 422 },
      ),
    );
    await abrir(user);
    await user.click(confirmar());

    expect(await screen.findByText(/admite hasta 400 caracteres/)).toBeInTheDocument();
  });

  it("el 409 avisa que se reintente y refresca el resumen sin reintentar la baja", async () => {
    const user = userEvent.setup();
    const resumenPedidos = montar();
    const cuerpos = capturar(() =>
      HttpResponse.json({ statusCode: 409, message: "cambió", error: "Conflict" }, { status: 409 }),
    );
    await abrir(user);
    expect(resumenPedidos.pedidos()).toBe(1);

    await user.click(confirmar());

    expect(await screen.findByText(/El equipo cambió mientras confirmabas la baja/)).toBeInTheDocument();
    await waitFor(() => expect(resumenPedidos.pedidos()).toBe(2));
    expect(cuerpos).toHaveLength(1);
  });

  it("el 422 de equipo ya dado de baja muestra el mensaje del backend", async () => {
    const user = userEvent.setup();
    montar();
    capturar(() =>
      HttpResponse.json(
        { statusCode: 422, message: "El equipo ya fue dado de baja.", error: "Unprocessable Entity" },
        { status: 422 },
      ),
    );
    await abrir(user);
    await user.click(confirmar());

    expect(await screen.findByText("El equipo ya fue dado de baja.")).toBeInTheDocument();
  });
});

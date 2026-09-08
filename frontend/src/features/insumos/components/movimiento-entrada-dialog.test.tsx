import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, type PathParams } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { MovimientoEntradaDialog } from "./movimiento-entrada-dialog";
import type { RegistrarEntradaInsumoDto } from "../hooks/use-insumo-mutations";
import type { Equipo } from "@/features/equipos/types";
import type { Sector } from "@/features/sectores/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const INSUMO_ID = "11111111-1111-1111-1111-111111111111";

const MOVIMIENTO_CREADO = {
  id: "mov-1",
  insumoId: INSUMO_ID,
  tipo: "ENTRADA",
  cantidad: 10,
  usuarioId: "u1",
  motivo: null,
  equipoId: null,
  sectorId: null,
  itemCompraId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const EQUIPO_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const SECTOR_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

const EQUIPOS: Pick<Equipo, "id" | "nombre" | "numeroSerie">[] = [
  { id: EQUIPO_ID, nombre: "Notebook Dell", numeroSerie: null },
];

const SECTORES: Pick<Sector, "id" | "nombre">[] = [{ id: SECTOR_ID, nombre: "Ventas" }];

/**
 * Registra el handler de alta y devuelve el body que efectivamente viajó.
 *
 * El body se tipa con el generic `RequestBodyType` de `http.post` —no con un
 * cast— así `request.json()` devuelve `Promise<Partial<RegistrarEntradaInsumoDto>>`
 * de verdad: `Partial` porque el punto de varios tests es afirmar que un
 * campo opcional NO viajó.
 */
function capturarPost(): { body: Partial<RegistrarEntradaInsumoDto> } {
  const capturado: { body: Partial<RegistrarEntradaInsumoDto> } = { body: {} };
  server.use(
    http.post<PathParams, Partial<RegistrarEntradaInsumoDto>>(
      `/api/insumos/${INSUMO_ID}/movimientos/entrada`,
      async ({ request }) => {
        capturado.body = await request.json();
        return HttpResponse.json(MOVIMIENTO_CREADO, { status: 201 });
      },
    ),
    http.get("/api/equipos", () => HttpResponse.json(EQUIPOS)),
    http.get("/api/sectores", () => HttpResponse.json(SECTORES)),
  );
  return capturado;
}

/** Abre el diálogo y espera a que el form esté montado. */
async function abrirDialog(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /registrar entrada/i }));
  await screen.findByLabelText(/^cantidad$/i);
  return user;
}

describe("MovimientoEntradaDialog", () => {
  it("envía la cantidad ingresada y NADA MÁS cuando motivo/equipo/sector quedan sin tocar", async () => {
    const capturado = capturarPost();
    renderWithProviders(<MovimientoEntradaDialog insumoId={INSUMO_ID} activo />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^cantidad$/i), "10");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(capturado.body.cantidad).toBe(10));
    expect(capturado.body.motivo).toBeUndefined();
    expect(capturado.body.equipoId).toBeUndefined();
    expect(capturado.body.sectorId).toBeUndefined();
  });

  it("envía motivo, equipo y sector cuando se completan", async () => {
    const capturado = capturarPost();
    renderWithProviders(<MovimientoEntradaDialog insumoId={INSUMO_ID} activo />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^cantidad$/i), "10");
    await user.type(screen.getByLabelText(/motivo/i), "Compra directa");
    await user.selectOptions(screen.getByLabelText(/equipo/i), EQUIPO_ID);
    await user.selectOptions(screen.getByLabelText(/sector/i), SECTOR_ID);
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(capturado.body.cantidad).toBe(10));
    expect(capturado.body.motivo).toBe("Compra directa");
    expect(capturado.body.equipoId).toBe(EQUIPO_ID);
    expect(capturado.body.sectorId).toBe(SECTOR_ID);
  });

  /**
   * `GET /equipos` exige `EQUIPOS:LECTURA`, permiso INDEPENDIENTE de
   * `INSUMOS:ALTAS` (no está en `presets-rol.ts`, se otorga por la matriz
   * editable por tenant). Un usuario de depósito con ALTAS y sin
   * EQUIPOS:LECTURA recibe 403 acá, y el select tiene que distinguirlo
   * visiblemente de "no hay equipos cargados" — no degradar en silencio a
   * mostrar solo "Sin equipo". `GET /sectores` no lleva gate y sigue
   * resolviendo normal: el 403 de un catálogo no puede tumbar al otro.
   */
  it("un 403 en GET /equipos (sin EQUIPOS:LECTURA) deshabilita el select y avisa, sin tumbar el de sector", async () => {
    server.use(
      http.get("/api/equipos", () =>
        HttpResponse.json({ statusCode: 403, message: "Prohibido." }, { status: 403 }),
      ),
      http.get("/api/sectores", () => HttpResponse.json(SECTORES)),
    );
    renderWithProviders(<MovimientoEntradaDialog insumoId={INSUMO_ID} activo />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    await abrirDialog();

    const selectEquipo = await screen.findByLabelText(/equipo/i);
    expect(selectEquipo).toBeDisabled();
    expect(screen.getByText(/sin datos de equipos/i)).toBeInTheDocument();
    expect(screen.queryByText(/^sin equipo$/i)).not.toBeInTheDocument();

    // El catálogo de sectores no llevó gate: sigue resolviendo normal.
    const selectSector = screen.getByLabelText(/sector/i);
    expect(selectSector).not.toBeDisabled();
    expect(screen.getByText("Ventas")).toBeInTheDocument();
  });

  /**
   * Clase "vacío que se vuelve valor" del AGENTS.md: dejar el campo cantidad
   * sin tocar tiene que bloquear el submit con un mensaje de requerido, NUNCA
   * enviar `0` en silencio.
   */
  it("sin cantidad → muestra el mensaje de requerido y no envía el POST", async () => {
    const capturado = capturarPost();
    renderWithProviders(<MovimientoEntradaDialog insumoId={INSUMO_ID} activo />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    await abrirDialog();
    await userEvent.setup().click(screen.getByRole("button", { name: /^registrar$/i }));

    expect(await screen.findByText(/la cantidad es requerida/i)).toBeInTheDocument();
    expect(capturado.body).toEqual({});
  });

  it("cantidad cero → rechaza (el piso es exclusivo) y no envía el POST", async () => {
    const capturado = capturarPost();
    renderWithProviders(<MovimientoEntradaDialog insumoId={INSUMO_ID} activo />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^cantidad$/i), "0");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    expect(await screen.findByText(/la cantidad debe ser mayor a 0/i)).toBeInTheDocument();
    expect(capturado.body).toEqual({});
  });

  it("al registrar con éxito, cierra el diálogo y limpia el formulario", async () => {
    capturarPost();
    renderWithProviders(<MovimientoEntradaDialog insumoId={INSUMO_ID} activo />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^cantidad$/i), "10");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(screen.queryByLabelText(/^cantidad$/i)).not.toBeInTheDocument());

    // Reabrir: el formulario arranca vacío, no con el "10" de la carga anterior.
    await user.click(screen.getByRole("button", { name: /registrar entrada/i }));
    expect(await screen.findByLabelText(/^cantidad$/i)).toHaveValue(null);
  });

  /**
   * Backstop de la CARRERA, no del camino normal: el trigger ya refleja
   * `activo` (ver `insumo-detail-view.test.tsx`, "insumo deshabilitado → el
   * botón «Registrar entrada» aparece deshabilitado"), así que este 422 solo
   * puede llegar si alguien deshabilitó el insumo DESPUÉS de que el diálogo
   * ya estaba abierto con `activo` todavía en `true` — el snapshot con el que
   * se montó no se re-evalúa mientras el diálogo sigue abierto.
   */
  it("un 422 (insumo deshabilitado) durante la carrera se muestra vía toast y el diálogo NO se cierra", async () => {
    const MENSAJE_BACKEND = "El insumo está deshabilitado.";
    server.use(
      http.post(`/api/insumos/${INSUMO_ID}/movimientos/entrada`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
      http.get("/api/equipos", () => HttpResponse.json(EQUIPOS)),
      http.get("/api/sectores", () => HttpResponse.json(SECTORES)),
    );
    renderWithProviders(<MovimientoEntradaDialog insumoId={INSUMO_ID} activo />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^cantidad$/i), "10");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
    expect(screen.getByLabelText(/^cantidad$/i)).toBeInTheDocument();
  });

  /**
   * `useEquipos`/`useSectores` corren con `enabled: open`: si se pidieran ya
   * con la ficha montada, un usuario de depósito sin `EQUIPOS:LECTURA` se
   * comería un 403 en CADA ficha de insumo, no solo la vez que abre el
   * diálogo (mismo criterio que `SubtareasDialog`, `features/edilicia`).
   */
  it("los catálogos de equipos y sectores NO se piden hasta que el diálogo se abre", async () => {
    const pedidos: string[] = [];
    server.use(
      http.get("/api/equipos", () => {
        pedidos.push("equipos");
        return HttpResponse.json(EQUIPOS);
      }),
      http.get("/api/sectores", () => {
        pedidos.push("sectores");
        return HttpResponse.json(SECTORES);
      }),
    );
    renderWithProviders(<MovimientoEntradaDialog insumoId={INSUMO_ID} activo />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    // El trigger ya está montado, el diálogo no: `enabled: false` es
    // determinístico, así que no hace falta esperar nada acá.
    expect(pedidos).toEqual([]);

    await abrirDialog();

    await waitFor(() => expect(pedidos).toEqual(expect.arrayContaining(["equipos", "sectores"])));
  });
});

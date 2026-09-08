import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, type PathParams } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { MovimientoSalidaDialog } from "./movimiento-salida-dialog";
import type { RegistrarMovimientoInsumoDto } from "../hooks/use-insumo-mutations";
import type { Equipo } from "@/features/equipos/types";
import type { Sector } from "@/features/sectores/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const INSUMO_ID = "11111111-1111-1111-1111-111111111111";

const MOVIMIENTO_CREADO = {
  id: "mov-1",
  insumoId: INSUMO_ID,
  tipo: "SALIDA",
  cantidad: 3,
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
 * Registra el handler de baja y devuelve el body que efectivamente viajó.
 * Mismo mecanismo que `movimiento-entrada-dialog.test.tsx`: el generic de
 * `http.post` tipa `request.json()` sin cast.
 */
function capturarPost(): { body: Partial<RegistrarMovimientoInsumoDto> } {
  const capturado: { body: Partial<RegistrarMovimientoInsumoDto> } = { body: {} };
  server.use(
    http.post<PathParams, Partial<RegistrarMovimientoInsumoDto>>(
      `/api/insumos/${INSUMO_ID}/movimientos/salida`,
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
  await user.click(screen.getByRole("button", { name: /registrar salida/i }));
  await screen.findByLabelText(/^cantidad$/i);
  return user;
}

describe("MovimientoSalidaDialog", () => {
  it("envía la cantidad ingresada y NADA MÁS cuando motivo/equipo/sector quedan sin tocar", async () => {
    const capturado = capturarPost();
    renderWithProviders(<MovimientoSalidaDialog insumoId={INSUMO_ID} stockDisponible={10} />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^cantidad$/i), "3");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(capturado.body.cantidad).toBe(3));
    expect(capturado.body.motivo).toBeUndefined();
    expect(capturado.body.equipoId).toBeUndefined();
    expect(capturado.body.sectorId).toBeUndefined();
  });

  it("envía motivo, equipo y sector cuando se completan", async () => {
    const capturado = capturarPost();
    renderWithProviders(<MovimientoSalidaDialog insumoId={INSUMO_ID} stockDisponible={10} />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^cantidad$/i), "3");
    await user.type(screen.getByLabelText(/motivo/i), "Entregado a taller");
    await user.selectOptions(screen.getByLabelText(/equipo/i), EQUIPO_ID);
    await user.selectOptions(screen.getByLabelText(/sector/i), SECTOR_ID);
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(capturado.body.cantidad).toBe(3));
    expect(capturado.body.motivo).toBe("Entregado a taller");
    expect(capturado.body.equipoId).toBe(EQUIPO_ID);
    expect(capturado.body.sectorId).toBe(SECTOR_ID);
  });

  /**
   * `GET /equipos` exige `EQUIPOS:LECTURA`, permiso INDEPENDIENTE de
   * `INSUMOS:ALTAS` (mismo criterio que `movimiento-entrada-dialog.test.tsx`,
   * "un 403 en GET /equipos..."). Este caso quedaba SIN cubrir en la salida:
   * el componente ya implementa el camino (select deshabilitado, con el copy
   * propio de la salida —"la salida se puede registrar igual"— en vez del de
   * la entrada), pero nada lo ejercía.
   */
  it("un 403 en GET /equipos (sin EQUIPOS:LECTURA) deshabilita el select y avisa, sin tumbar el de sector", async () => {
    server.use(
      http.get("/api/equipos", () =>
        HttpResponse.json({ statusCode: 403, message: "Prohibido." }, { status: 403 }),
      ),
      http.get("/api/sectores", () => HttpResponse.json(SECTORES)),
    );
    renderWithProviders(<MovimientoSalidaDialog insumoId={INSUMO_ID} stockDisponible={10} />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    await abrirDialog();

    const selectEquipo = await screen.findByLabelText(/equipo/i);
    expect(selectEquipo).toBeDisabled();
    expect(screen.getByText(/sin datos de equipos/i)).toBeInTheDocument();
    expect(screen.getByText(/la salida se puede registrar igual/i)).toBeInTheDocument();
    expect(screen.queryByText(/^sin equipo$/i)).not.toBeInTheDocument();

    // El catálogo de sectores no llevó gate: sigue resolviendo normal.
    const selectSector = screen.getByLabelText(/sector/i);
    expect(selectSector).not.toBeDisabled();
    expect(screen.getByText("Ventas")).toBeInTheDocument();
  });

  /**
   * La TRAMPA de esta unidad: la salida NO exige el insumo habilitado (a
   * diferencia de la entrada) — su precondición de estado es el STOCK. Con
   * `0` no hay nada que sacar, así que el trigger se deshabilita con un
   * `title` que lo explica, mismo mecanismo `disabled` + `title` que
   * `ItemEliminarControl` (`features/compras`).
   */
  it("con stockDisponible en 0, el botón «Registrar salida» aparece deshabilitado con un title explicando por qué", () => {
    renderWithProviders(<MovimientoSalidaDialog insumoId={INSUMO_ID} stockDisponible={0} />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    const boton = screen.getByRole("button", { name: /registrar salida/i });
    expect(boton).toBeDisabled();
    expect(boton.getAttribute("title")).toMatch(/existencia/i);
  });

  it("con stockDisponible positivo, el botón «Registrar salida» está habilitado", () => {
    renderWithProviders(<MovimientoSalidaDialog insumoId={INSUMO_ID} stockDisponible={5} />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    expect(screen.getByRole("button", { name: /registrar salida/i })).not.toBeDisabled();
  });

  /**
   * `stockDisponible: undefined` cubre "la consulta de stock todavía está en
   * vuelo o falló" (`useStockInsumo`, ver `insumo-detail-view.tsx`). NO se
   * asume `0` en ese caso: tratarlo como `0` deshabilitaría el botón para
   * cualquiera que abra la ficha antes de que el stock termine de resolver.
   */
  it("con stockDisponible undefined (stock aún no resuelto), el botón NO se deshabilita por eso", () => {
    renderWithProviders(<MovimientoSalidaDialog insumoId={INSUMO_ID} stockDisponible={undefined} />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    expect(screen.getByRole("button", { name: /registrar salida/i })).not.toBeDisabled();
  });

  /**
   * Feedback inmediato en el form, sin viaje al servidor: pedir más de lo
   * disponible se rechaza al tipear. Es la clase "topes sin espejar" del
   * AGENTS.md, aplicada al stock en vez de a una constante fija.
   */
  it("una cantidad por encima del stock disponible se rechaza en el form y no envía el POST", async () => {
    const capturado = capturarPost();
    renderWithProviders(<MovimientoSalidaDialog insumoId={INSUMO_ID} stockDisponible={5} />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^cantidad$/i), "10");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    expect(await screen.findByText(/no hay existencia suficiente/i)).toBeInTheDocument();
    expect(capturado.body).toEqual({});
  });

  it("una cantidad igual al stock disponible se acepta (el techo es inclusivo)", async () => {
    const capturado = capturarPost();
    renderWithProviders(<MovimientoSalidaDialog insumoId={INSUMO_ID} stockDisponible={5} />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^cantidad$/i), "5");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(capturado.body.cantidad).toBe(5));
  });

  /**
   * Backstop de la CARRERA real, NO del camino normal: el snapshot de
   * `stockDisponible` con el que el diálogo se montó (`5`, suficiente) no se
   * re-evalúa mientras sigue abierto, así que si OTRO usuario consume la
   * existencia mientras este formulario está tipeado, el 422 del backend es
   * lo único que lo atrapa. Si esta prueba fallara por otro motivo (una
   * cantidad que ya superaba el stock inicial), estaría probando el camino
   * normal y no la carrera — por eso `cantidad` acá queda POR DEBAJO del
   * `stockDisponible` con el que se montó el diálogo.
   */
  it("un 422 (stock insuficiente) durante la carrera se muestra vía toast y el diálogo NO se cierra", async () => {
    const MENSAJE_BACKEND = "Stock insuficiente: se pidieron 3, hay 1 disponibles.";
    server.use(
      http.post(`/api/insumos/${INSUMO_ID}/movimientos/salida`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
      http.get("/api/equipos", () => HttpResponse.json(EQUIPOS)),
      http.get("/api/sectores", () => HttpResponse.json(SECTORES)),
    );
    renderWithProviders(<MovimientoSalidaDialog insumoId={INSUMO_ID} stockDisponible={5} />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^cantidad$/i), "3");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
    expect(screen.getByLabelText(/^cantidad$/i)).toBeInTheDocument();
  });

  it("al registrar con éxito, cierra el diálogo y limpia el formulario", async () => {
    capturarPost();
    renderWithProviders(<MovimientoSalidaDialog insumoId={INSUMO_ID} stockDisponible={10} />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^cantidad$/i), "3");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(screen.queryByLabelText(/^cantidad$/i)).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /registrar salida/i }));
    expect(await screen.findByLabelText(/^cantidad$/i)).toHaveValue(null);
  });

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
    renderWithProviders(<MovimientoSalidaDialog insumoId={INSUMO_ID} stockDisponible={10} />, {
      user: buildUser({ permisos: ["INSUMOS:ALTAS"] }),
    });

    expect(pedidos).toEqual([]);

    await abrirDialog();

    await waitFor(() => expect(pedidos).toEqual(expect.arrayContaining(["equipos", "sectores"])));
  });
});

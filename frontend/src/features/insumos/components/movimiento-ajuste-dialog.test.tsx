import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, type PathParams } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { MovimientoAjusteDialog } from "./movimiento-ajuste-dialog";
import type { RegistrarAjusteInsumoDto } from "../hooks/use-insumo-mutations";
import type { Equipo } from "@/features/equipos/types";
import type { Sector } from "@/features/sectores/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const INSUMO_ID = "11111111-1111-1111-1111-111111111111";

const MOVIMIENTO_CREADO = {
  id: "mov-1",
  insumoId: INSUMO_ID,
  tipo: "AJUSTE_POSITIVO",
  cantidad: 3,
  usuarioId: "u1",
  motivo: "Conteo físico de fin de mes",
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
 * Registra el handler de ajuste y devuelve el body que efectivamente viajó.
 * Mismo mecanismo que `movimiento-entrada-dialog.test.tsx`: el generic de
 * `http.post` tipa `request.json()` sin cast.
 */
function capturarPost(): { body: Partial<RegistrarAjusteInsumoDto> } {
  const capturado: { body: Partial<RegistrarAjusteInsumoDto> } = { body: {} };
  server.use(
    http.post<PathParams, Partial<RegistrarAjusteInsumoDto>>(
      `/api/insumos/${INSUMO_ID}/movimientos/ajuste`,
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
  await user.click(screen.getByRole("button", { name: /registrar ajuste/i }));
  await screen.findByLabelText(/^cantidad$/i);
  return user;
}

describe("MovimientoAjusteDialog", () => {
  it("por default (sin tocar el select) envía AJUSTE_POSITIVO", async () => {
    const capturado = capturarPost();
    renderWithProviders(<MovimientoAjusteDialog insumoId={INSUMO_ID} stockDisponible={10} />, {
      user: buildUser({ permisos: ["INSUMOS:AJUSTAR"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^cantidad$/i), "3");
    await user.type(screen.getByLabelText(/motivo/i), "Conteo físico de fin de mes");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(capturado.body.cantidad).toBe(3));
    expect(capturado.body.tipo).toBe("AJUSTE_POSITIVO");
    expect(capturado.body.motivo).toBe("Conteo físico de fin de mes");
  });

  it("eligiendo AJUSTE_NEGATIVO en el select, viaja ese tipo en el body", async () => {
    const capturado = capturarPost();
    renderWithProviders(<MovimientoAjusteDialog insumoId={INSUMO_ID} stockDisponible={10} />, {
      user: buildUser({ permisos: ["INSUMOS:AJUSTAR"] }),
    });

    const user = await abrirDialog();
    await user.selectOptions(screen.getByLabelText(/tipo de ajuste/i), "AJUSTE_NEGATIVO");
    await user.type(screen.getByLabelText(/^cantidad$/i), "3");
    await user.type(screen.getByLabelText(/motivo/i), "Conteo físico de fin de mes");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(capturado.body.tipo).toBe("AJUSTE_NEGATIVO"));
  });

  it("envía equipo y sector cuando se completan", async () => {
    const capturado = capturarPost();
    renderWithProviders(<MovimientoAjusteDialog insumoId={INSUMO_ID} stockDisponible={10} />, {
      user: buildUser({ permisos: ["INSUMOS:AJUSTAR"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^cantidad$/i), "3");
    await user.type(screen.getByLabelText(/motivo/i), "Conteo físico");
    await user.selectOptions(screen.getByLabelText(/^equipo/i), EQUIPO_ID);
    await user.selectOptions(screen.getByLabelText(/^sector/i), SECTOR_ID);
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(capturado.body.cantidad).toBe(3));
    expect(capturado.body.equipoId).toBe(EQUIPO_ID);
    expect(capturado.body.sectorId).toBe(SECTOR_ID);
  });

  /**
   * A diferencia de entrada/salida, acá el motivo SÍ es obligatorio y SÍ se
   * valida en el cliente (ver el JSDoc del componente): la precondición se
   * conoce al tipear, sin ninguna carrera de por medio.
   */
  it("sin motivo → muestra el mensaje de requerido y no envía el POST", async () => {
    const capturado = capturarPost();
    renderWithProviders(<MovimientoAjusteDialog insumoId={INSUMO_ID} stockDisponible={10} />, {
      user: buildUser({ permisos: ["INSUMOS:AJUSTAR"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^cantidad$/i), "3");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    expect(await screen.findByText(/el motivo es requerido/i)).toBeInTheDocument();
    expect(capturado.body).toEqual({});
  });

  it("un motivo de puros espacios también bloquea el submit con el mensaje de requerido", async () => {
    const capturado = capturarPost();
    renderWithProviders(<MovimientoAjusteDialog insumoId={INSUMO_ID} stockDisponible={10} />, {
      user: buildUser({ permisos: ["INSUMOS:AJUSTAR"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^cantidad$/i), "3");
    await user.type(screen.getByLabelText(/motivo/i), "    ");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    expect(await screen.findByText(/el motivo es requerido/i)).toBeInTheDocument();
    expect(capturado.body).toEqual({});
  });

  /**
   * El tope de stock aplica SOLO al AJUSTE_NEGATIVO: un positivo sube la
   * existencia y nunca puede quedarse corto de nada.
   */
  it("AJUSTE_NEGATIVO por encima del stock disponible se rechaza en el form y no envía el POST", async () => {
    const capturado = capturarPost();
    renderWithProviders(<MovimientoAjusteDialog insumoId={INSUMO_ID} stockDisponible={5} />, {
      user: buildUser({ permisos: ["INSUMOS:AJUSTAR"] }),
    });

    const user = await abrirDialog();
    await user.selectOptions(screen.getByLabelText(/tipo de ajuste/i), "AJUSTE_NEGATIVO");
    await user.type(screen.getByLabelText(/^cantidad$/i), "10");
    await user.type(screen.getByLabelText(/motivo/i), "Conteo físico");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    expect(await screen.findByText(/no hay existencia suficiente/i)).toBeInTheDocument();
    expect(capturado.body).toEqual({});
  });

  it("AJUSTE_POSITIVO por encima del 'stock disponible' se acepta igual: el tope no le aplica", async () => {
    const capturado = capturarPost();
    renderWithProviders(<MovimientoAjusteDialog insumoId={INSUMO_ID} stockDisponible={5} />, {
      user: buildUser({ permisos: ["INSUMOS:AJUSTAR"] }),
    });

    const user = await abrirDialog();
    // AJUSTE_POSITIVO ya es el valor por default del select — no hace falta tocarlo.
    await user.type(screen.getByLabelText(/^cantidad$/i), "1000");
    await user.type(screen.getByLabelText(/motivo/i), "Conteo físico");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(capturado.body.cantidad).toBe(1000));
    expect(capturado.body.tipo).toBe("AJUSTE_POSITIVO");
  });

  /**
   * El ajuste NO exige el insumo habilitado (solo la entrada lo hace): el
   * trigger nunca lleva `disabled={!activo}`. Este test no tiene una
   * contraparte "insumo deshabilitado" porque el componente no toma `activo`
   * como prop — no hay nada que espejar acá.
   */
  it("el trigger «Registrar ajuste» está habilitado incluso con stockDisponible en 0", () => {
    renderWithProviders(<MovimientoAjusteDialog insumoId={INSUMO_ID} stockDisponible={0} />, {
      user: buildUser({ permisos: ["INSUMOS:AJUSTAR"] }),
    });

    expect(screen.getByRole("button", { name: /registrar ajuste/i })).not.toBeDisabled();
  });

  /**
   * Mismo criterio que `movimiento-entrada-dialog.test.tsx`/
   * `movimiento-salida-dialog.test.tsx`: `GET /equipos` exige
   * `EQUIPOS:LECTURA`, independiente del gate de escritura de esta puerta
   * (`INSUMOS:AJUSTAR`). El copy es el propio del ajuste.
   */
  it("un 403 en GET /equipos (sin EQUIPOS:LECTURA) deshabilita el select y avisa, sin tumbar el de sector", async () => {
    server.use(
      http.get("/api/equipos", () =>
        HttpResponse.json({ statusCode: 403, message: "Prohibido." }, { status: 403 }),
      ),
      http.get("/api/sectores", () => HttpResponse.json(SECTORES)),
    );
    renderWithProviders(<MovimientoAjusteDialog insumoId={INSUMO_ID} stockDisponible={10} />, {
      user: buildUser({ permisos: ["INSUMOS:AJUSTAR"] }),
    });

    await abrirDialog();

    const selectEquipo = await screen.findByLabelText(/^equipo/i);
    expect(selectEquipo).toBeDisabled();
    expect(screen.getByText(/sin datos de equipos/i)).toBeInTheDocument();
    expect(screen.queryByText(/^sin equipo$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/el ajuste se puede registrar igual/i)).toBeInTheDocument();

    const selectSector = screen.getByLabelText(/^sector/i);
    expect(selectSector).not.toBeDisabled();
    expect(screen.getByText("Ventas")).toBeInTheDocument();
  });

  it("al registrar con éxito, cierra el diálogo y limpia el formulario", async () => {
    capturarPost();
    renderWithProviders(<MovimientoAjusteDialog insumoId={INSUMO_ID} stockDisponible={10} />, {
      user: buildUser({ permisos: ["INSUMOS:AJUSTAR"] }),
    });

    const user = await abrirDialog();
    await user.type(screen.getByLabelText(/^cantidad$/i), "3");
    await user.type(screen.getByLabelText(/motivo/i), "Conteo físico");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(screen.queryByLabelText(/^cantidad$/i)).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /registrar ajuste/i }));
    expect(await screen.findByLabelText(/^cantidad$/i)).toHaveValue(null);
  });

  /**
   * `tipo` es el campo propio de esta puerta (no lo tienen entrada ni
   * salida), y es justo donde `defaultValues` de `useForm` y el
   * `defaultValue` del `<select>` podrían divergir si algún día vuelven a
   * ser dos dueños del mismo valor. Cubre las DOS mitades: lo que el select
   * muestra al reabrir y lo que efectivamente viaja en el POST.
   */
  it("elegir AJUSTE_NEGATIVO, cerrar y reabrir vuelve a AJUSTE_POSITIVO en el select y en el envío", async () => {
    const capturado = capturarPost();
    renderWithProviders(<MovimientoAjusteDialog insumoId={INSUMO_ID} stockDisponible={10} />, {
      user: buildUser({ permisos: ["INSUMOS:AJUSTAR"] }),
    });

    const user = await abrirDialog();
    await user.selectOptions(screen.getByLabelText(/tipo de ajuste/i), "AJUSTE_NEGATIVO");

    // Cierra por Escape, mismo camino que overlay/X: no pasa por el
    // `onSuccess` de la mutación.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByLabelText(/^cantidad$/i)).not.toBeInTheDocument());

    const user2 = await abrirDialog();
    expect(screen.getByLabelText(/tipo de ajuste/i)).toHaveValue("AJUSTE_POSITIVO");

    await user2.type(screen.getByLabelText(/^cantidad$/i), "3");
    await user2.type(screen.getByLabelText(/motivo/i), "Conteo físico");
    await user2.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(capturado.body.cantidad).toBe(3));
    expect(capturado.body.tipo).toBe("AJUSTE_POSITIVO");
  });

  /**
   * Backstop de la CARRERA, no del camino normal: el motivo requerido y el
   * tope de stock ya bloquean el camino previsible en el cliente — este 422
   * solo llega si el estado del servidor cambió DESPUÉS de que el form
   * validó localmente (p. ej. otro usuario consumió la existencia mientras
   * este formulario seguía abierto).
   */
  it("un 422 (stock insuficiente) durante la carrera se muestra vía toast y el diálogo NO se cierra", async () => {
    const MENSAJE_BACKEND = "Stock insuficiente: se pidieron 3, hay 1 disponibles.";
    server.use(
      http.post(`/api/insumos/${INSUMO_ID}/movimientos/ajuste`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
      http.get("/api/equipos", () => HttpResponse.json(EQUIPOS)),
      http.get("/api/sectores", () => HttpResponse.json(SECTORES)),
    );
    renderWithProviders(<MovimientoAjusteDialog insumoId={INSUMO_ID} stockDisponible={5} />, {
      user: buildUser({ permisos: ["INSUMOS:AJUSTAR"] }),
    });

    const user = await abrirDialog();
    await user.selectOptions(screen.getByLabelText(/tipo de ajuste/i), "AJUSTE_NEGATIVO");
    await user.type(screen.getByLabelText(/^cantidad$/i), "3");
    await user.type(screen.getByLabelText(/motivo/i), "Conteo físico");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
    expect(screen.getByLabelText(/^cantidad$/i)).toBeInTheDocument();
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
    renderWithProviders(<MovimientoAjusteDialog insumoId={INSUMO_ID} stockDisponible={10} />, {
      user: buildUser({ permisos: ["INSUMOS:AJUSTAR"] }),
    });

    // `pedidos` en `[]` justo después de `render()` NO prueba nada por sí
    // solo: el handler de MSW que hace el `push` corre asincrónico, así que
    // sigue vacío incluso si el fetch YA se disparó (enabled: true por
    // error). Hay que darle al fetch la oportunidad real de completarse
    // antes de afirmar la ausencia: si `pedidos` llegara a tener "equipos" en
    // esta ventana, `waitFor` resuelve y el `rejects` de abajo falla.
    await expect(
      waitFor(() => expect(pedidos.length).toBeGreaterThan(0), { timeout: 100 }),
    ).rejects.toThrow();

    await abrirDialog();

    await waitFor(() => expect(pedidos).toEqual(expect.arrayContaining(["equipos", "sectores"])));
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { PlanPreventivoCreateDialog } from "./plan-preventivo-create-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PRIORIDAD_ID = "11111111-1111-1111-1111-111111111111";
const EQUIPO_ID = "22222222-2222-2222-2222-222222222222";
const USUARIO_ID = "33333333-3333-3333-3333-333333333333";

function mockBackend() {
  server.use(
    http.get("/api/catalogos/prioridades", () =>
      HttpResponse.json([
        { id: PRIORIDAD_ID, codigo: "MEDIA", nombre: "Media", color: null, orden: 1, activo: true, createdAt: "", updatedAt: "" },
      ]),
    ),
    http.get("/api/equipos", () =>
      HttpResponse.json([{ id: EQUIPO_ID, nombre: "Notebook Dell", numeroSerie: "SN-001", activo: true }]),
    ),
    http.get("/api/usuarios", () =>
      HttpResponse.json([{ id: USUARIO_ID, nombre: "Ana", apellido: "Gómez", rol: "TECNICO" }]),
    ),
  );
}

async function abrirDialog(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /nuevo plan/i }));
  await screen.findByLabelText(/^título$/i);
  return user;
}

async function completarComunes(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^título$/i), "Revisión mensual");
  await user.selectOptions(screen.getByRole("combobox", { name: /^prioridad$/i }), PRIORIDAD_ID);
  await user.selectOptions(screen.getByRole("combobox", { name: /^responsable$/i }), USUARIO_ID);
  await user.type(screen.getByLabelText(/^cadencia$/i), "1");
  await user.selectOptions(screen.getByRole("combobox", { name: /^unidad$/i }), "MESES");
  await user.type(screen.getByLabelText(/fecha de inicio/i), "2026-01-01");
}

describe("PlanPreventivoCreateDialog — objetivo excluyente (equipo XOR ubicación)", () => {
  beforeEach(() => {
    mockBackend();
    vi.mocked(toast.success).mockClear();
  });

  it("no envía el POST con equipo Y ubicación completados a la vez", async () => {
    let posteo = false;
    server.use(http.post("/api/preventivo/planes", () => {
      posteo = true;
      return HttpResponse.json({}, { status: 201 });
    }));

    renderWithProviders(<PlanPreventivoCreateDialog />, {
      user: buildUser({ permisos: ["PREVENTIVO:ALTAS"] }),
    });
    const user = await abrirDialog();
    await completarComunes(user);
    await user.selectOptions(screen.getByRole("combobox", { name: /^equipo$/i }), EQUIPO_ID);
    await user.type(screen.getByRole("textbox", { name: /^ubicación$/i }), "DEPOSITO");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(posteo).toBe(false);
  });

  it("no envía el POST sin elegir ningún objetivo", async () => {
    let posteo = false;
    server.use(http.post("/api/preventivo/planes", () => {
      posteo = true;
      return HttpResponse.json({}, { status: 201 });
    }));

    renderWithProviders(<PlanPreventivoCreateDialog />, {
      user: buildUser({ permisos: ["PREVENTIVO:ALTAS"] }),
    });
    const user = await abrirDialog();
    await completarComunes(user);
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(posteo).toBe(false);
  });

  it("con solo equipo, crea el plan y envía el payload correcto", async () => {
    const capturado: { body: Record<string, unknown> } = { body: {} };
    server.use(
      http.post("/api/preventivo/planes", async ({ request }) => {
        capturado.body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "p1" }, { status: 201 });
      }),
    );

    renderWithProviders(<PlanPreventivoCreateDialog />, {
      user: buildUser({ permisos: ["PREVENTIVO:ALTAS"] }),
    });
    const user = await abrirDialog();
    await completarComunes(user);
    await user.selectOptions(screen.getByRole("combobox", { name: /^equipo$/i }), EQUIPO_ID);
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(capturado.body.equipoId).toBe(EQUIPO_ID));
    expect(capturado.body.ubicacion).toBeFalsy();
    expect(capturado.body.intervaloValor).toBe(1);
    expect(capturado.body.intervaloUnidad).toBe("MESES");
    expect(toast.success).toHaveBeenCalled();
  });
});

describe("PlanPreventivoCreateDialog — errores de catálogos no se tragan en silencio (hallazgo H3)", () => {
  it("si GET /usuarios falla (p. ej. 403 por permiso cruzado), avisa en el select de responsable", async () => {
    server.use(
      http.get("/api/catalogos/prioridades", () =>
        HttpResponse.json([
          { id: PRIORIDAD_ID, codigo: "MEDIA", nombre: "Media", color: null, orden: 1, activo: true, createdAt: "", updatedAt: "" },
        ]),
      ),
      http.get("/api/equipos", () =>
        HttpResponse.json([{ id: EQUIPO_ID, nombre: "Notebook Dell", numeroSerie: "SN-001", activo: true }]),
      ),
      http.get("/api/usuarios", () => HttpResponse.json({ message: "Forbidden" }, { status: 403 })),
    );

    renderWithProviders(<PlanPreventivoCreateDialog />, {
      user: buildUser({ permisos: ["PREVENTIVO:ALTAS"] }),
    });
    await abrirDialog();

    expect(
      await screen.findByText(/no se pudo cargar la lista de responsables.*permiso para ver usuarios/i),
    ).toBeInTheDocument();
  });

  it("si GET /equipos falla, avisa en el select de equipo", async () => {
    server.use(
      http.get("/api/catalogos/prioridades", () =>
        HttpResponse.json([
          { id: PRIORIDAD_ID, codigo: "MEDIA", nombre: "Media", color: null, orden: 1, activo: true, createdAt: "", updatedAt: "" },
        ]),
      ),
      http.get("/api/equipos", () => HttpResponse.json({ message: "Error interno" }, { status: 500 })),
      http.get("/api/usuarios", () =>
        HttpResponse.json([{ id: USUARIO_ID, nombre: "Ana", apellido: "Gómez", rol: "TECNICO" }]),
      ),
    );

    renderWithProviders(<PlanPreventivoCreateDialog />, {
      user: buildUser({ permisos: ["PREVENTIVO:ALTAS"] }),
    });
    await abrirDialog();

    expect(await screen.findByText(/no se pudieron cargar los equipos/i)).toBeInTheDocument();
  });
});

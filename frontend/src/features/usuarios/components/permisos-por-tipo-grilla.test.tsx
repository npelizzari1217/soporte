import { describe, it, expect } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { SessionContext } from "@/shared/providers/session-provider";
import { AsignarPermisosControl } from "./asignar-permisos-control";
import type { PermisosPorTipoUsuario } from "../hooks/use-permisos-por-tipo-usuario";
import type { UsuarioTenant } from "../types";

const USUARIO: UsuarioTenant = { id: "u1", nombre: "Ada", apellido: "Tec", rol: "USUARIO" };

const OTROS: UsuarioTenant[] = [
  USUARIO,
  { id: "u3", nombre: "Carla", apellido: "Col", rol: "COLABORADOR" },
  { id: "u4", nombre: "Diego", apellido: "Jefe", rol: "ADMINISTRADOR" },
];

/** Estado del servidor: Soporte con Ver y Crear, Mantenimiento cerrado, un tipo inactivo. */
function estado(overrides: Partial<PermisosPorTipoUsuario> = {}): PermisosPorTipoUsuario {
  return {
    sinRestriccion: false,
    rolCodigo: "USUARIO",
    tipos: [
      {
        tipoId: "t-mant",
        nombre: "Mantenimiento",
        modulo: "EDILICIA",
        activo: true,
        acciones: [],
        plantilla: ["LECTURA", "VER_TODOS", "ALTAS", "IMPRESION"],
      },
      {
        tipoId: "t-sop",
        nombre: "Soporte",
        modulo: "TICKETS",
        activo: true,
        acciones: ["LECTURA", "ALTAS"],
        plantilla: ["LECTURA", "ALTAS", "COMENTAR", "IMPRESION"],
      },
      {
        tipoId: "t-viejo",
        nombre: "Viejo",
        modulo: "TICKETS",
        activo: false,
        acciones: [],
        plantilla: null,
      },
    ],
    ...overrides,
  };
}

/**
 * Servidor simulado con estado: el GET devuelve lo último guardado, el PUT y la copia lo
 * reemplazan. Devuelve los cuerpos recibidos y la cantidad de GET para afirmar sobre ellos.
 */
function simularServidor(inicial: PermisosPorTipoUsuario = estado()) {
  let actual = inicial;
  const registro = {
    gets: 0,
    puts: [] as unknown[],
    copias: [] as string[],
    /** Cambia el estado del servidor por fuera de la grilla (otro administrador, la plantilla). */
    cambiar: (nuevo: PermisosPorTipoUsuario) => {
      actual = nuevo;
    },
  };
  server.use(
    http.get("/api/usuarios/u1/permisos", () =>
      HttpResponse.json({ celdas: [], esAdministrador: false }),
    ),
    http.get("/api/usuarios", () => HttpResponse.json(OTROS)),
    http.get("/api/usuarios/u1/permisos-por-tipo", () => {
      registro.gets += 1;
      return HttpResponse.json(actual);
    }),
    http.put("/api/usuarios/u1/permisos-por-tipo", async ({ request }) => {
      const cuerpo = (await request.json()) as {
        tipos: { tipoId: string; acciones: string[] }[];
      };
      registro.puts.push(cuerpo);
      actual = {
        ...actual,
        tipos: actual.tipos.map((tipo) => ({
          ...tipo,
          acciones: (cuerpo.tipos.find((t) => t.tipoId === tipo.tipoId)?.acciones ??
            []) as PermisosPorTipoUsuario["tipos"][number]["acciones"],
        })),
      };
      return HttpResponse.json(actual);
    }),
    // La plantilla del rol también reescribe las filas por tipo (T4c): Soporte queda con Comentar.
    http.post("/api/usuarios/u1/permisos/aplicar-preset", () => {
      actual = {
        ...actual,
        tipos: actual.tipos.map((tipo) => ({
          ...tipo,
          acciones: tipo.tipoId === "t-sop" ? ["LECTURA", "COMENTAR"] : [],
        })),
      };
      return HttpResponse.json({ usuarioId: "u1", rolCodigo: "USUARIO" });
    }),
    http.post("/api/usuarios/u1/permisos-por-tipo/copiar-de/:origenId", ({ params }) => {
      registro.copias.push(String(params.origenId));
      actual = {
        ...actual,
        tipos: actual.tipos.map((tipo) => ({
          ...tipo,
          acciones: tipo.tipoId === "t-mant" ? ["LECTURA", "VER_TODOS"] : [],
        })),
      };
      return HttpResponse.json(actual);
    }),
  );
  return registro;
}

async function abrirTiposDeTicket(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^permisos$/i }));
  await user.click(await screen.findByRole("tab", { name: "Tipos de ticket" }));
  return screen.findByRole("checkbox", { name: "Soporte: Ver" });
}

function renderControl() {
  return renderWithProviders(<AsignarPermisosControl usuario={USUARIO} />, {
    user: buildUser({ rol: "ADMINISTRADOR" }),
  });
}

describe("PermisosPorTipoGrilla (odd/permisos-por-tipo-ticket, T7, S5)", () => {
  it("muestra una fila por tipo con las acciones del servidor, sin columna Borrar", async () => {
    const user = userEvent.setup();
    simularServidor();
    renderControl();

    const soporteVer = await abrirTiposDeTicket(user);

    await waitFor(() => expect(soporteVer).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "Soporte: Crear" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Soporte: Modificar" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Mantenimiento: Ver" })).not.toBeChecked();
    const encabezados = within(screen.getByTestId("permisos-tipos"))
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(encabezados).toEqual([
      "Tipo",
      "Ver",
      "Ver todos",
      "Crear",
      "Modificar",
      "Estado",
      "Asignar",
      "Comentar",
      "Comentario interno",
      "Imprimir",
      "Plantilla",
    ]);
    expect(screen.queryByRole("checkbox", { name: /Borrar/ })).not.toBeInTheDocument();
    // Un tipo inactivo sigue en la grilla: sus filas deciden (L24).
    expect(within(screen.getByRole("row", { name: /Viejo/ })).getByText("Inactivo")).toBeVisible();
  });

  it("sin Ver el resto de la fila queda deshabilitado; destildar Ver vacía la fila (S3)", async () => {
    const user = userEvent.setup();
    simularServidor();
    renderControl();

    const soporteVer = await abrirTiposDeTicket(user);
    await waitFor(() => expect(soporteVer).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "Mantenimiento: Crear" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Mantenimiento: Ver todos" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Soporte: Modificar" })).toBeEnabled();

    await user.click(soporteVer);

    expect(soporteVer).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Soporte: Crear" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Soporte: Crear" })).toBeDisabled();

    // Volver a tildar Ver habilita la fila, sin restaurar lo que se vació.
    await user.click(soporteVer);
    expect(screen.getByRole("checkbox", { name: "Soporte: Crear" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Soporte: Crear" })).not.toBeChecked();
  });

  it("Guardar manda el reemplazo total con todos los tipos, incluidos los que quedan vacíos", async () => {
    const user = userEvent.setup();
    const registro = simularServidor();
    renderControl();

    const soporteVer = await abrirTiposDeTicket(user);
    await waitFor(() => expect(soporteVer).toBeChecked());
    await user.click(screen.getByRole("checkbox", { name: "Mantenimiento: Ver" }));
    await user.click(screen.getByRole("checkbox", { name: "Mantenimiento: Modificar" }));
    await user.click(screen.getByRole("checkbox", { name: "Soporte: Crear" }));
    expect(registro.puts).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(registro.puts).toHaveLength(1));
    expect(registro.puts[0]).toEqual({
      tipos: [
        { tipoId: "t-mant", acciones: ["LECTURA", "MODIFICACION"] },
        { tipoId: "t-sop", acciones: ["LECTURA"] },
        { tipoId: "t-viejo", acciones: [] },
      ],
    });
  });

  it("Aplicar plantilla del rol carga la plantilla en esa fila sola, sin guardar", async () => {
    const user = userEvent.setup();
    const registro = simularServidor();
    renderControl();

    const soporteVer = await abrirTiposDeTicket(user);
    await waitFor(() => expect(soporteVer).toBeChecked());

    await user.click(
      screen.getByRole("button", { name: "Aplicar plantilla del rol a Mantenimiento" }),
    );

    expect(screen.getByRole("checkbox", { name: "Mantenimiento: Ver" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Mantenimiento: Ver todos" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Mantenimiento: Crear" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Mantenimiento: Imprimir" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Mantenimiento: Modificar" })).not.toBeChecked();
    // La otra fila no cambia y nada se persiste hasta Guardar.
    expect(screen.getByRole("checkbox", { name: "Soporte: Comentar" })).not.toBeChecked();
    expect(registro.puts).toHaveLength(0);
    // Un tipo cuyo rol no tiene plantilla no la ofrece.
    expect(
      screen.getByRole("button", { name: "Aplicar plantilla del rol a Viejo" }),
    ).toBeDisabled();
  });

  it("Copiar permisos de otro usuario confirma, reemplaza en el servidor y resiembra la grilla", async () => {
    const user = userEvent.setup();
    const registro = simularServidor();
    renderControl();

    const soporteVer = await abrirTiposDeTicket(user);
    await waitFor(() => expect(soporteVer).toBeChecked());

    const selector = screen.getByLabelText("Copiar permisos de otro usuario");
    // Ni el propio usuario ni un administrador (sin filas que copiar) son opciones.
    expect(within(selector).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Elegir usuario…",
      "Carla Col",
    ]);
    expect(screen.getByRole("button", { name: "Copiar" })).toBeDisabled();

    await user.selectOptions(selector, "u3");
    await user.click(screen.getByRole("button", { name: "Copiar" }));
    const confirmacion = await screen.findByRole("alertdialog");
    expect(within(confirmacion).getByText(/REEMPLAZAR/)).toBeInTheDocument();
    expect(registro.copias).toEqual([]);
    await user.click(within(confirmacion).getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(registro.copias).toEqual(["u3"]));
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Mantenimiento: Ver todos" })).toBeChecked(),
    );
    expect(screen.getByRole("checkbox", { name: "Soporte: Ver" })).not.toBeChecked();
  });

  it("al reabrir el diálogo muestra el estado del servidor, no lo que quedó sin guardar", async () => {
    const user = userEvent.setup();
    const registro = simularServidor();
    renderControl();

    const soporteVer = await abrirTiposDeTicket(user);
    await waitFor(() => expect(soporteVer).toBeChecked());
    await user.click(soporteVer);
    expect(soporteVer).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const reabierto = await abrirTiposDeTicket(user);

    await waitFor(() => expect(reabierto).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "Soporte: Crear" })).toBeChecked();
    expect(registro.gets).toBe(2);
  });

  it("con el staleTime de 30 s de la app, reabrir pide otra vez y muestra lo que cambió en el servidor", async () => {
    const user = userEvent.setup();
    const registro = simularServidor();
    // Mismo `staleTime` por defecto que `QueryProvider`: el helper de tests usa 0 y no lo vería.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    function Providers({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          <SessionContext.Provider
            value={{ user: buildUser({ rol: "ADMINISTRADOR" }), isLoading: false, setUser: () => {} }}
          >
            {children}
          </SessionContext.Provider>
        </QueryClientProvider>
      );
    }
    render(<AsignarPermisosControl usuario={USUARIO} />, { wrapper: Providers });

    const soporteVer = await abrirTiposDeTicket(user);
    await waitFor(() => expect(soporteVer).toBeChecked());
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const otro = estado();
    registro.cambiar({
      ...otro,
      tipos: otro.tipos.map((tipo) => ({
        ...tipo,
        acciones: tipo.tipoId === "t-mant" ? ["LECTURA"] : [],
      })),
    });

    await abrirTiposDeTicket(user);

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Mantenimiento: Ver" })).toBeChecked(),
    );
    expect(screen.getByRole("checkbox", { name: "Soporte: Ver" })).not.toBeChecked();
    expect(registro.gets).toBe(2);
  });

  it("Reaplicar plantilla del rol (pestaña Módulos) resiembra la pestaña Tipos: Guardar no pisa la plantilla", async () => {
    const user = userEvent.setup();
    const registro = simularServidor();
    renderControl();

    const soporteVer = await abrirTiposDeTicket(user);
    await waitFor(() => expect(soporteVer).toBeChecked());
    await user.click(screen.getByRole("tab", { name: "Módulos" }));
    await user.click(screen.getByRole("button", { name: /reaplicar plantilla/i }));
    const confirmacion = await screen.findByRole("alertdialog");
    expect(within(confirmacion).getByText(/tipos de ticket/)).toBeInTheDocument();
    await user.click(within(confirmacion).getByRole("button", { name: /confirmar/i }));
    await user.click(screen.getByRole("tab", { name: "Tipos de ticket" }));

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Soporte: Comentar" })).toBeChecked(),
    );
    expect(screen.getByRole("checkbox", { name: "Soporte: Crear" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(registro.puts).toHaveLength(1));
    expect(registro.puts[0]).toEqual({
      tipos: [
        { tipoId: "t-mant", acciones: [] },
        { tipoId: "t-sop", acciones: ["LECTURA", "COMENTAR"] },
        { tipoId: "t-viejo", acciones: [] },
      ],
    });
  });

  it("una fila guardada con acciones sin Ver se puede vaciar, y Guardar espera a que se corrija (S3)", async () => {
    const user = userEvent.setup();
    const base = estado();
    const registro = simularServidor({
      ...base,
      tipos: base.tipos.map((tipo) =>
        tipo.tipoId === "t-sop" ? { ...tipo, acciones: ["VER_TODOS", "ALTAS"] } : tipo,
      ),
    });
    renderControl();

    await user.click(screen.getByRole("button", { name: /^permisos$/i }));
    await user.click(await screen.findByRole("tab", { name: "Tipos de ticket" }));
    const verTodos = await screen.findByRole("checkbox", { name: "Soporte: Ver todos" });
    await waitFor(() => expect(verTodos).toBeChecked());

    // Quitar sí se permite; conceder sin Ver, no.
    expect(verTodos).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Soporte: Crear" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Soporte: Modificar" })).toBeDisabled();
    expect(screen.getByText(/tiene acciones sin ver/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();

    await user.click(verTodos);
    expect(verTodos).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Soporte: Crear" }));

    expect(screen.queryByText(/tiene acciones sin ver/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(registro.puts).toHaveLength(1));
    expect(registro.puts[0]).toEqual({
      tipos: [
        { tipoId: "t-mant", acciones: [] },
        { tipoId: "t-sop", acciones: [] },
        { tipoId: "t-viejo", acciones: [] },
      ],
    });
  });

  it("cambiar de pestaña no pierde lo editado", async () => {
    const user = userEvent.setup();
    simularServidor();
    renderControl();

    const soporteVer = await abrirTiposDeTicket(user);
    await waitFor(() => expect(soporteVer).toBeChecked());
    await user.click(screen.getByRole("checkbox", { name: "Soporte: Asignar" }));

    await user.click(screen.getByRole("tab", { name: "Módulos" }));
    expect(screen.queryByRole("checkbox", { name: "Soporte: Asignar" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Tipos de ticket" }));

    expect(screen.getByRole("checkbox", { name: "Soporte: Asignar" })).toBeChecked();
  });

  it("un usuario sin restricción (ROOT) no tiene filas para editar", async () => {
    const user = userEvent.setup();
    simularServidor(estado({ sinRestriccion: true, tipos: [] }));
    renderControl();

    await user.click(screen.getByRole("button", { name: /^permisos$/i }));
    await user.click(await screen.findByRole("tab", { name: "Tipos de ticket" }));

    expect(await screen.findByText(/operan todos los tipos de ticket/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Soporte/ })).not.toBeInTheDocument();
  });
});

import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { AsignarPermisosControl } from "./asignar-permisos-control";
import type { UsuarioTenant } from "../types";

const USUARIO_TECNICO: UsuarioTenant = {
  id: "u1",
  nombre: "Ada",
  apellido: "Tec",
  rol: "TECNICO",
  email: "ada@tenant.com",
};

const USUARIO_ADMIN: UsuarioTenant = {
  id: "u2",
  nombre: "Bruno",
  apellido: "Admin",
  rol: "ADMINISTRADOR",
  email: "bruno@tenant.com",
};

describe("AsignarPermisosControl (ADR-P10, sdd/matriz-permisos-por-usuario)", () => {
  it("al abrir refleja las celdas actuales y Guardar envía el set editado (reemplazo total)", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    let gets = 0;
    server.use(
      http.get("/api/usuarios/u1/permisos", () => {
        gets += 1;
        return HttpResponse.json({ celdas: ["TICKETS:LECTURA"], esAdministrador: false });
      }),
      http.patch("/api/usuarios/u1/permisos", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ usuarioId: "u1", celdas: capturedBody.celdas });
      }),
    );

    renderWithProviders(<AsignarPermisosControl usuario={USUARIO_TECNICO} />, {
      user: buildUser({ rol: "ADMINISTRADOR" }),
    });

    // La query queda atada a la APERTURA del diálogo: si se soltara, la tabla
    // dispararía una consulta de permisos por cada fila al pintarse.
    expect(gets).toBe(0);

    await user.click(screen.getByRole("button", { name: /permisos/i }));

    const ticketsLectura = await screen.findByRole("checkbox", { name: "TICKETS:LECTURA" });
    await waitFor(() => expect(ticketsLectura).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "COMPRAS:LECTURA" })).not.toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: "COMPRAS:LECTURA" }));
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() =>
      expect(capturedBody.celdas).toEqual(
        expect.arrayContaining(["TICKETS:LECTURA", "COMPRAS:LECTURA"]),
      ),
    );
  });

  it("deja Guardar FUERA de la zona scrolleable con el catálogo completo renderizado", async () => {
    // Regresión del bug reportado: con la matriz dentro de un contenedor sin
    // scroll propio, el botón que persiste quedaba abajo del viewport y no
    // había forma de llegar a él. El contrato es: la zona de módulos scrollea,
    // el pie con Guardar no se mueve.
    const user = userEvent.setup();
    server.use(
      http.get("/api/usuarios/u1/permisos", () =>
        HttpResponse.json({ celdas: [], esAdministrador: false }),
      ),
    );

    renderWithProviders(<AsignarPermisosControl usuario={USUARIO_TECNICO} />, {
      user: buildUser({ rol: "ADMINISTRADOR" }),
    });
    await user.click(screen.getByRole("button", { name: /permisos/i }));
    await screen.findByRole("checkbox", { name: "TICKETS:LECTURA" });

    const dialogo = screen.getByRole("dialog", { name: `Permisos de ${USUARIO_TECNICO.nombre}` });
    const zonaModulos = screen.getByTestId("permisos-modulos");
    const guardar = screen.getByRole("button", { name: /guardar/i });

    // El catálogo entero está pintado, del primer módulo al último.
    expect(screen.getByRole("checkbox", { name: "KB:PUBLICAR" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "DASHBOARD:LECTURA" })).toBeInTheDocument();

    expect(zonaModulos.className).toContain("overflow-y-auto");
    expect(zonaModulos).toContainElement(screen.getByRole("checkbox", { name: "DASHBOARD:LECTURA" }));
    expect(zonaModulos).not.toContainElement(guardar);
    expect(dialogo).toContainElement(guardar);
  });

  it("encabeza cada grupo con el nombre legible del módulo, no con el código crudo", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/usuarios/u1/permisos", () =>
        HttpResponse.json({ celdas: [], esAdministrador: false }),
      ),
    );

    renderWithProviders(<AsignarPermisosControl usuario={USUARIO_TECNICO} />, {
      user: buildUser({ rol: "ADMINISTRADOR" }),
    });
    await user.click(screen.getByRole("button", { name: /permisos/i }));
    await screen.findByRole("checkbox", { name: "TICKETS:LECTURA" });

    const zonaModulos = within(screen.getByTestId("permisos-modulos"));
    // Mismo nombre que en el menú lateral: "KB" no le dice nada a nadie.
    expect(zonaModulos.getByText("Base de conocimiento")).toBeInTheDocument();
    expect(zonaModulos.getByText("Tickets")).toBeInTheDocument();
    // Los códigos crudos ya no se muestran como encabezado (siguen viajando en
    // el `aria-label` de cada checkbox, que no es texto del DOM).
    expect(zonaModulos.queryByText("KB")).not.toBeInTheDocument();
    expect(zonaModulos.queryByText("TICKETS")).not.toBeInTheDocument();
    // Las ACCIONES no cambian: se siguen mostrando con su código.
    expect(zonaModulos.getAllByText("LECTURA").length).toBeGreaterThan(0);
  });

  it("tildar celdas NO persiste: la mutación sale recién al apretar Guardar", async () => {
    const user = userEvent.setup();
    let patches = 0;
    server.use(
      http.get("/api/usuarios/u1/permisos", () =>
        HttpResponse.json({ celdas: [], esAdministrador: false }),
      ),
      http.patch("/api/usuarios/u1/permisos", async ({ request }) => {
        patches += 1;
        const body = (await request.json()) as { celdas: string[] };
        return HttpResponse.json({ usuarioId: "u1", celdas: body.celdas });
      }),
    );

    renderWithProviders(<AsignarPermisosControl usuario={USUARIO_TECNICO} />, {
      user: buildUser({ rol: "ADMINISTRADOR" }),
    });
    await user.click(screen.getByRole("button", { name: /permisos/i }));

    await user.click(await screen.findByRole("checkbox", { name: "TICKETS:LECTURA" }));
    await user.click(screen.getByRole("checkbox", { name: "COMPRAS:ALTAS" }));
    expect(patches).toBe(0);

    await user.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(patches).toBe(1));
  });

  it("deshabilita las acciones que el módulo no soporta en su piso (IMPRESION en ninguno, APROBACION solo en COMPRAS)", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/usuarios/u1/permisos", () =>
        HttpResponse.json({ celdas: [], esAdministrador: false }),
      ),
    );

    renderWithProviders(<AsignarPermisosControl usuario={USUARIO_TECNICO} />, {
      user: buildUser({ rol: "ADMINISTRADOR" }),
    });
    await user.click(screen.getByRole("button", { name: /permisos/i }));
    await screen.findByRole("checkbox", { name: "TICKETS:LECTURA" });

    expect(screen.getByRole("checkbox", { name: "TICKETS:IMPRESION" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "DASHBOARD:APROBACION" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "COMPRAS:APROBACION" })).not.toBeDisabled();
  });

  it("para un ADMINISTRADOR deshabilita la edición y muestra la nota (grilla tildada completa, R2)", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/usuarios/u2/permisos", () =>
        HttpResponse.json({ celdas: [], esAdministrador: true }),
      ),
    );

    renderWithProviders(<AsignarPermisosControl usuario={USUARIO_ADMIN} />, {
      user: buildUser({ rol: "ADMINISTRADOR" }),
    });

    await user.click(screen.getByRole("button", { name: /permisos/i }));

    expect(await screen.findByText(/ven toda la matriz/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();
    // Reaplicar la plantilla tampoco tiene efecto para un administrador (bypass
    // R2): si no se ofrece Guardar, tampoco se ofrece esta acción.
    expect(
      screen.queryByRole("button", { name: /reaplicar plantilla/i }),
    ).not.toBeInTheDocument();
  });
});

// Reaplicar la plantilla del rol es una operación de PERMISOS, no de cambio de
// rol: antes SOLO existía como checkbox dentro de `CambiarRolControl`, cuyo
// Guardar está deshabilitado mientras el rol no cambie — o sea, era inalcanzable
// justo en el caso más natural ("reseteá a esta persona a su rol limpio").
describe("AsignarPermisosControl — reaplicar la plantilla del rol", () => {
  function mockPermisos(opciones: {
    celdasIniciales: string[];
    celdasTrasPreset: string[];
    onPreset?: (body: Record<string, unknown>) => void;
    onPatch?: (body: Record<string, unknown>) => void;
  }) {
    let presetAplicado = false;
    server.use(
      http.get("/api/usuarios/u1/permisos", () =>
        HttpResponse.json({
          celdas: presetAplicado ? opciones.celdasTrasPreset : opciones.celdasIniciales,
          esAdministrador: false,
        }),
      ),
      http.post("/api/usuarios/u1/permisos/aplicar-preset", async ({ request }) => {
        presetAplicado = true;
        const body = (await request.json()) as Record<string, unknown>;
        opciones.onPreset?.(body);
        return HttpResponse.json({ usuarioId: "u1", rolCodigo: body.rolCodigo });
      }),
      http.patch("/api/usuarios/u1/permisos", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        opciones.onPatch?.(body);
        return HttpResponse.json({ usuarioId: "u1", celdas: body.celdas });
      }),
    );
  }

  it("confirmar en el diálogo anidado dispara el POST con el rol del usuario", async () => {
    // El ConfirmDialog se abre ENCIMA del modal de permisos, que ya está
    // abierto: este test fija que la confirmación anidada realmente se puede
    // operar y que la llamada sale.
    const user = userEvent.setup();
    let presetBody: Record<string, unknown> | null = null;
    mockPermisos({
      celdasIniciales: ["TICKETS:LECTURA"],
      celdasTrasPreset: ["COMPRAS:LECTURA"],
      onPreset: (body) => (presetBody = body),
    });

    renderWithProviders(<AsignarPermisosControl usuario={USUARIO_TECNICO} />, {
      user: buildUser({ rol: "ADMINISTRADOR" }),
    });

    await user.click(screen.getByRole("button", { name: /permisos/i }));
    await screen.findByRole("checkbox", { name: "TICKETS:LECTURA" });

    await user.click(screen.getByRole("button", { name: /reaplicar plantilla/i }));

    const confirmacion = await screen.findByRole("alertdialog");
    // El texto tiene que decir que SOBRESCRIBE y que lo manual se pierde.
    expect(within(confirmacion).getByText(/sobrescrib/i)).toBeInTheDocument();
    await user.click(within(confirmacion).getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(presetBody).toEqual({ rolCodigo: USUARIO_TECNICO.rol }));
  });

  it("cancelar la confirmación NO llama al endpoint", async () => {
    const user = userEvent.setup();
    let posts = 0;
    mockPermisos({
      celdasIniciales: ["TICKETS:LECTURA"],
      celdasTrasPreset: ["COMPRAS:LECTURA"],
      onPreset: () => (posts += 1),
    });

    renderWithProviders(<AsignarPermisosControl usuario={USUARIO_TECNICO} />, {
      user: buildUser({ rol: "ADMINISTRADOR" }),
    });

    await user.click(screen.getByRole("button", { name: /permisos/i }));
    await screen.findByRole("checkbox", { name: "TICKETS:LECTURA" });

    await user.click(screen.getByRole("button", { name: /reaplicar plantilla/i }));
    const confirmacion = await screen.findByRole("alertdialog");
    await user.click(within(confirmacion).getByRole("button", { name: /cancelar/i }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(posts).toBe(0);
  });

  it("tras aplicar la plantilla la grilla se resincroniza y Guardar manda el set NUEVO", async () => {
    // El peligro real: la selección vive en estado local sembrado por la query.
    // Si no se resincroniza tras el refetch, apretar Guardar por costumbre pisa
    // la plantilla recién aplicada con el set viejo.
    const user = userEvent.setup();
    let patchBody: Record<string, unknown> | null = null;
    mockPermisos({
      celdasIniciales: ["TICKETS:LECTURA"],
      celdasTrasPreset: ["COMPRAS:LECTURA", "COMPRAS:ALTAS"],
      onPatch: (body) => (patchBody = body),
    });

    renderWithProviders(<AsignarPermisosControl usuario={USUARIO_TECNICO} />, {
      user: buildUser({ rol: "ADMINISTRADOR" }),
    });

    await user.click(screen.getByRole("button", { name: /permisos/i }));
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "TICKETS:LECTURA" })).toBeChecked(),
    );

    await user.click(screen.getByRole("button", { name: /reaplicar plantilla/i }));
    const confirmacion = await screen.findByRole("alertdialog");
    await user.click(within(confirmacion).getByRole("button", { name: /confirmar/i }));

    // La grilla muestra las celdas NUEVAS, no las de antes.
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "COMPRAS:LECTURA" })).toBeChecked(),
    );
    expect(screen.getByRole("checkbox", { name: "COMPRAS:ALTAS" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "TICKETS:LECTURA" })).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(patchBody).not.toBeNull());
    expect(patchBody!.celdas).toEqual(
      expect.arrayContaining(["COMPRAS:LECTURA", "COMPRAS:ALTAS"]),
    );
    expect(patchBody!.celdas).not.toContain("TICKETS:LECTURA");
  });
});

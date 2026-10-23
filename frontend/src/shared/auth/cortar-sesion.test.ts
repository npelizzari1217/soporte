import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/msw/server";
import { IDLE_LOGOUT_KEY } from "./idle-storage";

// El guard de `cortarSesion` es de módulo y no se reinicia (en producción el corte termina en
// una navegación completa): cada test importa una instancia fresca.
async function cargar(): Promise<typeof import("./cortar-sesion")> {
  vi.resetModules();
  return import("./cortar-sesion");
}

let assign: ReturnType<typeof vi.fn>;
let logouts: number;

function estarEn(pathname: string): void {
  vi.stubGlobal("location", { ...window.location, pathname, assign });
}

describe("cortarSesion", () => {
  beforeEach(() => {
    window.localStorage.clear();
    assign = vi.fn();
    logouts = 0;
    server.use(
      http.post("/api/auth/logout", () => {
        logouts += 1;
        return HttpResponse.json({ ok: true });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sesión vencida en una ruta protegida → avisa a otras pestañas, hace logout y navega a /login con el motivo", async () => {
    estarEn("/tickets");
    const { cortarSesion } = await cargar();

    await cortarSesion("sesion-vencida");

    expect(window.localStorage.getItem(IDLE_LOGOUT_KEY)).toMatch(/^sesion-vencida:\d+$/);
    expect(logouts).toBe(1);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/login?motivo=sesion-vencida");
  });

  it("inactividad → navega a /login?motivo=inactividad", async () => {
    estarEn("/dashboard");
    const { cortarSesion } = await cargar();

    await cortarSesion("inactividad");

    expect(assign).toHaveBeenCalledWith("/login?motivo=inactividad");
  });

  it("muchos cortes concurrentes, incluso con motivos distintos → un solo logout y una sola redirección", async () => {
    estarEn("/tickets");
    const { cortarSesion } = await cargar();

    await Promise.all([
      cortarSesion("sesion-vencida"),
      cortarSesion("sesion-vencida"),
      cortarSesion("inactividad"),
    ]);

    expect(logouts).toBe(1);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/login?motivo=sesion-vencida");
  });

  it("backend inalcanzable en el logout → navega igual", async () => {
    estarEn("/tickets");
    server.use(http.post("/api/auth/logout", () => HttpResponse.error()));
    const { cortarSesion } = await cargar();

    await cortarSesion("sesion-vencida");

    expect(assign).toHaveBeenCalledWith("/login?motivo=sesion-vencida");
  });

  it.each(["/login", "/encuesta/abc123", "/c/hospital/pedido", "/olvide-password", "/restablecer-password"])(
    "en %s (ruta sin sesión) → no hace logout, no avisa y no navega",
    async (ruta) => {
      estarEn(ruta);
      const { cortarSesion } = await cargar();

      await cortarSesion("sesion-vencida");

      expect(logouts).toBe(0);
      expect(assign).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(IDLE_LOGOUT_KEY)).toBeNull();
    },
  );

  it("una ruta protegida que empieza como una pública (/clientes) sí corta", async () => {
    estarEn("/clientes");
    const { cortarSesion } = await cargar();

    await cortarSesion("sesion-vencida");

    expect(assign).toHaveBeenCalledWith("/login?motivo=sesion-vencida");
  });
});

describe("seguirCorteDeOtraPestana", () => {
  beforeEach(() => {
    assign = vi.fn();
    logouts = 0;
    server.use(
      http.post("/api/auth/logout", () => {
        logouts += 1;
        return HttpResponse.json({ ok: true });
      }),
    );
    estarEn("/tickets");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("navega con el motivo de la otra pestaña, sin volver a hacer logout", async () => {
    const { seguirCorteDeOtraPestana } = await cargar();

    seguirCorteDeOtraPestana("inactividad");

    expect(assign).toHaveBeenCalledWith("/login?motivo=inactividad");
    expect(logouts).toBe(0);
  });

  it("sin motivo → navega a /login sin query", async () => {
    const { seguirCorteDeOtraPestana } = await cargar();

    seguirCorteDeOtraPestana(null);

    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("después de seguir a otra pestaña, un corte local no vuelve a navegar", async () => {
    const { seguirCorteDeOtraPestana, cortarSesion } = await cargar();

    seguirCorteDeOtraPestana("inactividad");
    await cortarSesion("sesion-vencida");

    expect(assign).toHaveBeenCalledTimes(1);
    expect(logouts).toBe(0);
  });
});

describe("motivoDeSenal", () => {
  it.each([
    ["inactividad:1700000000000", "inactividad"],
    ["sesion-vencida:1700000000000", "sesion-vencida"],
    ["1700000000000", null],
    ["otra-cosa:1700000000000", null],
    [null, null],
  ])("%s → %s", async (valor, esperado) => {
    const { motivoDeSenal } = await cargar();

    expect(motivoDeSenal(valor)).toBe(esperado);
  });
});

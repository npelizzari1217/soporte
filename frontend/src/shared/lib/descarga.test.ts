import { describe, it, expect } from "vitest";
import { nombreDesdeContentDisposition } from "./descarga";

/**
 * El nombre del archivo descargado sale del header `Content-Disposition` que
 * arma el backend. Vale cubrirlo porque el fallo es SILENCIOSO: si el parseo
 * devuelve algo raro, el usuario termina con un archivo llamado `"compras.csv"`
 * (con comillas incluidas) o directamente sin extensión, y no hay error visible
 * que lo delate.
 */
describe("nombreDesdeContentDisposition", () => {
  it("extrae el nombre entre comillas — el caso que manda el backend", () => {
    expect(nombreDesdeContentDisposition('attachment; filename="compras-2026-08-19.csv"')).toBe(
      "compras-2026-08-19.csv",
    );
  });

  it("acepta el nombre sin comillas", () => {
    expect(nombreDesdeContentDisposition("attachment; filename=compras.csv")).toBe("compras.csv");
  });

  it("header ausente o sin filename → null, para que el caller use su fallback", () => {
    expect(nombreDesdeContentDisposition(null)).toBeNull();
    expect(nombreDesdeContentDisposition("attachment")).toBeNull();
  });

  it("descarta cualquier ruta que venga en el nombre — solo se conserva el archivo", () => {
    expect(nombreDesdeContentDisposition('attachment; filename="../../etc/passwd"')).toBe("passwd");
  });
});

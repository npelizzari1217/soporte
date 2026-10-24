import { describe, expect, it } from "vitest";
import { esRutaSinSesion } from "./rutas-publicas";

// `esRutaPublica` la cubre `middleware.test.ts` a través del middleware. Acá va lo que suma
// `esRutaSinSesion`: `/login`, exacto.

describe("esRutaSinSesion", () => {
  it.each(["/login", "/encuesta/abc123", "/c/hospital/pedido", "/olvide-password", "/restablecer-password"])(
    "%s → true",
    (ruta) => {
      expect(esRutaSinSesion(ruta)).toBe(true);
    },
  );

  it.each(["/", "/tickets", "/clientes", "/compras", "/login/otra", "/admin/encuesta/plantillas"])(
    "%s → false",
    (ruta) => {
      expect(esRutaSinSesion(ruta)).toBe(false);
    },
  );
});

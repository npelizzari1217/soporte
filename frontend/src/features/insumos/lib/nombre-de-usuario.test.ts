import { describe, it, expect } from "vitest";
import {
  ETIQUETA_USUARIO_CARGANDO,
  ETIQUETA_USUARIO_SIN_MEMBRESIA,
  ETIQUETA_USUARIOS_NO_DISPONIBLES,
  nombreDeUsuario,
  type UsuarioConNombre,
} from "./nombre-de-usuario";

/**
 * Los dos desenlaces que la bitácora NO puede alcanzar desde un render
 * —"la lista está en vuelo" y "quien firmó ya no es miembro vigente"— se
 * prueban acá, donde son estados y no un momento del ciclo de vida de una
 * query. Los otros dos los cubre `insumo-detail-view.test.tsx` contra el
 * endpoint real (mockeado): el 403 y el nombre resuelto.
 *
 * La afirmación que atraviesa los cuatro: NUNCA sale el `usuarioId`.
 */
const ANA: UsuarioConNombre = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  nombre: "Ana",
  apellido: "Gómez",
};

describe("nombreDeUsuario", () => {
  it("la lista resolvió y trae al usuario → lo nombra con nombre y apellido", () => {
    expect(nombreDeUsuario(ANA.id, { entradas: [ANA], cargando: false })).toBe("Ana Gómez");
  });

  it("la lista está en vuelo → no concluye nada todavía", () => {
    expect(nombreDeUsuario(ANA.id, { entradas: undefined, cargando: true })).toBe(
      ETIQUETA_USUARIO_CARGANDO,
    );
  });

  it("la lista no resolvió y ya no carga (403 o caída) → lo dice sin acusar al asiento", () => {
    expect(nombreDeUsuario(ANA.id, { entradas: undefined, cargando: false })).toBe(
      ETIQUETA_USUARIOS_NO_DISPONIBLES,
    );
  });

  /**
   * La lista trae OTRO usuario, no está vacía: con la lista vacía, "no está"
   * pasaría también con una función que ignorara las entradas — es la forma 2
   * de verde falso del `AGENTS.md`.
   */
  it("la lista resolvió con otros usuarios y NO lo trae → recién ahí la ausencia prueba algo", () => {
    const otro: UsuarioConNombre = {
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      nombre: "Luis",
      apellido: "Paz",
    };
    expect(nombreDeUsuario(ANA.id, { entradas: [otro], cargando: false })).toBe(
      ETIQUETA_USUARIO_SIN_MEMBRESIA,
    );
  });

  it("ninguna etiqueta de fallo contiene el identificador, y las tres son distintas entre sí", () => {
    const etiquetas = [
      ETIQUETA_USUARIO_CARGANDO,
      ETIQUETA_USUARIOS_NO_DISPONIBLES,
      ETIQUETA_USUARIO_SIN_MEMBRESIA,
    ];
    for (const etiqueta of etiquetas) {
      expect(etiqueta).not.toContain(ANA.id);
    }
    expect(new Set(etiquetas).size).toBe(etiquetas.length);
  });
});

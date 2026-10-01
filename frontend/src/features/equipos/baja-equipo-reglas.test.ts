import { describe, it, expect } from "vitest";
import { ApiError } from "@/shared/api/types";
import {
  VALORES_INICIALES_BAJA,
  mensajeDeErrorBaja,
  piezasBloqueantes,
  validarBaja,
  type ValoresBaja,
} from "./baja-equipo-reglas";
import type { PiezaResumenBaja, ResumenBajaEquipo } from "./types";

function pieza(id: string, extra: Partial<PiezaResumenBaja> = {}): PiezaResumenBaja {
  return {
    componenteId: id,
    descripcion: id,
    insumoId: "i1",
    insumoNombre: null,
    unidadId: null,
    numeroSerie: null,
    seguimiento: "NINGUNO",
    requiereSerial: false,
    serialSugerido: null,
    causaQueImpideDevolver: null,
    ...extra,
  };
}

function resumen(piezas: PiezaResumenBaja[]): ResumenBajaEquipo {
  return {
    equipoId: "e1",
    nombre: "PC-1",
    ticketsAbiertos: 0,
    largoMaximoTexto: { VEJEZ: 10, DONACION: 10, ROTURA: 10, OTRA: 20 },
    piezas,
  };
}

const valores = (cambios: Partial<ValoresBaja>): ValoresBaja => ({ ...VALORES_INICIALES_BAJA, ...cambios });

describe("validarBaja", () => {
  it("OTRA exige texto y el texto se mide recortado contra el tope de la categoría", () => {
    expect(validarBaja(resumen([]), valores({ categoria: "OTRA", motivo: "   " })).motivo).toMatch(/obligatorio/);
    expect(validarBaja(resumen([]), valores({ motivo: `  ${"a".repeat(10)}  ` })).motivo).toBeUndefined();
    expect(validarBaja(resumen([]), valores({ motivo: "a".repeat(11) })).motivo).toMatch(/hasta 10/);
  });

  it("exige serial válido y no repetido en los legados SERIE, solo con STOCK_USADO", () => {
    const piezas = [
      pieza("a", { requiereSerial: true, serialSugerido: "SN 1" }),
      pieza("b", { requiereSerial: true, serialSugerido: "sn1" }),
      pieza("c", { requiereSerial: true }),
    ];
    const errores = validarBaja(resumen(piezas), valores({}));
    expect(errores.seriales.a).toBeUndefined();
    expect(errores.seriales.b).toMatch(/repetido/);
    expect(errores.seriales.c).toBeDefined();
    expect(validarBaja(resumen(piezas), valores({ destino: "DESCARTE" })).seriales).toEqual({});
  });
});

describe("piezasBloqueantes", () => {
  it("las causas de serial dejan de bloquear cuando el usuario cambió el serial; las demás no", () => {
    const piezas = [
      pieza("a", { requiereSerial: true, serialSugerido: "SN1", causaQueImpideDevolver: "SERIAL_DUPLICADO" }),
      pieza("b", { causaQueImpideDevolver: "INSUMO_BORRADO" }),
    ];
    expect(piezasBloqueantes(resumen(piezas), valores({})).map((p) => p.componenteId)).toEqual(["a", "b"]);
    expect(piezasBloqueantes(resumen(piezas), valores({ seriales: { a: "SN2", b: "x" } })).map((p) => p.componenteId)).toEqual(["b"]);
  });
});

describe("mensajeDeErrorBaja", () => {
  it("distingue 409, piezas, motivo con y sin largoMaximo, y cae al mensaje del backend", () => {
    expect(mensajeDeErrorBaja(new ApiError(409, "x")).texto).toMatch(/cambió/);
    const piezas = [{ componenteId: "a", insumoId: null, causa: "SERIAL_REPETIDO" }];
    expect(mensajeDeErrorBaja(new ApiError(422, "x", ["x"], { piezas })).piezas).toEqual(piezas);
    const largo = new ApiError(422, "x", ["x"], { code: "MOTIVO_BAJA_EQUIPO_INVALIDO", largoMaximo: 400 });
    expect(mensajeDeErrorBaja(largo).texto).toMatch(/hasta 400/);
    const vacio = new ApiError(422, "x", ["x"], { code: "MOTIVO_BAJA_EQUIPO_INVALIDO" });
    expect(mensajeDeErrorBaja(vacio).texto).toMatch(/obligatorio/);
    expect(mensajeDeErrorBaja(new ApiError(422, "Ya fue dado de baja."))).toEqual({ texto: "Ya fue dado de baja.", piezas: [] });
  });
});

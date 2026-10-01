/**
 * Reglas de la baja del equipo completo, sin React: estado del formulario, validación
 * local, piezas que bloquean la devolución al stock y lectura de los errores del
 * backend. La interfaz es solo feedback; el backend sigue siendo la autoridad.
 */
import { ApiError } from "@/shared/api/types";
import { normalizarSerial, numeroSerieSchema } from "@/features/insumos/schemas";
import { motivoBajaInvalidoSchema, piezasProblematicasSchema } from "./schemas";
import type { CategoriaBajaEquipo, CausaPiezaBaja, DestinoBajaEquipo, PiezaResumenBaja, ResumenBajaEquipo } from "./types";

export interface ValoresBaja {
  destino: DestinoBajaEquipo;
  categoria: CategoriaBajaEquipo;
  motivo: string;
  /** Serial tipeado por pieza; sin entrada rige `serialSugerido`. */
  seriales: Record<string, string>;
  confirmacion: string;
}

export const VALORES_INICIALES_BAJA: ValoresBaja = {
  destino: "STOCK_USADO",
  categoria: "VEJEZ",
  motivo: "",
  seriales: {},
  confirmacion: "",
};

export function nombreDePieza(pieza: PiezaResumenBaja): string {
  return pieza.descripcion ?? pieza.insumoNombre ?? "Pieza sin descripción";
}

/** Serial que se muestra y se envía: lo tipeado o, si no se tocó, el sugerido. */
export function serialDePieza(pieza: PiezaResumenBaja, valores: ValoresBaja): string {
  return valores.seriales[pieza.componenteId] ?? pieza.serialSugerido ?? "";
}

export const TEXTO_CAUSA_BAJA: Record<CausaPiezaBaja, string> = {
  INSUMO_BORRADO: "el repuesto fue eliminado del catálogo",
  FAMILIA_NO_REPUESTO: "su familia ya no es de repuestos",
  SERIAL_REQUERIDO: "falta el número de serie",
  SERIAL_INVALIDO: "el número de serie no es válido",
  SERIAL_REPETIDO: "el número de serie está repetido en esta baja",
  SERIAL_DUPLICADO: "ese número de serie ya existe en el stock",
};

const CAUSAS_DE_SERIAL: CausaPiezaBaja[] = ["SERIAL_REQUERIDO", "SERIAL_INVALIDO", "SERIAL_REPETIDO", "SERIAL_DUPLICADO"];

export function destinoDePieza(pieza: PiezaResumenBaja, destino: DestinoBajaEquipo): string {
  if (destino === "DESCARTE") return "Se descarta";
  return pieza.insumoId ? "Vuelve al stock como usada" : "Se retira (sin repuesto asociado: no mueve stock)";
}

export interface ErroresBaja {
  motivo?: string;
  seriales: Record<string, string>;
}

/** Errores de validación locales; el backend sigue siendo la autoridad. */
export function validarBaja(resumen: ResumenBajaEquipo, valores: ValoresBaja) {
  const errores: ErroresBaja = { seriales: {} };
  const texto = valores.motivo.trim();
  const tope = resumen.largoMaximoTexto[valores.categoria];
  if (valores.categoria === "OTRA" && texto === "") errores.motivo = "Con la categoría Otra, el motivo es obligatorio.";
  else if (texto.length > tope) errores.motivo = `El motivo admite hasta ${tope} caracteres con esta categoría.`;

  const vistos = new Set<string>();
  if (valores.destino === "STOCK_USADO") {
    for (const pieza of resumen.piezas.filter((p) => p.requiereSerial)) {
      const serial = numeroSerieSchema.safeParse(serialDePieza(pieza, valores));
      if (!serial.success) {
        errores.seriales[pieza.componenteId] = serial.error.issues[0].message;
        continue;
      }
      const clave = `${pieza.insumoId}:${normalizarSerial(serial.data)}`;
      if (vistos.has(clave)) errores.seriales[pieza.componenteId] = "Este número de serie está repetido en la baja.";
      vistos.add(clave);
    }
  }
  return errores;
}

/** Piezas que impiden devolver al stock: las de serial dejan de bloquear si el usuario ya corrigió el serial. */
export function piezasBloqueantes(resumen: ResumenBajaEquipo, valores: ValoresBaja): PiezaResumenBaja[] {
  return resumen.piezas.filter((pieza) => {
    const causa = pieza.causaQueImpideDevolver;
    if (!causa) return false;
    if (!CAUSAS_DE_SERIAL.includes(causa)) return true;
    return serialDePieza(pieza, valores).trim() === (pieza.serialSugerido ?? "");
  });
}

export interface ErrorBaja {
  texto: string;
  /** Piezas del 422 `BAJA_EQUIPO_PIEZAS_PROBLEMATICAS`, con su causa. */
  piezas: { componenteId: string; insumoId: string | null; causa: CausaPiezaBaja }[];
}

export function mensajeDeErrorBaja(error: Error): ErrorBaja {
  if (!(error instanceof ApiError)) return { texto: error.message, piezas: [] };
  if (error.statusCode === 409) {
    return {
      texto:
        "El equipo cambió mientras confirmabas la baja. Actualizamos el resumen: revisalo y volvé a confirmar.",
      piezas: [],
    };
  }
  const piezas = piezasProblematicasSchema.safeParse(error.raw);
  if (error.statusCode === 422 && piezas.success) {
    return { texto: "No se pudo dar de baja: estas piezas no pueden volver al stock.", piezas: piezas.data.piezas };
  }
  const motivo = motivoBajaInvalidoSchema.safeParse(error.raw);
  if (error.statusCode === 422 && motivo.success) {
    const texto =
      motivo.data.largoMaximo === undefined
        ? "Con la categoría Otra, el motivo es obligatorio."
        : `El motivo es demasiado largo: admite hasta ${motivo.data.largoMaximo} caracteres con esta categoría.`;
    return { texto, piezas: [] };
  }
  return { texto: error.message, piezas: [] };
}

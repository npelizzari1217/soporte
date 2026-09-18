/**
 * Validación cliente-side del form del catálogo de Modelos de Equipo (RHF +
 * zod), espejo de `CreateModeloEquipoDto`/`EditModeloEquipoDto`
 * (`backend/src/insumos/interface/dtos/modelos-equipo.dto.ts`). El dominio del
 * backend (`ModeloEquipoEntity`) sigue siendo la autoridad real — esto es
 * feedback inmediato antes de pegarle a la API, no la barrera.
 */
import { z } from "zod";
import { mensajeDemasiadoLargo } from "@/shared/lib/mensaje-tope";

/**
 * Topes de `modelos_equipo`, espejo de `MODELO_EQUIPO_*_MAX_LENGTH`
 * (`backend/src/insumos/domain/entities/modelo-equipo.entity.ts:25-26`).
 * Locales a esta feature por el mismo motivo que el resto de los topes del
 * front: no hay paquete compartido entre Nest y Next.
 */
const MODELO_EQUIPO_MARCA_MAX_LENGTH = 100;
const MODELO_EQUIPO_MODELO_MAX_LENGTH = 150;

/**
 * Normaliza `marca` a mayúscula. Espejo de `normalizarMarcaModeloEquipo`
 * (backend, dominio): `toUpperCase()` no preserva longitud ('ß' → 'SS'), así
 * que el `.refine()` de `modeloEquipoSchema` y el `submit()` del diálogo (WU-2)
 * necesitan medir y enviar EXACTAMENTE el mismo string — mismo criterio que
 * `normalizarUbicacion` en `features/equipos/schemas.ts`.
 */
export function normalizarMarca(valor: string): string {
  return valor.trim().toUpperCase();
}

/**
 * Normaliza `modelo` con SOLO `trim()`. Espejo de `normalizarModeloModeloEquipo`
 * (backend, dominio): a diferencia de `marca`, la designación comercial se
 * muestra tal como la escribió el fabricante ("LaserJet Pro M404", no
 * "LASERJET PRO M404"). `trim()` nunca agranda el string, así que medir el
 * crudo o el normalizado da el mismo resultado.
 */
export function normalizarModelo(valor: string): string {
  return valor.trim();
}

/**
 * Validación cliente-side del form del catálogo (ABM, Admin > Modelos de
 * equipo). Sin `codigo` (ADR-1): la identidad es el PAR `(marca, modelo)`, y
 * el duplicado vuelve como 422 del backend — no hay nada que este schema
 * pueda anticipar sobre el PAR sin otro viaje a la API.
 *
 * Sin `@Matches`-style de código en ninguno de los dos campos (a diferencia de
 * `familiaInsumoSchema.codigo`/`unidadMedidaSchema.codigo`): `marca` es texto
 * libre con espacios internos ("HEWLETT PACKARD").
 *
 * `marca` mide el largo sobre el valor NORMALIZADO (mayúscula), no el crudo:
 * molde exacto de `ubicacion` en `features/equipos/schemas.ts` — `toUpperCase()`
 * puede agrandar el string, así que medir el crudo dejaría pasar en el form lo
 * que el backend rebota con 400. `modelo` mide `.trim().max()` directo: `trim()`
 * nunca agranda, así que no hace falta un `.refine()` separado.
 */
export const modeloEquipoSchema = z.object({
  marca: z
    .string()
    .trim()
    .min(1, "La marca es requerida")
    .refine(
      (valor) => normalizarMarca(valor).length <= MODELO_EQUIPO_MARCA_MAX_LENGTH,
      mensajeDemasiadoLargo("La marca", MODELO_EQUIPO_MARCA_MAX_LENGTH),
    ),
  modelo: z
    .string()
    .trim()
    .min(1, "El modelo es requerido")
    .max(MODELO_EQUIPO_MODELO_MAX_LENGTH, mensajeDemasiadoLargo("El modelo", MODELO_EQUIPO_MODELO_MAX_LENGTH)),
});
export type ModeloEquipoFormValues = z.infer<typeof modeloEquipoSchema>;

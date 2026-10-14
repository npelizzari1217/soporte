import { describe, it, expect } from "vitest";
import { crearTareaSchema, crearTicketSchema, editarTicketSchema, TAREA_DESCRIPCION_MAX_LENGTH } from "./schemas";
import { crearReparacionSchema } from "@/features/edilicia/schemas";
import { crearTicketSoporteSchema } from "@/features/equipos/schemas";
import { TICKET_TITULO_MAX_LENGTH } from "@/shared/lib/limites-ticket";

/**
 * Espejo del tope de largo de `titulo`. La autoridad es
 * `TICKET_TITULO_MAX_LENGTH` en `TicketEntity` (backend), que a su vez espeja
 * `Ticket.titulo VarChar(255)`.
 *
 * Los cuatro schemas viven en tres features distintas pero apuntan a la MISMA
 * columna, así que se prueban juntos: si mañana uno se queda atrás, el hueco
 * aparece acá y no en el formulario de un usuario.
 *
 * Se asserta sobre el ISSUE del campo `titulo` y no sobre el éxito global del
 * parseo: así el test no se rompe si un schema suma otro campo requerido, y
 * sigue probando lo único que le toca probar.
 */
describe.each([
  ["crearTicketSchema", crearTicketSchema],
  ["editarTicketSchema", editarTicketSchema],
  ["crearReparacionSchema", crearReparacionSchema],
  ["crearTicketSoporteSchema", crearTicketSoporteSchema],
])("%s — tope de largo de título (espejo del backend)", (_nombre, schema) => {
  function tieneErrorDeTitulo(titulo: string): boolean {
    const result = schema.safeParse({ titulo });
    return !result.success && result.error.issues.some((i) => i.path[0] === "titulo");
  }

  it(`rechaza un título de más de ${TICKET_TITULO_MAX_LENGTH} caracteres`, () => {
    expect(tieneErrorDeTitulo("A".repeat(TICKET_TITULO_MAX_LENGTH + 1))).toBe(true);
  });

  // Hermano invertido: en el límite exacto NO hay error de título. Sin este
  // caso, un schema que rechazara CUALQUIER título pasaría el test de arriba.
  it(`acepta un título de exactamente ${TICKET_TITULO_MAX_LENGTH} caracteres`, () => {
    expect(tieneErrorDeTitulo("A".repeat(TICKET_TITULO_MAX_LENGTH))).toBe(false);
  });
});

/**
 * Espejo de `CrearTareaTicketBodyDto` (odd/tareas-con-tecnico, T6): al menos un
 * carácter visible (`/\S/`) y hasta 255, sobre el texto sin recortar.
 */
describe("crearTareaSchema", () => {
  it.each([
    ["vacía", "", false],
    ["de puros espacios", "   ", false],
    ["de un carácter visible", "x", true],
    ["en el tope exacto", "a".repeat(TAREA_DESCRIPCION_MAX_LENGTH), true],
    ["que pasa el tope", "a".repeat(TAREA_DESCRIPCION_MAX_LENGTH + 1), false],
  ])("una descripción %s → válida=%s", (_caso, descripcion, valida) => {
    expect(crearTareaSchema.safeParse({ descripcion }).success).toBe(valida);
  });

  it("el tope coincide con el ancho de la columna", () => {
    expect(TAREA_DESCRIPCION_MAX_LENGTH).toBe(255);
  });
});

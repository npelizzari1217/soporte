/**
 * ciclos-master-tenant Fase 4 [Tarea 1.5, PR1] — Verificación del ValidationPipe
 * global contra los 4 HTTP DTO de creación (tickets/compras/reparaciones/equipos).
 *
 * Hallazgo (design-fase4.md, R3): `CreateTicketHttpDto`, `CreateTicketCompraHttpDto`,
 * `CreateTicketEdilicioHttpDto` y `CreateTicketSoporteHttpDto` son INTERFACES
 * planas de TypeScript (no clases class-validator, ver comentario en
 * `tickets.dto.ts`: "Siguiendo el patrón de auth.dto.ts: interfaces planas").
 * Las interfaces TS se borran en compilación → en runtime, Nest resuelve el
 * `metatype` del parámetro a `Object`. `ValidationPipe.toValidate()` retorna
 * `false` para `metatype === Object` y el pipe SALTEA la validación/whitelist
 * por completo (no llama a `class-validator`, no hace stripping).
 *
 * Consecuencia (confirma R3, no bloqueante): remover `cicloId` del contrato
 * TS de estos DTOs en las Fases 2-5 es un cambio de CONTRATO/documentación,
 * no de comportamiento HTTP — un `cicloId` sobrante en el body NUNCA dispara
 * 400 (el pipe ni lo mira), y tras remover el campo del tipo, el controller/
 * use case simplemente dejan de leerlo (queda ignorado, no rechazado).
 *
 * Este test NO cambia el pipe (`{ whitelist: true, transform: true }` en
 * `app.module.ts` queda intacto) — solo documenta y fija el comportamiento
 * actual para que una regresión futura (ej. agregar `forbidNonWhitelisted`)
 * lo detecte.
 *
 * Ref design: openspec/changes/ciclos-master-tenant/design-fase4.md ADR-3, R3
 * Tarea: 1.5 (Fase 4, PR1)
 */
import { ValidationPipe, ArgumentMetadata } from '@nestjs/common';

// Misma config que se registra como APP_PIPE en AppModule (ver app.module.ts).
function makePipe(): ValidationPipe {
  return new ValidationPipe({ whitelist: true, transform: true });
}

describe('ValidationPipe global — DTOs de creación tickets/compras/reparaciones/equipos', () => {
  it('metatype Object (interface TS borrada en runtime) → saltea validación/whitelist por completo', async () => {
    // metatype: Object es exactamente lo que Nest resuelve para un parámetro
    // tipado con una interface TS (CreateTicketHttpDto y análogos).
    const metadata: ArgumentMetadata = { type: 'body', metatype: Object, data: '' };

    const payloadConCicloIdSobrante = {
      titulo: 'Ticket de prueba',
      tipoId: 'tipo-1',
      prioridadId: 'prioridad-1',
      solicitanteId: 'user-1',
      // cicloId sobrante: hoy existe en el tipo; tras Fase 4 se remueve del
      // contrato pero un cliente desactualizado podría seguir mandándolo.
      cicloId: 'un-cliente-desactualizado-lo-manda-igual',
    };

    const result = await makePipe().transform(payloadConCicloIdSobrante, metadata);

    // Sin BadRequestException y SIN stripping: el payload pasa tal cual.
    expect(result).toEqual(payloadConCicloIdSobrante);
  });
});

/**
 * CreateClienteDto — body de la request POST /clientes.
 * DTO de presentación: recibe datos del HTTP request y los pasa al use case.
 *
 * Validación con class-validator se puede agregar en fases futuras.
 * Por ahora es un objeto plano tipado.
 *
 * Tarea: 1.D.2
 */
export class CreateClienteDto {
  nombre!: string;
  razonSocial!: string | null;
  cuit!: string | null;
  dbName!: string;
}

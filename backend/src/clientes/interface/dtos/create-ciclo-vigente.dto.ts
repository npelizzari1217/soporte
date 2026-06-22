/**
 * CreateCicloVigenteDto — body de la request POST /ciclos-vigentes.
 *
 * Las fechas se reciben como string ISO 8601 (YYYY-MM-DD) y se convierten
 * a Date en el controller antes de pasarlas al use case.
 *
 * Tarea: 1.D.2
 */
export class CreateCicloVigenteDto {
  nombre!: string;
  fechaInicio!: string;
  fechaFin!: string;
  activo!: boolean;
}

import { ITicketRepository } from '../ports/i-ticket.repository';

/**
 * Mapa de codigo del tipo de ticket → prefijo legible para el número.
 *
 * Ref spec: [SPEC:tickets-core/Numeración legible de tickets]
 * "el prefijo MUST derivarse del codigo del tipo de ticket:
 *   SOP (SOPORTE), COM (COMPRAS), EDI (EDILICIA)"
 */
export const PREFIJO_POR_CODIGO: Readonly<Record<string, string>> = {
  SOPORTE: 'SOP',
  COMPRAS: 'COM',
  EDILICIA: 'EDI',
};

/**
 * NumeradorTicket — servicio de dominio para generación del número legible.
 *
 * Genera números con formato: {PREFIJO}-{AÑO}-{SECUENCIA_5_DIGITOS}
 * Ejemplo: SOP-2026-00042
 *
 * La secuencia es LOCAL al tenant y al tipo de ticket (no global).
 * Se obtiene consultando ITicketRepository.findLastSecuencia(tipoId, anio),
 * que retorna el último número de secuencia registrado (0 si no hay tickets previos).
 *
 * La parte pura de formateo (generarFormato) es testeable sin Prisma.
 * El servicio completo (generarNumero) depende del puerto ITicketRepository
 * y es mockeado en tests unitarios.
 *
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: [SPEC:tickets-core/Numeración legible de tickets]
 * Tarea: 3.B.4
 */
export class NumeradorTicket {
  constructor(private readonly ticketRepository: Pick<ITicketRepository, 'findLastSecuencia'>) {}

  /**
   * Genera el número legible para el próximo ticket.
   *
   * Pasos:
   * 1. Resuelve el prefijo a partir de tipoCodigo.
   * 2. Consulta el último número de secuencia LOCAL (por tipo y año).
   * 3. Incrementa y formatea con padding a 5 dígitos.
   *
   * @param tipoId   UUID del tipo_ticket (FK en la tabla tickets).
   * @param tipoCodigo Codigo semántico del tipo: 'SOPORTE' | 'COMPRAS' | 'EDILICIA'.
   * @param anio     Año del ciclo vigente o año de creación del ticket.
   * @returns Número legible, ej. "SOP-2026-00042".
   * @throws Error si tipoCodigo no tiene un prefijo registrado.
   */
  async generarNumero(tipoId: string, tipoCodigo: string, anio: number): Promise<string> {
    const prefijo = PREFIJO_POR_CODIGO[tipoCodigo];
    if (!prefijo) {
      throw new Error(
        `NumeradorTicket: codigo de tipo desconocido "${tipoCodigo}". ` +
          `Valores válidos: ${Object.keys(PREFIJO_POR_CODIGO).join(', ')}`,
      );
    }

    const lastSecuencia = await this.ticketRepository.findLastSecuencia(tipoId, anio);
    const nextSecuencia = lastSecuencia + 1;

    return NumeradorTicket.generarFormato(prefijo, anio, nextSecuencia);
  }

  /**
   * Formatea el número legible a partir de sus partes.
   * Función pura — testeable sin repositorio ni Prisma.
   *
   * @param prefijo  Prefijo del tipo: 'SOP', 'COM', 'EDI'.
   * @param anio     Año de 4 dígitos.
   * @param secuencia Número de secuencia LOCAL (ya incrementado).
   * @returns Número formateado, ej. "SOP-2026-00042".
   */
  static generarFormato(prefijo: string, anio: number, secuencia: number): string {
    const secuenciaStr = String(secuencia).padStart(5, '0');
    return `${prefijo}-${anio}-${secuenciaStr}`;
  }
}

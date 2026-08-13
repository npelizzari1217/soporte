import { Result } from '../../../shared/domain/result';
import { SecuenciaAgotadaError, TipoTicketDesconocidoError } from '../errors/tickets.errors';
import { ITicketRepository } from '../ports/i-ticket.repository';

/**
 * Mapa base de `codigo` de tipo de ticket → prefijo legible (ADR-4).
 * Tipos custom (fuera de este mapa) derivan su prefijo dinámicamente en
 * `derivarPrefijo` (primeras 3 letras alfanuméricas en mayúscula).
 */
const PREFIJO_BASE: Readonly<Record<string, string>> = {
  SOPORTE: 'SOP',
  EDILICIA: 'EDI',
  MANTENIMIENTO: 'MAN',
};

/**
 * NumeradorTicket — servicio de dominio para la generación del `numero`
 * legible del ticket.
 *
 * Formato: `{PREFIJO}-{AÑO}-{SECUENCIA_5_DIGITOS}` (ej. `SOP-2026-00042`).
 * La secuencia es LOCAL al tenant+tipo+año (no global), reiniciada por año
 * (T5). Se obtiene vía `ITicketRepository.findLastSecuencia`, que retorna
 * 0 si no hay tickets previos de ese tipo en ese año.
 *
 * `generarFormato` y `derivarPrefijo` son funciones puras, testeables sin
 * Prisma. `generarNumero` depende del puerto `ITicketRepository` (mockeado
 * en tests unitarios). Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: sdd/tickets-core/spec T5. Ref design: ADR-4, "Firmas TS clave".
 * Tarea: T3.1, T3.2.
 */
export class NumeradorTicket {
  constructor(private readonly ticketRepository: Pick<ITicketRepository, 'findLastSecuencia'>) {}

  /**
   * Genera el número legible para el próximo ticket del tipo/año dados.
   *
   * Pasos:
   * 1. Deriva el prefijo del `tipoCodigo` (mapa base o fallback custom).
   *    Si no se puede derivar un prefijo usable (código degenerado, sin
   *    caracteres alfanuméricos) → `TipoTicketDesconocidoError`, sin
   *    consultar el repositorio (fail-fast).
   * 2. Consulta la última secuencia LOCAL (por tipo y año).
   * 3. Verifica que la secuencia incrementada no supere 99999 (overflow
   *    guard) → `SecuenciaAgotadaError` si la supera.
   * 4. Formatea con padding a 5 dígitos.
   *
   * @param tipoId     UUID del tipo_ticket (FK en la tabla tickets).
   * @param tipoCodigo Código semántico del tipo (ej. "SOPORTE", o un código custom).
   * @param anio       Año del ciclo vigente o de creación del ticket.
   */
  async generarNumero(
    tipoId: string,
    tipoCodigo: string,
    anio: number,
  ): Promise<Result<string, TipoTicketDesconocidoError | SecuenciaAgotadaError>> {
    const prefijo = NumeradorTicket.derivarPrefijo(tipoCodigo);
    if (!prefijo) {
      return Result.fail(new TipoTicketDesconocidoError(tipoCodigo));
    }

    const lastSecuencia = await this.ticketRepository.findLastSecuencia(tipoId, anio);
    const nextSecuencia = lastSecuencia + 1;

    if (nextSecuencia > 99999) {
      return Result.fail(new SecuenciaAgotadaError(tipoCodigo, anio));
    }

    return Result.ok(NumeradorTicket.generarFormato(prefijo, anio, nextSecuencia));
  }

  /**
   * Formatea el número legible a partir de sus partes. Función pura.
   *
   * @param prefijo   Prefijo del tipo (ej. "SOP").
   * @param anio      Año de 4 dígitos.
   * @param secuencia Número de secuencia LOCAL (ya incrementado). Sin cap
   *                  superior acá: el overflow guard vive en `generarNumero`.
   */
  static generarFormato(prefijo: string, anio: number, secuencia: number): string {
    return `${prefijo}-${anio}-${String(secuencia).padStart(5, '0')}`;
  }

  /**
   * Deriva el prefijo del `codigo` del tipo de ticket (ADR-4). Función
   * pura, sin efectos secundarios.
   *
   * - Si `codigo` está en el mapa base ({@link PREFIJO_BASE}) → ese
   *   prefijo fijo.
   * - Si no, deriva las primeras 3 letras/dígitos alfanuméricos del
   *   `codigo` en mayúscula (tipos custom del tenant).
   * - Si `codigo` no tiene ningún caracter alfanumérico (string vacío o
   *   solo símbolos), retorna string vacío — caso degenerado que
   *   `generarNumero` traduce a `TipoTicketDesconocidoError`.
   *
   * @param codigo Código semántico del tipo de ticket.
   */
  static derivarPrefijo(codigo: string): string {
    const base = PREFIJO_BASE[codigo];
    if (base) {
      return base;
    }
    const alfanumerico = codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return alfanumerico.slice(0, 3);
  }
}

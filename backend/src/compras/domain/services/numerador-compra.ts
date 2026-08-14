import { Result } from '../../../shared/domain/result';
import { NumeradorCompraAgotadoError } from '../errors/compras.errors';
import { ICompraRepository } from '../ports/i-compra.repository';

/**
 * NumeradorCompra — servicio de dominio para la generación del `numero`
 * legible de la compra (ADR-C5).
 *
 * Formato: `COM-{AÑO}-{SECUENCIA_5_DIGITOS}` (ej. `COM-2026-00042`). A
 * diferencia de `NumeradorTicket`, el prefijo es SIEMPRE `COM` — no hay
 * derivación por tipo (`compras` no tiene el concepto de "tipo" que sí
 * tienen los tickets), así que no existe un equivalente a
 * `derivarPrefijo`/`TipoTicketDesconocidoError` en este servicio.
 *
 * La secuencia es LOCAL al tenant+año (no global ni por tipo), reiniciada
 * por año. Se obtiene vía `ICompraRepository.findLastSecuencia`, que
 * retorna 0 si no hay compras previas en ese año.
 *
 * `generarFormato` es función pura, testeable sin Prisma. `generarNumero`
 * depende del puerto `ICompraRepository` (mockeado en tests unitarios). Sin
 * imports de Prisma ni NestJS — dominio puro, mismo patrón que
 * `NumeradorTicket` (`tickets/domain/services/numerador-ticket.service.ts`).
 *
 * El advisory lock que serializa la concurrencia sobre `findLastSecuencia`
 * vive en INFRAESTRUCTURA (`PrismaCompraRepository.findLastSecuencia`), NO
 * acá — este servicio es dominio puro y no conoce Postgres. Ver el JSDoc de
 * `PrismaCompraRepository.findLastSecuencia` para el detalle de la garantía
 * de concurrencia (ADR-C5).
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1 (formato `COM-{anio}-{00000}`).
 * Ref design: ADR-C5. Ref tasks: PR-11.
 */
export class NumeradorCompra {
  constructor(private readonly compraRepository: Pick<ICompraRepository, 'findLastSecuencia'>) {}

  /**
   * Genera el número legible para la próxima compra del año dado.
   *
   * Pasos:
   * 1. Consulta la última secuencia LOCAL del año (`findLastSecuencia`).
   * 2. Verifica que la secuencia incrementada no supere 99999 (overflow
   *    guard) → `NumeradorCompraAgotadoError` si la supera.
   * 3. Formatea con padding a 5 dígitos.
   *
   * @param anio Año del ciclo vigente o de creación de la compra.
   */
  async generarNumero(anio: number): Promise<Result<string, NumeradorCompraAgotadoError>> {
    const lastSecuencia = await this.compraRepository.findLastSecuencia(anio);
    const nextSecuencia = lastSecuencia + 1;

    if (nextSecuencia > 99999) {
      return Result.fail(new NumeradorCompraAgotadoError(anio));
    }

    return Result.ok(NumeradorCompra.generarFormato(anio, nextSecuencia));
  }

  /**
   * Formatea el número legible a partir de sus partes. Función pura.
   *
   * @param anio      Año de 4 dígitos.
   * @param secuencia Número de secuencia LOCAL (ya incrementado). Sin cap
   *                  superior acá: el overflow guard vive en `generarNumero`.
   */
  static generarFormato(anio: number, secuencia: number): string {
    return `COM-${anio}-${String(secuencia).padStart(5, '0')}`;
  }
}

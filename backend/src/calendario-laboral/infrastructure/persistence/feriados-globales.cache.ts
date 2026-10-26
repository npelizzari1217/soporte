import { Injectable, Optional } from '@nestjs/common';

/** Vigencia de la copia en memoria: red de seguridad para escrituras que no pasan por la API. */
export const FERIADOS_GLOBALES_TTL_MS = 5 * 60 * 1000;

/**
 * FeriadosGlobalesCache — copia en memoria de las fechas de los feriados globales de master
 * (odd/tasks/jd-tiempo-tecnico.md, T4, JD-B-002).
 *
 * Por qué existe: los feriados se leen al cerrar un tramo del técnico y al calcular el SLA, a veces
 * dentro de la transacción del ticket en la base del tenant. Ir a master en ese momento suma una
 * consulta a otra base mientras la fila del ticket está bloqueada y corre el timeout de la
 * transacción. Los feriados globales son los mismos para todos los tenants y casi nunca cambian.
 *
 * `PrismaFeriadoGlobalRepository` la invalida al crear, editar o borrar un feriado, así que un cambio
 * hecho por la API cuenta en la siguiente lectura. El TTL solo cubre lo que se escribe por fuera
 * (scripts, SQL a mano): eso tarda hasta `FERIADOS_GLOBALES_TTL_MS` en verse.
 *
 * Varias lecturas simultáneas con la copia vencida comparten una sola consulta. Una consulta que
 * falla no queda guardada: la siguiente lectura reintenta.
 */
@Injectable()
export class FeriadosGlobalesCache {
  private entrada: { readonly fechas: Promise<Date[]>; readonly cargadaAt: number } | null = null;

  /** @param ahora Reloj en ms; Nest no lo provee, así que en la app es `Date.now`. */
  constructor(@Optional() private readonly ahora: () => number = () => Date.now()) {}

  /**
   * Devuelve las fechas guardadas o las carga si no hay copia vigente.
   *
   * @param cargar Consulta a master; solo se llama sin copia vigente.
   * @returns Las fechas de los feriados globales.
   */
  obtener(cargar: () => Promise<Date[]>): Promise<Date[]> {
    const ahora = this.ahora();
    if (this.entrada !== null && ahora - this.entrada.cargadaAt < FERIADOS_GLOBALES_TTL_MS) {
      return this.entrada.fechas;
    }
    const entrada = { fechas: cargar(), cargadaAt: ahora };
    this.entrada = entrada;
    entrada.fechas.catch(() => {
      // Solo se descarta si sigue siendo la entrada vigente: una invalidación o una carga posterior
      // ya la reemplazó. El error lo recibe quien llamó a `obtener`.
      if (this.entrada === entrada) this.entrada = null;
    });
    return entrada.fechas;
  }

  /** Descarta la copia: la próxima lectura va a master. */
  invalidar(): void {
    this.entrada = null;
  }
}

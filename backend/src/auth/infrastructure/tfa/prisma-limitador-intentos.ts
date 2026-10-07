import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { ILimitadorIntentos, ReservaIntento } from '../../domain/ports/limitador-intentos.port';
import { LIMITADOR_MAX_INTENTOS, LIMITADOR_VENTANA_MS } from '../../domain/tfa/tfa.constants';

const PURGA_CADA_MS = 60 * 60 * 1000;

/**
 * Limitador sobre `auth_intentos_fallidos` (master). La reserva condicional es un solo
 * `INSERT ... ON CONFLICT DO UPDATE ... WHERE`: el lock de fila serializa los concurrentes
 * y como maximo `LIMITADOR_MAX_INTENTOS` pasan por ventana (ADR-6).
 */
@Injectable()
export class PrismaLimitadorIntentos implements ILimitadorIntentos {
  private ultimaPurga = 0;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly ahora: () => number = Date.now,
  ) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async reservar(clave: string): Promise<ReservaIntento | null> {
    await this.purgarSiCorresponde();
    const filas = await this.client.$queryRaw<{ ventana_inicio: Date }[]>`
      INSERT INTO auth_intentos_fallidos AS t (clave, fallos, ventana_inicio)
      VALUES (${clave}, 1, now())
      ON CONFLICT (clave) DO UPDATE SET
        fallos = CASE WHEN t.ventana_inicio <= now() - ${LIMITADOR_VENTANA_MS}::double precision * interval '1 millisecond'
                      THEN 1 ELSE t.fallos + 1 END,
        ventana_inicio = CASE WHEN t.ventana_inicio <= now() - ${LIMITADOR_VENTANA_MS}::double precision * interval '1 millisecond'
                              THEN now() ELSE t.ventana_inicio END
      WHERE t.ventana_inicio <= now() - ${LIMITADOR_VENTANA_MS}::double precision * interval '1 millisecond'
         OR t.fallos < ${LIMITADOR_MAX_INTENTOS}::int
      RETURNING ventana_inicio`;
    return filas.length === 0 ? null : { clave, ventanaInicio: filas[0].ventana_inicio };
  }

  async liberar(clave: string): Promise<void> {
    await this.client.$executeRaw`DELETE FROM auth_intentos_fallidos WHERE clave = ${clave}`;
  }

  async devolver(reserva: ReservaIntento): Promise<void> {
    // Timestamptz guarda microsegundos y Date solo milisegundos: se compara truncado.
    await this.client.$executeRaw`
      UPDATE auth_intentos_fallidos SET fallos = fallos - 1
      WHERE clave = ${reserva.clave} AND fallos > 0
        AND date_trunc('milliseconds', ventana_inicio) = ${reserva.ventanaInicio}::timestamptz`;
  }

  /** Como maximo una vez por hora por proceso; un fallo de limpieza no afecta al login. */
  private async purgarSiCorresponde(): Promise<void> {
    const ahora = this.ahora();
    if (ahora - this.ultimaPurga < PURGA_CADA_MS) return;
    this.ultimaPurga = ahora;
    try {
      await this.client
        .$executeRaw`DELETE FROM auth_intentos_fallidos WHERE ventana_inicio < now() - interval '1 day'`;
    } catch {
      this.ultimaPurga = 0;
    }
  }
}

import { IEmailSender } from '../../shared/domain/ports/i-email-sender';
import { ILogger } from '../../shared/domain/ports/i-logger.port';
import { desplazarAArgentina } from '../../shared/domain/zona-horaria-argentina';
import { ResumenSaturacion } from '../../shared/infrastructure/saturacion/monitor-saturacion';

/** Quiénes reciben los avisos de operación: los ROOT activos. */
export interface IDestinatariosRoot {
  emailsDeRootActivos(): Promise<string[]>;
}

/** Token de inyección de `IDestinatariosRoot`. */
export const DESTINATARIOS_ROOT = Symbol('DESTINATARIOS_ROOT');

const dosDigitos = (n: number): string => String(n).padStart(2, '0');

function hora(instante: Date): string {
  const local = desplazarAArgentina(instante);
  return `${dosDigitos(local.getUTCHours())}:${dosDigitos(local.getUTCMinutes())}`;
}

function fecha(instante: Date): string {
  const local = desplazarAArgentina(instante);
  return `${dosDigitos(local.getUTCDate())}/${dosDigitos(local.getUTCMonth() + 1)}/${local.getUTCFullYear()}`;
}

/**
 * AvisarSaturacionARoot — correo a cada ROOT activo cuando la base se satura de forma repetida
 * (odd/saturacion-conexiones, S3). Lo dispara `MonitorSaturacion` (5 en 10 minutos, uno por hora).
 *
 * Sin cuenta SMTP del sistema, o sin ROOT activos, el aviso queda completo en el log: nunca se
 * pierde en silencio.
 */
export class AvisarSaturacionARoot {
  /**
   * @param destinatarios Fuente de los ROOT activos.
   * @param emailSender Cuenta SMTP del sistema, o `null` si no está configurada.
   * @param logger Donde queda el aviso cuando no puede salir por correo.
   */
  constructor(
    private readonly destinatarios: IDestinatariosRoot,
    private readonly emailSender: IEmailSender | null,
    private readonly logger: Pick<ILogger, 'error'>,
  ) {}

  /** @param resumen Episodio que disparó el aviso. */
  async execute(resumen: ResumenSaturacion): Promise<void> {
    const detalle =
      `eventos=${resumen.eventos} | servidor=${resumen.porOrigen.servidor} | pool=${resumen.porOrigen.pool} | ` +
      `transaccion=${resumen.porOrigen.transaccion} | desde=${resumen.desde.toISOString()} | ` +
      `hasta=${resumen.hasta.toISOString()}`;
    if (!this.emailSender) {
      this.logger.error(`ALERTA_SATURACION_SIN_SMTP | ${detalle}`);
      return;
    }
    const emails = await this.destinatarios.emailsDeRootActivos();
    if (emails.length === 0) {
      this.logger.error(`ALERTA_SATURACION_SIN_DESTINATARIOS | ${detalle}`);
      return;
    }

    const subject = `Soporte: la base de datos se saturó ${resumen.eventos} veces en 10 minutos`;
    const text =
      `Entre las ${hora(resumen.desde)} y las ${hora(resumen.hasta)} del ${fecha(resumen.desde)} ` +
      `(hora argentina) hubo ${resumen.eventos} pedidos que no consiguieron conexión a la base de ` +
      `datos, y los usuarios vieron el aviso de sistema saturado.\n\n` +
      `Origen: ${resumen.porOrigen.servidor} por el servidor de base de datos sin conexiones libres, ` +
      `${resumen.porOrigen.pool} por el tope de conexiones de soporte y ` +
      `${resumen.porOrigen.transaccion} por transacciones que no pudieron empezar.\n\n` +
      'Qué revisar: las conexiones en uso del servidor (max_connections), el tope de conexiones ' +
      'de soporte y los otros sistemas del VPS. El detalle de cada caso está en el log del backend ' +
      '(buscar SATURACION_CONEXIONES).\n\n' +
      'No se envía otro aviso por esto durante una hora.';
    for (const to of emails) {
      await this.emailSender.send({ to, subject, text });
    }
  }
}

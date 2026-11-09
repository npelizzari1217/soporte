/**
 * [UNIT] Correo a ROOT cuando la saturación de la base se repite (odd/saturacion-conexiones, S3).
 */
import { EmailMessage } from '../../shared/domain/ports/i-email-sender';
import { ResumenSaturacion } from '../../shared/infrastructure/saturacion/monitor-saturacion';
import { AvisarSaturacionARoot } from './avisar-saturacion-a-root';

const RESUMEN: ResumenSaturacion = {
  eventos: 7,
  desde: new Date('2026-11-09T15:02:00.000Z'),
  hasta: new Date('2026-11-09T15:09:30.000Z'),
  porOrigen: { servidor: 2, pool: 5, transaccion: 0 },
};

function crear(opciones: { conSmtp: boolean; roots?: string[] }) {
  const enviados: EmailMessage[] = [];
  const logger = { error: vi.fn() };
  const caso = new AvisarSaturacionARoot(
    { emailsDeRootActivos: async () => opciones.roots ?? ['ana@sesitec.net', 'luis@sesitec.net'] },
    opciones.conSmtp ? { send: async (msg: EmailMessage) => void enviados.push(msg) } : null,
    logger,
  );
  return { caso, enviados, logger };
}

describe('AvisarSaturacionARoot', () => {
  it('manda un correo a cada ROOT activo con el detalle del episodio en hora argentina', async () => {
    const { caso, enviados } = crear({ conSmtp: true });

    await caso.execute(RESUMEN);

    expect(enviados.map((m) => m.to)).toEqual(['ana@sesitec.net', 'luis@sesitec.net']);
    expect(enviados[0].subject).toBe('Soporte: la base de datos se saturó 7 veces en 10 minutos');
    expect(enviados[0].text).toBe(
      'Entre las 12:02 y las 12:09 del 09/11/2026 (hora argentina) hubo 7 pedidos que no ' +
        'consiguieron conexión a la base de datos, y los usuarios vieron el aviso de sistema saturado.\n\n' +
        'Origen: 2 por el servidor de base de datos sin conexiones libres, 5 por el tope de conexiones ' +
        'de soporte y 0 por transacciones que no pudieron empezar.\n\n' +
        'Qué revisar: las conexiones en uso del servidor (max_connections), el tope de conexiones ' +
        'de soporte y los otros sistemas del VPS. El detalle de cada caso está en el log del backend ' +
        '(buscar SATURACION_CONEXIONES).\n\n' +
        'No se envía otro aviso por esto durante una hora.',
    );
  });

  it('sin cuenta SMTP del sistema, deja el aviso completo en el log y no falla', async () => {
    const { caso, logger } = crear({ conSmtp: false });

    await caso.execute(RESUMEN);

    expect(logger.error).toHaveBeenCalledWith(
      'ALERTA_SATURACION_SIN_SMTP | eventos=7 | servidor=2 | pool=5 | transaccion=0 | ' +
        'desde=2026-11-09T15:02:00.000Z | hasta=2026-11-09T15:09:30.000Z',
    );
  });

  it('sin ROOT activos, lo deja en el log en vez de no avisar a nadie en silencio', async () => {
    const { caso, enviados, logger } = crear({ conSmtp: true, roots: [] });

    await caso.execute(RESUMEN);

    expect(enviados).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('ALERTA_SATURACION_SIN_DESTINATARIOS'),
    );
  });
});

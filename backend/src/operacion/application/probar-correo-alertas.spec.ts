/**
 * [UNIT] Correo de prueba de las alertas de operación (odd/saturacion-conexiones, S3): confirma,
 * antes de una saturación real, que la cuenta SMTP del sistema conecta y que el correo llega.
 */
import { EmailMessage } from '../../shared/domain/ports/i-email-sender';
import { SmtpConfig } from '../../notificaciones/infrastructure/email/smtp-email-sender';
import { ProbarCorreoAlertas } from './probar-correo-alertas';

const SMTP: SmtpConfig = {
  host: 'smtp.sesitec.net',
  port: 587,
  user: 'alertas@sesitec.net',
  pass: 'secreto',
  from: 'Soporte <alertas@sesitec.net>',
  secure: false,
};

function crear(opciones: {
  smtp?: SmtpConfig | null;
  verificacion?: { ok: boolean; motivo: string | null };
  roots?: string[];
}) {
  const enviados: EmailMessage[] = [];
  const verify = vi.fn().mockResolvedValue(opciones.verificacion ?? { ok: true, motivo: null });
  const caso = new ProbarCorreoAlertas(
    opciones.smtp === undefined ? SMTP : opciones.smtp,
    { verify },
    { send: async (msg: EmailMessage) => void enviados.push(msg) },
    { emailsDeRootActivos: async () => opciones.roots ?? ['ana@sesitec.net', 'luis@sesitec.net'] },
  );
  return { caso, enviados, verify };
}

describe('ProbarCorreoAlertas', () => {
  it('con SMTP que conecta, manda un correo de prueba a cada ROOT activo y dice a quiénes', async () => {
    const { caso, enviados, verify } = crear({});

    expect(await caso.execute()).toEqual({
      ok: true,
      destinatarios: ['ana@sesitec.net', 'luis@sesitec.net'],
    });
    expect(verify).toHaveBeenCalledWith({
      host: 'smtp.sesitec.net',
      port: 587,
      user: 'alertas@sesitec.net',
      password: 'secreto',
      secure: false,
    });
    expect(enviados.map((m) => m.to)).toEqual(['ana@sesitec.net', 'luis@sesitec.net']);
    expect(enviados[0].subject).toBe('Soporte: correo de prueba de las alertas de operación');
    expect(enviados[0].text).toBe(
      'Este es un correo de prueba. Si lo recibe, las alertas de operación de soporte (por ejemplo, ' +
        'cuando la base de datos se satura) le van a llegar a esta dirección. No hace falta responder.',
    );
  });

  it('sin cuenta SMTP del sistema, lo dice y no intenta nada', async () => {
    const { caso, enviados, verify } = crear({ smtp: null });

    expect(await caso.execute()).toEqual({
      ok: false,
      motivo: 'Falta configurar la cuenta de correo del sistema (SMTP_*) en el servidor.',
    });
    expect(verify).not.toHaveBeenCalled();
    expect(enviados).toEqual([]);
  });

  it('si el servidor de correo rechaza la conexión, devuelve el motivo saneado y no envía', async () => {
    const { caso, enviados } = crear({
      verificacion: { ok: false, motivo: 'Credenciales rechazadas por el servidor' },
    });

    expect(await caso.execute()).toEqual({
      ok: false,
      motivo:
        'El servidor de correo no aceptó la conexión: Credenciales rechazadas por el servidor.',
    });
    expect(enviados).toEqual([]);
  });

  it('sin ROOT activos, lo dice en vez de reportar un envío a nadie', async () => {
    const { caso, enviados } = crear({ roots: [] });

    expect(await caso.execute()).toEqual({
      ok: false,
      motivo: 'No hay usuarios ROOT activos que reciban las alertas.',
    });
    expect(enviados).toEqual([]);
  });
});

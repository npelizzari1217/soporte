/**
 * 4.6 TEST — Unit tests de templateEncuestaSatisfaccion (RED → GREEN).
 *
 * Función pura: sin I/O, sin `process.env`. `appBaseUrl` se inyecta como
 * parámetro (mismo criterio que `templates/email-templates.ts` de
 * `notificaciones/domain`). El link apunta a `/encuesta/{token}` (ADR-C7 del
 * design — la página pública, no `/tickets/:id`).
 *
 * Ref spec: sdd/csat/spec, Requirement "Emisión de token al cierre del
 * ticket". Ref design: flujo de datos, "link = APP_BASE_URL + /encuesta/{token}".
 * Tarea: 4.6.
 */
import { templateEncuestaSatisfaccion } from './encuesta-email.template';

const DATOS_BASE = {
  numero: 'SOP-2026-00042',
  titulo: 'La impresora no imprime',
  token: 'token-crudo-abc123',
  appBaseUrl: 'https://soporte.miempresa.com',
};

describe('templateEncuestaSatisfaccion', () => {
  it('incluye el numero del ticket y el link a la encuesta pública', () => {
    const msg = templateEncuestaSatisfaccion(DATOS_BASE);

    expect(msg.subject).toContain('SOP-2026-00042');
    expect(msg.text).toContain('https://soporte.miempresa.com/encuesta/token-crudo-abc123');
    expect(msg.html).toContain('https://soporte.miempresa.com/encuesta/token-crudo-abc123');
  });

  it('NO incluye la descripción del ticket (solo numero/titulo)', () => {
    const msg = templateEncuestaSatisfaccion(DATOS_BASE);
    expect(msg.text).not.toContain('descripcion');
  });

  it('es una función pura: dos llamadas con los mismos datos producen el mismo resultado', () => {
    const a = templateEncuestaSatisfaccion(DATOS_BASE);
    const b = templateEncuestaSatisfaccion(DATOS_BASE);
    expect(a).toEqual(b);
  });
});

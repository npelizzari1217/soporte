/**
 * N5 [UNIT] — RED→GREEN: plantillas de email en TS puro (N6) — subject/text
 * por tipo de evento (cambioEstado, comentarioPublico, slaVencido), con
 * numero+titulo del ticket y link `${appBaseUrl}/tickets/:id`.
 *
 * Ref spec: sdd/premium/spec N6. Ref design: ADR-P9. Tarea: N5/N6.
 */
import {
  templateCambioEstado,
  templateComentarioPublico,
  templateEsperandoCliente,
  templateSlaVencido,
  templatePreventivoGenerado,
} from './email-templates';

const DATOS_BASE = {
  numero: 'SOP-2026-00042',
  titulo: 'La impresora no imprime',
  ticketId: 'ticket-abc',
  appBaseUrl: 'https://soporte.miempresa.com',
};

/**
 * El `titulo` lo escribe un usuario final: es el único dato de estas plantillas
 * que puede traer markup. Interpolado crudo en el `html`, un `<script>` o
 * simplemente un `&` roto llega al cliente de correo del destinatario.
 *
 * El `text` NO se escapa: es texto plano, y escaparlo le mostraría al usuario
 * `&lt;` donde escribió `<`.
 */
const TITULO_CON_MARKUP = '<script>alert(1)</script> Ficha & Cía "urgente"';

describe.each([
  [
    'templateCambioEstado',
    () =>
      templateCambioEstado({
        ...DATOS_BASE,
        titulo: TITULO_CON_MARKUP,
        estadoAnteriorCodigo: 'ABIERTO',
        estadoNuevoCodigo: 'CERRADO',
      }),
  ],
  [
    'templateComentarioPublico',
    () => templateComentarioPublico({ ...DATOS_BASE, titulo: TITULO_CON_MARKUP }),
  ],
  [
    'templateEsperandoCliente',
    () => templateEsperandoCliente({ ...DATOS_BASE, titulo: TITULO_CON_MARKUP }),
  ],
  ['templateSlaVencido', () => templateSlaVencido({ ...DATOS_BASE, titulo: TITULO_CON_MARKUP })],
  [
    'templatePreventivoGenerado',
    () => templatePreventivoGenerado({ ...DATOS_BASE, titulo: TITULO_CON_MARKUP }),
  ],
])('%s — escapado del titulo de origen usuario', (_nombre, render) => {
  it('escapa el markup en el html, sin dejar la etiqueta viva', () => {
    const { html } = render();

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
  });

  // Hermano invertido: el html SÍ conserva su propio markup estructural, así
  // que el escapado no puede estar aplicándose al template entero.
  it('no escapa el markup propio de la plantilla', () => {
    const { html } = render();

    expect(html).toContain('<p>');
    expect(html).toContain('<strong>');
  });

  it('deja el text intacto: es texto plano, no HTML', () => {
    const { text } = render();

    expect(text).toContain('<script>alert(1)</script>');
    expect(text).not.toContain('&lt;');
  });
});

describe('templateCambioEstado', () => {
  it('incluye numero, titulo, estados y el link del ticket', () => {
    const msg = templateCambioEstado({
      ...DATOS_BASE,
      estadoAnteriorCodigo: 'NUEVO',
      estadoNuevoCodigo: 'RESUELTO',
    });

    expect(msg.subject).toContain('SOP-2026-00042');
    expect(msg.text).toContain('La impresora no imprime');
    expect(msg.text).toContain('NUEVO');
    expect(msg.text).toContain('RESUELTO');
    expect(msg.text).toContain('https://soporte.miempresa.com/tickets/ticket-abc');
    expect(msg.html).toContain('https://soporte.miempresa.com/tickets/ticket-abc');
  });

  it('está en español', () => {
    const msg = templateCambioEstado({
      ...DATOS_BASE,
      estadoAnteriorCodigo: 'NUEVO',
      estadoNuevoCodigo: 'CERRADO',
    });

    expect(msg.subject.toLowerCase()).toContain('ticket');
  });
});

describe('templateComentarioPublico', () => {
  it('incluye numero, titulo y el link del ticket', () => {
    const msg = templateComentarioPublico(DATOS_BASE);

    expect(msg.subject).toContain('SOP-2026-00042');
    expect(msg.text).toContain('La impresora no imprime');
    expect(msg.text).toContain('https://soporte.miempresa.com/tickets/ticket-abc');
  });
});

describe('templateEsperandoCliente', () => {
  it('[R4] incluye numero, titulo, el pedido de respuesta y el link del ticket', () => {
    const { subject, text, html } = templateEsperandoCliente(DATOS_BASE);

    expect(subject).toContain('SOP-2026-00042');
    expect(text).toContain('La impresora no imprime');
    expect(text).toContain('a la espera de tu respuesta');
    expect(text).toContain('https://soporte.miempresa.com/tickets/ticket-abc');
    expect(html).toContain('https://soporte.miempresa.com/tickets/ticket-abc');
  });
});

describe('templateSlaVencido', () => {
  it('incluye numero, titulo y el link del ticket', () => {
    const msg = templateSlaVencido(DATOS_BASE);

    expect(msg.subject).toContain('SOP-2026-00042');
    expect(msg.text).toContain('La impresora no imprime');
    expect(msg.text).toContain('https://soporte.miempresa.com/tickets/ticket-abc');
    expect(msg.subject.toLowerCase()).toContain('sla');
  });
});

describe('templatePreventivoGenerado', () => {
  it('[R11] incluye numero, titulo y el link del ticket generado por el barrido', () => {
    const msg = templatePreventivoGenerado(DATOS_BASE);

    expect(msg.subject).toContain('SOP-2026-00042');
    expect(msg.text).toContain('La impresora no imprime');
    expect(msg.text).toContain('https://soporte.miempresa.com/tickets/ticket-abc');
    expect(msg.subject.toLowerCase()).toContain('preventivo');
  });
});

describe('plantillas para un solicitante externo (sinLink)', () => {
  const NOMBRE_CON_MARKUP = '<script>alert(1)</script> Ficha & Cía';
  const datos = { ...DATOS_BASE, titulo: NOMBRE_CON_MARKUP, sinLink: true };

  it.each([
    [
      'templateCambioEstado',
      () =>
        templateCambioEstado({
          ...datos,
          estadoAnteriorCodigo: 'NUEVO',
          estadoNuevoCodigo: 'CERRADO',
        }),
    ],
    ['templateComentarioPublico', () => templateComentarioPublico(datos)],
    ['templateEsperandoCliente', () => templateEsperandoCliente(datos)],
  ])('%s no lleva link a /tickets/:id y sigue escapando el titulo', (_nombre, render) => {
    const { text, html } = render();

    expect(text).not.toContain('/tickets/');
    expect(html).not.toContain('/tickets/');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(text).toContain('SOP-2026-00042');
  });

  it('sin sinLink, el link se conserva (usuario registrado)', () => {
    expect(templateComentarioPublico(DATOS_BASE).html).toContain('/tickets/ticket-abc');
  });
});

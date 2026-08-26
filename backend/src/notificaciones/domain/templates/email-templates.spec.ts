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
  templateSlaVencido,
  templatePreventivoGenerado,
} from './email-templates';

const DATOS_BASE = {
  numero: 'SOP-2026-00042',
  titulo: 'La impresora no imprime',
  ticketId: 'ticket-abc',
  appBaseUrl: 'https://soporte.miempresa.com',
};

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

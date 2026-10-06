import { TicketPdfVista } from '../domain/ticket-pdf-vista';

/** PNG de 1×1 píxel, válido: sirve para probar el embebido del logo. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Vista completa de un ticket de soporte; cada test pisa lo que le interesa. */
export function vistaDePrueba(overrides: Partial<TicketPdfVista> = {}): TicketPdfVista {
  return {
    cliente: { nombre: 'Colegio San Martín', logo: null },
    numero: 'SOP-2026-00042',
    titulo: 'La impresora de secretaría no imprime',
    estado: 'En proceso',
    prioridad: 'Alta',
    tipo: 'Soporte técnico',
    solicitante: 'María Gómez',
    asignado: 'Ana Pérez',
    creado: '19/08/2026 22:30',
    cerrado: null,
    vencimientoSla: '21/08/2026 10:00',
    descripcion: 'Desde ayer la impresora muestra un error de papel atascado y no responde.',
    soporte: {
      equipo: 'Impresora HP LaserJet',
      descripcionProblema: 'Error E3 en el panel.',
      solucionAplicada: null,
    },
    edilicia: null,
    historial: [
      {
        fecha: '19/08/2026 22:35',
        autor: 'Ana Pérez',
        tipo: 'CAMBIO_ESTADO',
        texto: 'Estado: Asignado -> En proceso',
      },
      {
        fecha: '20/08/2026 09:10',
        autor: 'Ana Pérez',
        tipo: 'COMENTARIO',
        texto: 'Se reemplazó el rodillo de arrastre, queda en observación.',
      },
    ],
    generadoEl: '20/08/2026 11:00',
    ...overrides,
  };
}

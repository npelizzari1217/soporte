/**
 * Paquete SINTÉTICO para los tests del cargador. Nunca se usa un paquete
 * real como fixture: contienen datos personales.
 */
import {
  FORMATO_PAQUETE,
  type ComentarioPaquete,
  type PaqueteLegacy,
  type UsuarioPaquete,
} from './paquete';

const usuario = (
  legacyId: number,
  email: string,
  nombre: string,
  rol: UsuarioPaquete['rol'],
  apellido?: string,
) =>
  ({
    legacyId,
    email,
    emailOriginalValido: true,
    nombre,
    rol,
    ...(apellido === undefined ? {} : { apellido }),
  }) satisfies UsuarioPaquete;

const comentario = (legacyId: number, autorLegacyId: number, fecha: string, texto: string) =>
  ({ legacyId, autorLegacyId, fecha, texto }) satisfies ComentarioPaquete;

export function paqueteSintetico(): PaqueteLegacy {
  return {
    formato: FORMATO_PAQUETE,
    clienteLegacyId: 99,
    alertas: ['alerta de ejemplo'],
    ciclos: [
      { legacyId: 1, nombre: 'Ciclo 2024', fechaInicio: '2024-01-01', fechaFin: '2024-12-31' },
      { legacyId: 2, nombre: 'Ciclo 2026', fechaInicio: '2026-01-01', fechaFin: '2026-12-31' },
    ],
    usuarios: [
      usuario(10, 'Existente@Legacy.test', 'Ana Existente', 'USUARIO'),
      usuario(11, 'tecnico@legacy.test', 'Tito', 'TECNICO', 'Tecnico'),
      {
        ...usuario(12, 'legacy-12@importado.invalid', 'Sin Correo', 'USUARIO'),
        emailOriginalValido: false,
      },
    ],
    tickets: [
      {
        legacyId: 500,
        numero: 'ANT-1',
        titulo: 'Impresora sin toner',
        descripcion: 'No imprime',
        tipoCodigo: 'SOPORTE',
        estadoCodigo: 'CERRADO',
        estadoLegacy: 'Cerrado',
        solicitanteLegacyId: 10,
        asignadoLegacyId: 11,
        cicloLegacyId: 1,
        prioridadNombre: 'Media',
        fechaAlta: '2024-03-01T09:00:00-03:00',
        fechaCierre: '2024-03-02T18:00:00-03:00',
        comentarioAdicional: 'Se cambio el toner',
        comentarios: [
          comentario(900, 11, '2024-03-01T10:00:00-03:00', 'Voy en camino'),
          comentario(901, 10, '2024-03-01T11:00:00-03:00', 'Gracias'),
        ],
      },
      {
        legacyId: 501,
        numero: 'ANT-2',
        titulo: 'Pedido abierto',
        descripcion: null,
        tipoCodigo: 'SOPORTE',
        estadoCodigo: 'NUEVO',
        estadoLegacy: 'Pendiente',
        solicitanteLegacyId: 12,
        asignadoLegacyId: null,
        cicloLegacyId: null,
        prioridadNombre: 'Media',
        fechaAlta: '2026-02-10T08:30:00-03:00',
        fechaCierre: null,
        comentarioAdicional: null,
        comentarios: [],
      },
    ],
  };
}

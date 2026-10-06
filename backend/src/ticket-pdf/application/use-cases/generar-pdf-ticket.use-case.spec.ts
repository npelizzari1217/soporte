/**
 * [UNIT] `GenerarPdfTicketUseCase` — arma el modelo de vista de la ficha PDF.
 *
 * Lo central que se fija acá:
 * - el acceso es EL MISMO que el del detalle: se usan los casos de uso reales
 *   `ObtenerTicketUseCase` y `ListarTimelineUseCase` sobre repos en memoria,
 *   así que un solicitante ajeno obtiene 404 por la misma regla, no por una
 *   copia de ella;
 * - los comentarios INTERNOS nunca llegan al PDF, ni siquiera cuando el
 *   timeline devuelve las notas internas (actor con `TICKETS:OBSERVAR`);
 * - el logo solo se embebe si es png/jpeg: webp o sin logo → nombre en texto.
 */
import { describe, expect, it, vi } from 'vitest';

import { EstadoEntity } from '../../../tickets/domain/entities/estado.entity';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { PrioridadEntity } from '../../../tickets/domain/entities/prioridad.entity';
import { SolicitanteExternoEntity } from '../../../tickets/domain/entities/solicitante-externo.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TipoOperacionEntity } from '../../../tickets/domain/entities/tipo-operacion.entity';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import { TicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import { ListarTimelineUseCase } from '../../../tickets/application/use-cases/listar-timeline.use-case';
import { ObtenerTicketUseCase } from '../../../tickets/application/use-cases/obtener-ticket.use-case';
import { TicketSoporteEntity } from '../../../equipos/domain/entities/ticket-soporte.entity';
import { EquipoInformaticoEntity } from '../../../equipos/domain/entities/equipo-informatico.entity';
import { TicketEdiliciaEntity } from '../../../reparaciones/domain/entities/ticket-edilicia.entity';
import { SubtareaEdiliciaEntity } from '../../../reparaciones/domain/entities/subtarea-edilicia.entity';
import { Result } from '../../../shared/domain/result';
import { LogoClienteNoEncontradoError } from '../../../clientes/domain/errors/clientes.errors';
import { PNG_1X1 } from '../../testing/pdf-vista.fixtures';
import { TicketPdfVista } from '../../domain/ticket-pdf-vista';
import { GenerarPdfTicketUseCase } from './generar-pdf-ticket.use-case';

const SOLICITANTE = 'usr-solicitante';
const OTRO = 'usr-otro';
const TECNICO = 'usr-tecnico';
const AHORA = new Date('2026-08-20T14:00:00.000Z'); // 11:00 en Argentina

const ESTADO_NUEVO = EstadoEntity.create(
  { codigo: 'NUEVO', nombre: 'Nuevo', color: null, orden: 1, activo: true },
  'estado-nuevo',
);
const ESTADO_PROCESO = EstadoEntity.create(
  { codigo: 'EN_PROCESO', nombre: 'En proceso', color: null, orden: 2, activo: true },
  'estado-proceso',
);
const PRIORIDAD = PrioridadEntity.create(
  { codigo: 'ALTA', nombre: 'Alta', color: null, orden: 1, activo: true },
  'prioridad-1',
);
const TIPO = TipoTicketEntity.create(
  { codigo: 'SOPORTE', nombre: 'Soporte técnico', modulo: 'TICKETS', activo: true },
  'tipo-1',
);
const TIPOS_OPERACION = [
  TipoOperacionEntity.create(
    { codigo: 'COMENTARIO', nombre: 'Comentario', activo: true },
    'op-comentario',
  ),
  TipoOperacionEntity.create(
    { codigo: 'CAMBIO_ESTADO', nombre: 'Cambio de estado', activo: true },
    'op-estado',
  ),
  TipoOperacionEntity.create(
    { codigo: 'ASIGNACION', nombre: 'Asignación', activo: true },
    'op-asignacion',
  ),
];

function crearTicket(overrides: { solicitanteId?: string | null; externoId?: string | null } = {}) {
  return TicketEntity.reconstitute(
    {
      numero: 'SOP-2026-00042',
      titulo: 'Impresora rota',
      descripcion: 'No imprime',
      tipoId: 'tipo-1',
      estadoId: 'estado-proceso',
      prioridadId: 'prioridad-1',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: overrides.solicitanteId === undefined ? SOLICITANTE : overrides.solicitanteId,
      solicitanteExternoId: overrides.externoId ?? null,
      asignadoId: TECNICO,
      slaVenceAt: new Date('2026-08-21T13:00:00.000Z'),
      vencido: false,
      fechaCierre: null,
    },
    'ticket-1',
    new Date('2026-08-20T01:30:00.000Z'),
    new Date('2026-08-20T01:30:00.000Z'),
    null,
  );
}

function operacion(
  id: string,
  tipoOperacionId: string,
  campos: {
    descripcion?: string | null;
    esInterno?: boolean;
    ant?: string | null;
    nuevo?: string | null;
  },
) {
  return OperacionTicketEntity.reconstitute(
    {
      ticketId: 'ticket-1',
      tipoOperacionId,
      descripcion: campos.descripcion ?? null,
      estadoAnteriorId: campos.ant ?? null,
      estadoNuevoId: campos.nuevo ?? null,
      autorId: TECNICO,
      esInterno: campos.esInterno ?? false,
      metadata: null,
    },
    id,
    new Date('2026-08-20T12:10:00.000Z'),
    new Date('2026-08-20T12:10:00.000Z'),
    null,
  );
}

const OPERACIONES = [
  operacion('o1', 'op-estado', { ant: 'estado-nuevo', nuevo: 'estado-proceso' }),
  operacion('o2', 'op-comentario', { descripcion: 'Comentario PUBLICO' }),
  operacion('o3', 'op-comentario', { descripcion: 'Nota INTERNA secreta', esInterno: true }),
  operacion('o4', 'op-asignacion', { descripcion: 'Asignado a Ana' }),
];

interface Opciones {
  ticket?: TicketEntity;
  operaciones?: OperacionTicketEntity[];
  logo?: { buffer: Buffer; mimeType: string } | null;
  soporte?: TicketSoporteEntity | null;
  edilicia?: TicketEdiliciaEntity | null;
  subtareas?: SubtareaEdiliciaEntity[];
}

function armar(opciones: Opciones = {}) {
  const ticket = opciones.ticket ?? crearTicket();
  const operaciones = opciones.operaciones ?? OPERACIONES;
  const ticketRepo = { findById: vi.fn().mockResolvedValue(ticket) };
  // El repo devuelve TODO, como hace el real; el filtro de internas es del caso de uso.
  const operacionRepo = { listByTicket: vi.fn().mockResolvedValue(operaciones) };
  const obtener = new ObtenerTicketUseCase(ticketRepo);
  const timeline = new ListarTimelineUseCase(ticketRepo, operacionRepo);
  const generador = {
    generar: vi.fn(async (_vista: TicketPdfVista) => Buffer.from('%PDF-fake')),
  };
  const solicitanteExterno = SolicitanteExternoEntity.create({
    nombre: 'Laura Externa',
    email: 'laura@example.com',
    emailVerificadoAt: new Date('2026-08-01T00:00:00.000Z'),
  }).getValue();
  const verLogo = {
    execute: vi
      .fn()
      .mockResolvedValue(
        opciones.logo === null
          ? Result.fail(new LogoClienteNoEncontradoError('c1'))
          : Result.ok(opciones.logo ?? { buffer: PNG_1X1, mimeType: 'image/png' }),
      ),
  };

  const useCase = new GenerarPdfTicketUseCase(
    obtener,
    timeline,
    {
      findById: vi.fn(
        async (id: string) => [ESTADO_NUEVO, ESTADO_PROCESO].find((e) => e.id === id) ?? null,
      ),
    },
    { findById: vi.fn().mockResolvedValue(PRIORIDAD) },
    { findById: vi.fn().mockResolvedValue(TIPO) },
    { findAllActive: vi.fn().mockResolvedValue(TIPOS_OPERACION) },
    {
      resolverNombres: vi.fn().mockResolvedValue(
        new Map([
          [SOLICITANTE, { nombre: 'María', apellido: 'Gómez' }],
          [TECNICO, { nombre: 'Ana', apellido: 'Pérez' }],
        ]),
      ),
    },
    { findById: vi.fn().mockResolvedValue(solicitanteExterno) },
    { findByTicketId: vi.fn().mockResolvedValue(opciones.soporte ?? null) },
    {
      findById: vi.fn().mockResolvedValue(
        EquipoInformaticoEntity.create(
          {
            nombre: 'Impresora HP',
            numeroSerie: null,
            marca: null,
            modelo: null,
            fechaAdquisicion: null,
            ubicacion: null,
            importe: null,
            fechaValoracion: null,
            observaciones: null,
            valorResidual: null,
            fechaValorResidual: null,
          },
          'equipo-1',
        ),
      ),
    },
    { findByTicketId: vi.fn().mockResolvedValue(opciones.edilicia ?? null) },
    { findActiveByTicketEdiliciaId: vi.fn().mockResolvedValue(opciones.subtareas ?? []) },
    verLogo,
    generador,
    () => AHORA,
  );
  return { useCase, generador, verLogo, ticketRepo };
}

/** Actor con `TICKETS:VER_TODOS` y `TICKETS:OBSERVAR` (ve las notas internas en pantalla). */
const DTO_STAFF = {
  ticketId: 'ticket-1',
  actorId: TECNICO,
  tienePermisoVerTodos: true,
  clienteId: 'cliente-1',
  clienteNombre: 'Colegio San Martín',
};

describe('GenerarPdfTicketUseCase', () => {
  it('arma la vista con los datos del ticket, nombres resueltos y fechas en hora de Argentina', async () => {
    const { useCase, generador } = armar();

    const result = await useCase.execute(DTO_STAFF);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nombreArchivo).toBe('ticket-SOP-2026-00042.pdf');
    expect(result.getValue().buffer.subarray(0, 4).toString()).toBe('%PDF');
    const vista = generador.generar.mock.calls[0][0];
    expect(vista).toMatchObject({
      numero: 'SOP-2026-00042',
      titulo: 'Impresora rota',
      estado: 'En proceso',
      prioridad: 'Alta',
      tipo: 'Soporte técnico',
      solicitante: 'María Gómez',
      asignado: 'Ana Pérez',
      // 01:30 UTC del 20/08 = 22:30 del 19/08 en Argentina.
      creado: '19/08/2026 22:30',
      cerrado: null,
      vencimientoSla: '21/08/2026 10:00',
      descripcion: 'No imprime',
      generadoEl: '20/08/2026 11:00',
      cliente: { nombre: 'Colegio San Martín' },
    });
  });

  it('el historial lleva comentarios públicos y cambios de estado; NUNCA los internos, aunque el timeline los devuelva', async () => {
    const { useCase, generador } = armar();

    await useCase.execute(DTO_STAFF);

    const { historial } = generador.generar.mock.calls[0][0];
    expect(historial.map((e) => e.texto)).toEqual([
      'Estado: Nuevo -> En proceso',
      'Comentario PUBLICO',
    ]);
    expect(JSON.stringify(historial)).not.toContain('INTERNA');
  });

  it('pide el timeline SIN permiso de observar y además descarta las internas por su cuenta (defensa en profundidad)', async () => {
    const generador = {
      generar: vi.fn(async (_vista: TicketPdfVista) => Buffer.from('%PDF-fake')),
    };
    // Un timeline "roto" que ignora el filtro y devuelve todo, internas incluidas.
    const timelineRoto = {
      execute: vi.fn().mockResolvedValue(Result.ok(OPERACIONES)),
    };
    const conTimelineRoto = new GenerarPdfTicketUseCase(
      new ObtenerTicketUseCase({ findById: vi.fn().mockResolvedValue(crearTicket()) }),
      timelineRoto,
      { findById: vi.fn().mockResolvedValue(ESTADO_PROCESO) },
      { findById: vi.fn().mockResolvedValue(PRIORIDAD) },
      { findById: vi.fn().mockResolvedValue(TIPO) },
      { findAllActive: vi.fn().mockResolvedValue(TIPOS_OPERACION) },
      { resolverNombres: vi.fn().mockResolvedValue(new Map()) },
      { findById: vi.fn().mockResolvedValue(null) },
      { findByTicketId: vi.fn().mockResolvedValue(null) },
      { findById: vi.fn().mockResolvedValue(null) },
      { findByTicketId: vi.fn().mockResolvedValue(null) },
      { findActiveByTicketEdiliciaId: vi.fn().mockResolvedValue([]) },
      { execute: vi.fn().mockResolvedValue(Result.fail(new LogoClienteNoEncontradoError('c1'))) },
      generador,
      () => AHORA,
    );

    await conTimelineRoto.execute(DTO_STAFF);

    expect(timelineRoto.execute).toHaveBeenCalledWith(
      expect.objectContaining({ tienePermisoObservar: false }),
    );
    const { historial } = generador.generar.mock.calls[0][0];
    expect(historial.map((e) => e.texto)).not.toContain('Nota INTERNA secreta');
  });

  describe('acceso (el mismo que el detalle del ticket)', () => {
    it('el solicitante obtiene su propio ticket sin VER_TODOS', async () => {
      const { useCase } = armar();

      const result = await useCase.execute({
        ...DTO_STAFF,
        actorId: SOLICITANTE,
        tienePermisoVerTodos: false,
      });

      expect(result.isOk()).toBe(true);
    });

    it('un usuario ajeno sin VER_TODOS recibe TicketNoEncontradoError y no se genera nada', async () => {
      const { useCase, generador } = armar();

      const result = await useCase.execute({
        ...DTO_STAFF,
        actorId: OTRO,
        tienePermisoVerTodos: false,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(generador.generar).not.toHaveBeenCalled();
    });

    it('un ticket inexistente es TicketNoEncontradoError', async () => {
      const { useCase, ticketRepo } = armar();
      ticketRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(DTO_STAFF);

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    });
  });

  describe('solicitante externo', () => {
    it('un ticket del formulario público muestra el nombre del solicitante externo', async () => {
      const { useCase, generador } = armar({
        ticket: crearTicket({ solicitanteId: null, externoId: 'ext-1' }),
      });

      await useCase.execute(DTO_STAFF);

      expect(generador.generar.mock.calls[0][0].solicitante).toBe('Laura Externa');
    });
  });

  describe('logo', () => {
    it.each([
      ['image/png', 'png'],
      ['image/jpeg', 'jpeg'],
    ])('%s se embebe como %s', async (mimeType, formato) => {
      const { useCase, generador } = armar({ logo: { buffer: PNG_1X1, mimeType } });

      await useCase.execute(DTO_STAFF);

      expect(generador.generar.mock.calls[0][0].cliente.logo).toEqual({ buffer: PNG_1X1, formato });
    });

    it('webp NO se embebe: queda el nombre del cliente', async () => {
      const { useCase, generador } = armar({ logo: { buffer: PNG_1X1, mimeType: 'image/webp' } });

      await useCase.execute(DTO_STAFF);

      const { cliente } = generador.generar.mock.calls[0][0];
      expect(cliente.logo).toBeNull();
      expect(cliente.nombre).toBe('Colegio San Martín');
    });

    it('sin logo cargado tampoco falla: logo null y nombre en texto', async () => {
      const { useCase, generador } = armar({ logo: null });

      const result = await useCase.execute(DTO_STAFF);

      expect(result.isOk()).toBe(true);
      expect(generador.generar.mock.calls[0][0].cliente.logo).toBeNull();
    });
  });

  describe('contenido según el flujo', () => {
    it('soporte: equipo, descripción del problema y solución aplicada', async () => {
      const soporte = TicketSoporteEntity.reconstitute(
        {
          ticketId: 'ticket-1',
          equipoId: 'equipo-1',
          descripcionProblema: 'Error E3',
          solucionAplicada: 'Cambio de rodillo',
        },
        'ts-1',
        AHORA,
        AHORA,
        null,
      );
      const { useCase, generador } = armar({ soporte });

      await useCase.execute(DTO_STAFF);

      const vista = generador.generar.mock.calls[0][0];
      expect(vista.soporte).toEqual({
        equipo: 'Impresora HP',
        descripcionProblema: 'Error E3',
        solucionAplicada: 'Cambio de rodillo',
      });
      expect(vista.edilicia).toBeNull();
    });

    it('edilicia: ubicación, avance y subtareas en orden', async () => {
      const edilicia = TicketEdiliciaEntity.reconstitute(
        {
          ticketId: 'ticket-1',
          ubicacion: 'Edificio Central',
          personalAsignadoId: null,
          porcentajeAvance: 50,
        },
        'te-1',
        AHORA,
        AHORA,
        null,
      );
      const subtareas = [
        SubtareaEdiliciaEntity.create({
          ticketEdiliciaId: 'te-1',
          descripcion: 'Segunda',
          orden: 2,
        }),
        SubtareaEdiliciaEntity.create({
          ticketEdiliciaId: 'te-1',
          descripcion: 'Primera',
          orden: 1,
        }),
      ];
      const { useCase, generador } = armar({ edilicia, subtareas });

      await useCase.execute(DTO_STAFF);

      const vista = generador.generar.mock.calls[0][0];
      expect(vista.edilicia).toEqual({
        ubicacion: 'Edificio Central',
        porcentajeAvance: 50,
        subtareas: [
          { descripcion: 'Primera', completada: false },
          { descripcion: 'Segunda', completada: false },
        ],
      });
      expect(vista.soporte).toBeNull();
    });
  });
});

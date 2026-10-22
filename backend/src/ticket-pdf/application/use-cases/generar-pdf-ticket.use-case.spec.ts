/**
 * [UNIT] `GenerarPdfTicketUseCase` — arma el modelo de vista de la ficha PDF.
 *
 * Lo central que se fija acá:
 * - el acceso es EL MISMO que el del detalle: se usan los casos de uso reales
 *   `ObtenerTicketUseCase` y `ListarTimelineUseCase` sobre repos en memoria,
 *   así que un solicitante ajeno obtiene 404 por la misma regla, no por una
 *   copia de ella;
 * - los comentarios INTERNOS nunca llegan al PDF, ni siquiera cuando el
 *   timeline devuelve las notas internas (actor con `OBSERVAR` sobre el tipo);
 * - imprimir exige `IMPRESION` sobre el tipo del ticket: sin ella, 403 aunque lo vea
 *   (odd/permisos-por-tipo-ticket, D5 c);
 * - el logo solo se embebe si es png/jpeg: webp o sin logo → nombre en texto;
 * - las tareas salen de `tareas_ticket` en cualquier tipo de ticket, y el avance se calcula sobre
 *   ellas (la columna `porcentaje_avance` se retiró en T8).
 */
import { describe, expect, it, vi } from 'vitest';

import { EstadoEntity } from '../../../tickets/domain/entities/estado.entity';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { PrioridadEntity } from '../../../tickets/domain/entities/prioridad.entity';
import { SolicitanteExternoEntity } from '../../../tickets/domain/entities/solicitante-externo.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TipoOperacionEntity } from '../../../tickets/domain/entities/tipo-operacion.entity';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import {
  AccionSobreTipoNoPermitidaError,
  TicketNoEncontradoError,
} from '../../../tickets/domain/errors/tickets.errors';
import { AccionTipoTicket } from '../../../tickets/domain/permisos-tipo-ticket';
import { alcancePorTipo } from '../../../tickets/test-helpers/alcance-ticket';
import { ListarTimelineUseCase } from '../../../tickets/application/use-cases/listar-timeline.use-case';
import { ObtenerTicketUseCase } from '../../../tickets/application/use-cases/obtener-ticket.use-case';
import { TicketSoporteEntity } from '../../../equipos/domain/entities/ticket-soporte.entity';
import { EquipoInformaticoEntity } from '../../../equipos/domain/entities/equipo-informatico.entity';
import { TicketEdiliciaEntity } from '../../../reparaciones/domain/entities/ticket-edilicia.entity';
import { TareaTicketEntity } from '../../../tickets/domain/entities/tarea-ticket.entity';
import { Result } from '../../../shared/domain/result';
import { LogoClienteNoEncontradoError } from '../../../clientes/domain/errors/clientes.errors';
import { PNG_1X1 } from '../../testing/pdf-vista.fixtures';
import { TicketPdfVista } from '../../domain/ticket-pdf-vista';
import { GenerarPdfTicketUseCase } from './generar-pdf-ticket.use-case';

const SOLICITANTE = 'usr-solicitante';
const OTRO = 'usr-otro';
const TECNICO = 'usr-tecnico';
const OTRO_TECNICO = 'usr-otro-tecnico';
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

function tarea(id: string, orden: number, campos: { tecnicoId?: string | null } = {}) {
  return TareaTicketEntity.crear(
    { ticketId: 'ticket-1', descripcion: `Tarea ${id}`, orden, tecnicoId: campos.tecnicoId },
    id,
  );
}

interface Opciones {
  ticket?: TicketEntity;
  operaciones?: OperacionTicketEntity[];
  logo?: { buffer: Buffer; mimeType: string } | null;
  soporte?: TicketSoporteEntity | null;
  edilicia?: TicketEdiliciaEntity | null;
  tareas?: TareaTicketEntity[];
}

function armar(opciones: Opciones = {}) {
  const ticket = opciones.ticket ?? crearTicket();
  const operaciones = opciones.operaciones ?? OPERACIONES;
  const ticketRepo = {
    findById: vi.fn().mockResolvedValue(ticket),
    esVisiblePara: vi.fn().mockResolvedValue(false),
  };
  // El repo devuelve TODO, como hace el real; el filtro de internas es del caso de uso.
  const operacionRepo = { listByTicket: vi.fn().mockResolvedValue(operaciones) };
  const obtener = new ObtenerTicketUseCase(ticketRepo);
  const timeline = new ListarTimelineUseCase(ticketRepo, operacionRepo);
  const generador = {
    generar: vi.fn(async (_vista: TicketPdfVista) => Buffer.from('%PDF-fake')),
  };
  const tareaRepo = { listarPorTicket: vi.fn().mockResolvedValue(opciones.tareas ?? []) };
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
          [OTRO_TECNICO, { nombre: 'Juan', apellido: 'Díaz' }],
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
    { listarPorTicket: tareaRepo.listarPorTicket },
    verLogo,
    generador,
    () => AHORA,
  );
  return { useCase, generador, verLogo, ticketRepo, tareaRepo };
}

/** Acciones del staff sobre el tipo del ticket: ve todo, ve las notas internas e imprime. */
const ACCIONES_STAFF: AccionTipoTicket[] = ['LECTURA', 'VER_TODOS', 'OBSERVAR', 'IMPRESION'];

/** DTO de un actor con `acciones` sobre el tipo del ticket. */
function dtoDe(actorId: string, acciones: readonly AccionTipoTicket[]) {
  return {
    ticketId: 'ticket-1',
    ...alcancePorTipo(actorId, { 'tipo-1': acciones }),
    clienteId: 'cliente-1',
    clienteNombre: 'Colegio San Martín',
  };
}

/** Actor con `VER_TODOS`, `OBSERVAR` e `IMPRESION` sobre el tipo (ve las notas internas en pantalla). */
const DTO_STAFF = dtoDe(TECNICO, ACCIONES_STAFF);

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

  it('pide el timeline solo con las públicas y además descarta las internas por su cuenta (defensa en profundidad)', async () => {
    const generador = {
      generar: vi.fn(async (_vista: TicketPdfVista) => Buffer.from('%PDF-fake')),
    };
    // Un timeline "roto" que ignora el filtro y devuelve todo, internas incluidas.
    const timelineRoto = {
      execute: vi.fn().mockResolvedValue(Result.ok(OPERACIONES)),
    };
    const conTimelineRoto = new GenerarPdfTicketUseCase(
      new ObtenerTicketUseCase({
        findById: vi.fn().mockResolvedValue(crearTicket()),
        esVisiblePara: vi.fn().mockResolvedValue(false),
      }),
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
      { listarPorTicket: vi.fn().mockResolvedValue([]) },
      { execute: vi.fn().mockResolvedValue(Result.fail(new LogoClienteNoEncontradoError('c1'))) },
      generador,
      () => AHORA,
    );

    await conTimelineRoto.execute(DTO_STAFF);

    expect(timelineRoto.execute).toHaveBeenCalledWith(
      expect.objectContaining({ soloPublicas: true }),
    );
    const { historial } = generador.generar.mock.calls[0][0];
    expect(historial.map((e) => e.texto)).not.toContain('Nota INTERNA secreta');
  });

  describe('acceso (el mismo que el detalle del ticket)', () => {
    it('el solicitante obtiene su propio ticket sin VER_TODOS', async () => {
      const { useCase } = armar();

      const result = await useCase.execute(dtoDe(SOLICITANTE, ['LECTURA', 'IMPRESION']));

      expect(result.isOk()).toBe(true);
    });

    it('un usuario ajeno sin VER_TODOS recibe TicketNoEncontradoError y no se genera nada', async () => {
      const { useCase, generador } = armar();

      const result = await useCase.execute(dtoDe(OTRO, ['LECTURA', 'IMPRESION']));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(generador.generar).not.toHaveBeenCalled();
    });

    it('quien ve el ticket pero no tiene IMPRESION sobre su tipo recibe 403 y no se genera nada', async () => {
      const { useCase, generador } = armar();

      const result = await useCase.execute(dtoDe(TECNICO, ['LECTURA', 'VER_TODOS', 'OBSERVAR']));

      expect(result.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
      expect(result.getError().message).toContain('"IMPRESION"');
      expect(generador.generar).not.toHaveBeenCalled();
    });

    it('IMPRESION sobre otro tipo no alcanza; sin LECTURA sobre el del ticket es 404', async () => {
      const { useCase, generador } = armar();

      const result = await useCase.execute({
        ...DTO_STAFF,
        ...alcancePorTipo(SOLICITANTE, { 'otro-tipo': ACCIONES_STAFF }),
      });

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

    it('edilicia: la ubicación, y el avance sale de las tareas', async () => {
      const edilicia = TicketEdiliciaEntity.reconstitute(
        {
          ticketId: 'ticket-1',
          ubicacion: 'Edificio Central',
        },
        'te-1',
        AHORA,
        AHORA,
        null,
      );
      const { useCase, generador } = armar({ edilicia, tareas: [tarea('t1', 1)] });

      await useCase.execute(DTO_STAFF);

      const vista = generador.generar.mock.calls[0][0];
      expect(vista.edilicia).toEqual({ ubicacion: 'Edificio Central' });
      expect(vista.tareas?.porcentajeAvance).toBe(0);
      expect(vista.soporte).toBeNull();
    });
  });

  describe('tareas (tareas_ticket, cualquier tipo de ticket)', () => {
    it('imprime cada tarea activa por orden, con su técnico, su estado y el avance calculado', async () => {
      const completada = tarea('t2', 2, { tecnicoId: TECNICO });
      completada.completar(OTRO_TECNICO, new Date('2026-08-20T12:10:00.000Z'));
      const { useCase, generador, tareaRepo } = armar({
        tareas: [completada, tarea('t1', 1)],
      });

      await useCase.execute(DTO_STAFF);

      expect(tareaRepo.listarPorTicket).toHaveBeenCalledWith('ticket-1');
      const vista = generador.generar.mock.calls[0][0];
      expect(vista.edilicia).toBeNull();
      expect(vista.tareas).toEqual({
        porcentajeAvance: 50,
        completadas: 1,
        total: 2,
        items: [
          {
            descripcion: 'Tarea t1',
            tecnico: null,
            completada: false,
            completadaEn: null,
            completadaPor: null,
          },
          {
            descripcion: 'Tarea t2',
            tecnico: 'Ana Pérez',
            completada: true,
            completadaEn: '20/08/2026 09:10',
            completadaPor: 'Juan Díaz',
          },
        ],
      });
    });

    it('una tarea dada de baja no se imprime ni cuenta en el avance', async () => {
      const borrada = TareaTicketEntity.reconstitute(
        {
          ticketId: 'ticket-1',
          descripcion: 'Borrada',
          orden: 2,
          tecnicoId: null,
          completada: false,
          completadaEn: null,
          completadaPorId: null,
        },
        't-borrada',
        AHORA,
        AHORA,
        AHORA,
      );
      const hecha = tarea('t1', 1);
      hecha.completar(TECNICO, AHORA);
      const { useCase, generador } = armar({ tareas: [hecha, borrada] });

      await useCase.execute(DTO_STAFF);

      const { tareas } = generador.generar.mock.calls[0][0];
      expect(tareas?.items.map((t) => t.descripcion)).toEqual(['Tarea t1']);
      expect(tareas?.porcentajeAvance).toBe(100);
    });

    it('un técnico que ya no está en master queda como "Usuario", no como "sin técnico"', async () => {
      const { useCase, generador } = armar({
        tareas: [tarea('t1', 1, { tecnicoId: 'usr-borrado' })],
      });

      await useCase.execute(DTO_STAFF);

      expect(generador.generar.mock.calls[0][0].tareas?.items[0].tecnico).toBe('Usuario');
    });

    it('sin tareas activas la sección no va', async () => {
      const { useCase, generador } = armar();

      await useCase.execute(DTO_STAFF);

      expect(generador.generar.mock.calls[0][0].tareas).toBeNull();
    });
  });
});

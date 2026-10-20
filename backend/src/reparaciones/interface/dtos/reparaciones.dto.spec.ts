/**
 * reparaciones.dto.spec.ts — RED→GREEN: tope de largo de `titulo` en
 * `CreateTicketEdilicioHttpDto` (fix defecto "límite de largo de titulo").
 *
 * `titulo` crea un `Ticket` (`Ticket.titulo VarChar(255)`) vía
 * `TicketEntity.create()`. Sin este guard el valor atraviesa el DTO y el
 * dominio intactos y lo frena recién Postgres, con un error de driver sin
 * nombrar campo.
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTicketEdilicioHttpDto, ListReparacionesQueryDto } from './reparaciones.dto';
import { TICKET_EDILICIA_UBICACION_MAX_LENGTH } from '../../domain/entities/ticket-edilicia.entity';

describe('CreateTicketEdilicioHttpDto — tope de largo de titulo espejando la columna', () => {
  const prioridadId = '00000000-0000-4000-8000-000000000002';

  // Asserta el error DEL CAMPO y por SU restricción, no que "hubo algún
  // error": un DTO que rechazara por otra propiedad daría verde igual con
  // el tope de largo ausente.
  it('rechaza titulo de más de 255 caracteres, por maxLength', async () => {
    const dto = plainToInstance(CreateTicketEdilicioHttpDto, {
      titulo: 'A'.repeat(256),
      prioridadId,
    });
    const errorDeTitulo = (await validate(dto)).find((e) => e.property === 'titulo');

    expect(errorDeTitulo?.constraints).toHaveProperty('maxLength');
  });

  it('acepta titulo de exactamente 255 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(CreateTicketEdilicioHttpDto, {
      titulo: 'A'.repeat(255),
      prioridadId,
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

/**
 * `ubicacion`: el mismo defecto que `titulo`, en un campo que había quedado
 * afuera. Su columna es `VarChar(255)` y no la acotaba ninguna capa, así que el
 * valor llegaba a Postgres (22001 → 500 crudo). La descripción de una tarea la
 * acota `CrearTareaTicketBodyDto` (odd/tareas-con-tecnico).
 *
 * El tope no se declara acá: se importa del dominio, para que el borde y la
 * precondición no puedan divergir.
 */
describe('CreateTicketEdilicioHttpDto — tope de ubicacion', () => {
  const BASE = {
    titulo: 'Filtración en el baño',
    prioridadId: '9f1a0b2c-3d4e-4f50-8a61-72b83c94d5e6',
  };

  it('acepta una ubicacion en el límite exacto', async () => {
    const dto = plainToInstance(CreateTicketEdilicioHttpDto, {
      ...BASE,
      ubicacion: 'A'.repeat(TICKET_EDILICIA_UBICACION_MAX_LENGTH),
    });
    expect((await validate(dto)).some((e) => e.property === 'ubicacion')).toBe(false);
  });

  it('rechaza una ubicacion que pasa el tope', async () => {
    const dto = plainToInstance(CreateTicketEdilicioHttpDto, {
      ...BASE,
      ubicacion: 'A'.repeat(TICKET_EDILICIA_UBICACION_MAX_LENGTH + 1),
    });
    const error = (await validate(dto)).find((e) => e.property === 'ubicacion');
    expect(error?.constraints).toHaveProperty('maxLength');
  });

  it('sigue aceptando el alta sin ubicacion: el tope no la vuelve obligatoria', async () => {
    const dto = plainToInstance(CreateTicketEdilicioHttpDto, BASE);
    expect((await validate(dto)).some((e) => e.property === 'ubicacion')).toBe(false);
  });
});

describe('CreateTicketEdilicioHttpDto — tipoId opcional (S2, odd/tasks/tipos-ticket-por-modulo.md)', () => {
  const BASE = {
    titulo: 'Filtración en el baño',
    prioridadId: '9f1a0b2c-3d4e-4f50-8a61-72b83c94d5e6',
  };

  it('acepta el alta sin tipoId', async () => {
    const dto = plainToInstance(CreateTicketEdilicioHttpDto, BASE);
    expect((await validate(dto)).some((e) => e.property === 'tipoId')).toBe(false);
  });

  it('acepta un tipoId UUID', async () => {
    const dto = plainToInstance(CreateTicketEdilicioHttpDto, {
      ...BASE,
      tipoId: '1a2b3c4d-5e6f-4a70-8b81-92c03d14e5f6',
    });
    expect((await validate(dto)).some((e) => e.property === 'tipoId')).toBe(false);
  });

  it('rechaza un tipoId que no es UUID', async () => {
    const dto = plainToInstance(CreateTicketEdilicioHttpDto, { ...BASE, tipoId: 'MANTENIMIENTO' });
    const error = (await validate(dto)).find((e) => e.property === 'tipoId');
    expect(error?.constraints).toHaveProperty('isUuid');
  });
});

describe('ListReparacionesQueryDto — paginación y filtro de bloqueo (odd/reparaciones-paginadas, S1)', () => {
  async function errores(query: Record<string, string>) {
    const dto = plainToInstance(ListReparacionesQueryDto, query);
    return { dto, errores: await validate(dto) };
  }

  it('sin parámetros es válido: los defaults los pone el controller', async () => {
    expect((await errores({})).errores).toEqual([]);
  });

  it('convierte pagina y porPagina de la query string a número', async () => {
    const { dto, errores: e } = await errores({
      pagina: '3',
      porPagina: '50',
      bloqueo: 'BLOQUEADAS',
    });
    expect(e).toEqual([]);
    expect(dto).toMatchObject({ pagina: 3, porPagina: 50, bloqueo: 'BLOQUEADAS' });
  });

  it.each([
    ['pagina', { pagina: '0' }, 'min'],
    ['pagina', { pagina: '1.5' }, 'isInt'],
    ['porPagina', { porPagina: '0' }, 'min'],
    ['porPagina', { porPagina: '101' }, 'max'],
    ['bloqueo', { bloqueo: 'ALGUNAS' }, 'isIn'],
  ])('rechaza %s inválido (%o) por %s', async (campo, query, restriccion) => {
    const { errores: e } = await errores(query);
    expect(e).toHaveLength(1);
    expect(e[0].property).toBe(campo);
    expect(e[0].constraints).toHaveProperty(restriccion);
  });

  it('acepta los bordes: pagina 1 y porPagina 1 y 100', async () => {
    expect((await errores({ pagina: '1', porPagina: '1' })).errores).toEqual([]);
    expect((await errores({ porPagina: '100' })).errores).toEqual([]);
  });
});

/**
 * plan.spec.ts — decisiones puras del cargador: emparejar usuarios por email,
 * ciclos por fechas, tickets por numero, y el orden de los comentarios.
 */
import {
  comentariosDeTicket,
  planificarCiclos,
  planificarUsuarios,
  separarTickets,
  type CicloExistente,
} from './plan';
import { paqueteSintetico } from './paquete-sintetico.fixture';

describe('planificarUsuarios', () => {
  const { usuarios } = paqueteSintetico();

  it('email existente con otras mayúsculas → reusar ese usuario; sin membresía en el cliente → agregar', () => {
    const { plan, conflictos } = planificarUsuarios(usuarios, [
      { id: 'u-1', email: 'existente@legacy.TEST', membresiasEnCliente: [] },
    ]);
    expect(conflictos).toEqual([]);
    expect(plan[0]).toMatchObject({ accion: 'reusar', usuarioId: 'u-1', membresia: 'agregar' });
  });

  it('email inexistente → crear con el email normalizado y el rol del paquete', () => {
    const { plan } = planificarUsuarios(usuarios, []);
    expect(plan.map((p) => [p.accion, p.email, p.rol])).toEqual([
      ['crear', 'existente@legacy.test', 'USUARIO'],
      ['crear', 'tecnico@legacy.test', 'TECNICO'],
      ['crear', 'legacy-12@importado.invalid', 'USUARIO'],
    ]);
  });

  it('membresía activa en el cliente → activa; solo inactiva → inactiva (no se reactiva)', () => {
    const { plan } = planificarUsuarios(usuarios.slice(0, 2), [
      {
        id: 'u-1',
        email: 'existente@legacy.test',
        membresiasEnCliente: [{ rolCodigo: 'COLABORADOR', activo: true }],
      },
      {
        id: 'u-2',
        email: 'tecnico@legacy.test',
        membresiasEnCliente: [{ rolCodigo: 'TECNICO', activo: false }],
      },
    ]);
    expect(plan.map((p) => p.membresia)).toEqual(['activa', 'inactiva']);
  });

  it('dos usuarios de soporte con el mismo email sin distinguir mayúsculas → conflicto', () => {
    const { conflictos } = planificarUsuarios(usuarios.slice(0, 1), [
      { id: 'u-1', email: 'existente@legacy.test', membresiasEnCliente: [] },
      { id: 'u-2', email: 'EXISTENTE@legacy.test', membresiasEnCliente: [] },
    ]);
    expect(conflictos).toHaveLength(1);
  });
});

describe('planificarCiclos', () => {
  const { ciclos } = paqueteSintetico();
  const ciclo = (
    id: string,
    fechaInicio: string,
    fechaFin: string,
    activo = true,
  ): CicloExistente => ({
    id,
    fechaInicio,
    fechaFin,
    activo,
  });

  it('empareja por FECHAS aunque el nombre difiera; sin coincidencia → crear', () => {
    const { plan, conflictos } = planificarCiclos(
      ciclos,
      [ciclo('v-26', '2026-01-01', '2026-12-31')],
      [ciclo('c-26', '2026-01-01', '2026-12-31')],
    );
    expect(conflictos).toEqual([]);
    expect(plan.map((p) => [p.vigente, p.cliente])).toEqual([
      [{ accion: 'crear' }, { accion: 'crear' }],
      [
        { accion: 'reusar', id: 'v-26' },
        { accion: 'reusar', id: 'c-26' },
      ],
    ]);
  });

  it('ciclo existente que se solapa con fechas distintas → conflicto', () => {
    const { conflictos } = planificarCiclos(ciclos, [], [ciclo('c-x', '2024-07-01', '2025-06-30')]);
    expect(conflictos).toHaveLength(1);
    expect(conflictos[0]).toMatch(/ciclo legacy 1 .*se solapa/);
  });

  it('dos ciclos del paquete que se solapan entre sí → conflicto', () => {
    const solapados = [
      ...ciclos,
      { ...ciclos[0], legacyId: 3, fechaInicio: '2024-06-01', fechaFin: '2025-05-31' },
    ];
    const { conflictos } = planificarCiclos(solapados, [], []);
    expect(conflictos).toEqual(['ciclos legacy 1 y 3 se solapan entre si']);
  });
});

describe('separarTickets', () => {
  it('numero ya existente en el tenant → ya existia, no se inserta', () => {
    const { aInsertar, yaExistian } = separarTickets(
      paqueteSintetico().tickets,
      new Set(['ANT-1']),
    );
    expect(aInsertar.map((t) => t.numero)).toEqual(['ANT-2']);
    expect(yaExistian).toEqual(['ANT-1']);
  });
});

describe('comentariosDeTicket', () => {
  it('respeta el orden del paquete y agrega el comentarioAdicional al final, del asignado y al cierre', () => {
    const comentarios = comentariosDeTicket(paqueteSintetico().tickets[0]);
    expect(comentarios.map((c) => [c.autorLegacyId, c.texto, c.adicional])).toEqual([
      ['11', 'Voy en camino', false],
      ['10', 'Gracias', false],
      ['11', 'Se cambio el toner', true],
    ]);
    expect(comentarios[2].fecha.toISOString()).toBe('2024-03-02T21:00:00.000Z');
  });

  it('comentarioAdicional sin asignado ni cierre → lo firma el solicitante al alta', () => {
    const t = { ...paqueteSintetico().tickets[1], comentarioAdicional: 'Nota' };
    const [adicional] = comentariosDeTicket(t);
    expect(adicional).toMatchObject({ autorLegacyId: '12', adicional: true });
    expect(adicional.fecha.toISOString()).toBe('2026-02-10T11:30:00.000Z');
  });
});

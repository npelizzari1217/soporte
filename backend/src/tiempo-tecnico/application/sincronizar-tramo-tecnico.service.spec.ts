import {
  CalcularSlaHabilVenceService,
  CalendarioLaboralSemanal,
  FeriadosLaborales,
} from '../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { ResolverHorarioLaboralUsuarioService } from '../../calendario-laboral/domain/services/resolver-horario-laboral-usuario.service';
import {
  CierreTramo,
  ITramoTecnicoRepository,
  SituacionTicketGuardado,
  TramoTecnico,
} from '../domain/ports/i-tramo-tecnico.repository';
import { CambioEstadoTramo, TramoAbierto } from '../domain/tramo-tecnico';
import { SincronizarTramoTecnicoService } from './sincronizar-tramo-tecnico.service';

const TICKET = '01900000-0000-7000-8000-00000000f001';
const ANA = '01900000-0000-7000-8000-0000000000a1';
const BETO = '01900000-0000-7000-8000-0000000000b2';
const IDS_ESTADO: Record<string, string> = {
  NUEVO: 'e-nuevo',
  ASIGNADO: 'e-asignado',
  EN_PROCESO: 'e-en-proceso',
  ESPERANDO_CLIENTE: 'e-esperando',
  RESUELTO: 'e-resuelto',
  CERRADO: 'e-cerrado',
};

/** Instante en hora argentina (UTC-3). El 2026-10-26 es lunes. */
const art = (fechaHora: string): Date => new Date(`${fechaHora}:00-03:00`);

const cerrado = { aperturaMinuto: null, cierreMinuto: null };
const ventana = (desdeHora: number, hastaHora: number) => ({
  aperturaMinuto: desdeHora * 60,
  cierreMinuto: hastaHora * 60,
});
/** Horario del tenant: lunes a viernes de 9 a 18. */
const HORARIO_TENANT: CalendarioLaboralSemanal = [
  cerrado,
  ventana(9, 18),
  ventana(9, 18),
  ventana(9, 18),
  ventana(9, 18),
  ventana(9, 18),
  cerrado,
];
/** Horario propio de Ana: lunes a viernes de 9 a 11. */
const HORARIO_ANA: CalendarioLaboralSemanal = [
  cerrado,
  ventana(9, 11),
  ventana(9, 11),
  ventana(9, 11),
  ventana(9, 11),
  ventana(9, 11),
  cerrado,
];

/**
 * Repositorio en memoria con la misma semántica que el de Prisma: un tramo abierto por ticket y
 * `cerrar` condicionado a que siga abierto.
 */
class TramosEnMemoria implements ITramoTecnicoRepository {
  readonly tramos: TramoTecnico[] = [];
  readonly cambios: CambioEstadoTramo[] = [];
  situacion: SituacionTicketGuardado | null = null;
  private secuencia = 0;

  async leerSituacion(): Promise<SituacionTicketGuardado | null> {
    return this.situacion;
  }

  async obtenerAbierto(): Promise<TramoAbierto | null> {
    const abierto = this.tramos.find((t) => t.finAt === null);
    return abierto
      ? { id: abierto.id, tecnicoId: abierto.tecnicoId, inicioAt: abierto.inicioAt }
      : null;
  }

  async abrir(props: {
    ticketId: string;
    tecnicoId: string;
    inicioAt: Date;
  }): Promise<TramoAbierto> {
    if (this.tramos.some((t) => t.finAt === null)) throw new Error('ya hay un tramo abierto');
    this.secuencia += 1;
    const id = `tramo-${this.secuencia}`;
    this.tramos.push({
      id,
      ticketId: props.ticketId,
      tecnicoId: props.tecnicoId,
      inicioAt: props.inicioAt,
      finAt: null,
      motivoFin: null,
      habilS: null,
      metaS: null,
      cumplido: null,
    });
    return { id, tecnicoId: props.tecnicoId, inicioAt: props.inicioAt };
  }

  async cerrar(cierre: CierreTramo): Promise<boolean> {
    const i = this.tramos.findIndex((t) => t.id === cierre.id && t.finAt === null);
    if (i === -1) return false;
    this.tramos[i] = {
      ...this.tramos[i],
      finAt: cierre.finAt,
      motivoFin: cierre.motivo,
      habilS: cierre.habilS,
      metaS: cierre.metaS,
      cumplido: cierre.cumplido,
    };
    return true;
  }

  async listarCambiosEstado(_ticketId: string, hasta: Date): Promise<CambioEstadoTramo[]> {
    return this.cambios.filter((c) => c.at.getTime() <= hasta.getTime());
  }

  async listarPorTicket(): Promise<TramoTecnico[]> {
    return [...this.tramos];
  }
}

interface Armado {
  repo: TramosEnMemoria;
  logs: string[];
  /** Guarda el ticket como lo haría `TicketRepositoryConTramos.save`, en el instante dado. */
  guardar(
    instante: Date,
    asignadoId: string | null,
    estadoCodigo: string,
    slaMetaS?: number | null,
  ): Promise<void>;
}

/**
 * Feriados en memoria con las dos fuentes separadas, como el repositorio real: `obtener` es la
 * unión que usa el SLA.
 */
function feriadosEnMemoria(
  globales: () => Promise<FeriadosLaborales> = async () => new Set<string>(),
  propios: () => Promise<FeriadosLaborales> = async () => new Set<string>(),
) {
  return {
    obtenerGlobales: globales,
    obtenerPropios: propios,
    async obtener(): Promise<FeriadosLaborales> {
      const [g, p] = await Promise.all([globales(), propios()]);
      return new Set([...g, ...p]);
    },
  };
}

function armar(
  opciones: {
    horariosPropios?: Record<string, CalendarioLaboralSemanal>;
    /** Feriados globales, de master: su falla no bloquea el cambio del ticket. */
    feriadosGlobales?: () => Promise<FeriadosLaborales>;
    /** Feriados propios del cliente, de la base del tenant. */
    feriadosPropios?: () => Promise<FeriadosLaborales>;
    /** Error de la base del tenant al leer el horario propio del técnico. */
    horarioFalla?: Error;
  } = {},
): Armado {
  const repo = new TramosEnMemoria();
  const logs: string[] = [];
  let ahora = art('2026-10-26T00:00');
  const resolver = new ResolverHorarioLaboralUsuarioService(
    {
      obtener: async (usuarioId) => {
        if (opciones.horarioFalla !== undefined) throw opciones.horarioFalla;
        return opciones.horariosPropios?.[usuarioId] ?? null;
      },
    },
    { obtener: async () => HORARIO_TENANT },
  );
  const servicio = new SincronizarTramoTecnicoService(
    repo,
    resolver,
    feriadosEnMemoria(opciones.feriadosGlobales, opciones.feriadosPropios),
    new CalcularSlaHabilVenceService(),
    { error: (mensaje) => logs.push(mensaje) },
    () => ahora,
  );
  return {
    repo,
    logs,
    async guardar(instante, asignadoId, estadoCodigo, slaMetaS = 3 * 3600) {
      ahora = instante;
      const previo = await servicio.leerPrevio(TICKET);
      if (previo?.estadoCodigo !== estadoCodigo) {
        repo.cambios.push({
          at: instante,
          estadoCodigo,
          estadoAnteriorCodigo: previo?.estadoCodigo ?? null,
        });
      }
      repo.situacion = {
        asignadoId,
        estadoCodigo,
        estadoId: IDS_ESTADO[estadoCodigo],
        slaMetaS,
      };
      await servicio.sincronizar(TICKET, previo);
    },
  };
}

const resumen = (tramos: TramoTecnico[]) =>
  tramos.map((t) => ({
    tecnicoId: t.tecnicoId,
    inicioAt: t.inicioAt.toISOString(),
    finAt: t.finAt?.toISOString() ?? null,
    motivoFin: t.motivoFin,
    habilS: t.habilS,
    metaS: t.metaS,
    cumplido: t.cumplido,
  }));

describe('SincronizarTramoTecnicoService', () => {
  it('mide en el horario del tenant a un técnico sin horario propio (S2)', async () => {
    const { repo, guardar } = armar();
    await guardar(art('2026-10-26T09:00'), ANA, 'ASIGNADO');
    await guardar(art('2026-10-26T13:00'), ANA, 'RESUELTO');

    expect(resumen(repo.tramos)).toEqual([
      {
        tecnicoId: ANA,
        inicioAt: art('2026-10-26T09:00').toISOString(),
        finAt: art('2026-10-26T13:00').toISOString(),
        motivoFin: 'RESUELTO',
        habilS: 4 * 3600,
        metaS: 3 * 3600,
        cumplido: false,
      },
    ]);
  });

  it('con horario propio distinto del tenant mide en el suyo y cambia el veredicto (S1)', async () => {
    const { repo, guardar } = armar({ horariosPropios: { [ANA]: HORARIO_ANA } });
    await guardar(art('2026-10-26T09:00'), ANA, 'ASIGNADO');
    await guardar(art('2026-10-26T13:00'), ANA, 'RESUELTO');

    expect(repo.tramos[0]).toMatchObject({ habilS: 2 * 3600, metaS: 3 * 3600, cumplido: true });
  });

  it('cuenta solo las horas hábiles: la noche y el fin de semana no suman', async () => {
    const { repo, guardar } = armar();
    await guardar(art('2026-10-30T17:00'), ANA, 'ASIGNADO');
    await guardar(art('2026-11-02T10:00'), ANA, 'RESUELTO');

    expect(repo.tramos[0].habilS).toBe(2 * 3600);
  });

  it('descuenta los feriados', async () => {
    const { repo, guardar } = armar({ feriadosGlobales: async () => new Set(['2026-10-27']) });
    await guardar(art('2026-10-26T17:00'), ANA, 'ASIGNADO');
    await guardar(art('2026-10-28T10:00'), ANA, 'RESUELTO');

    expect(repo.tramos[0].habilS).toBe(2 * 3600);
  });

  it('la espera al cliente no suma al tiempo del técnico (S7)', async () => {
    const { repo, guardar } = armar();
    await guardar(art('2026-10-26T09:00'), ANA, 'EN_PROCESO');
    await guardar(art('2026-10-26T10:00'), ANA, 'ESPERANDO_CLIENTE');
    await guardar(art('2026-10-26T12:00'), ANA, 'EN_PROCESO');
    await guardar(art('2026-10-26T13:00'), ANA, 'RESUELTO');

    expect(repo.tramos).toHaveLength(1);
    expect(repo.tramos[0]).toMatchObject({ habilS: 2 * 3600, cumplido: true });
  });

  describe('ticket sin historial de cambios de estado, como los importados (JD-A-002)', () => {
    /** Ticket importado: asignado a Ana y esperando al cliente, sin ningún `CAMBIO_ESTADO`. */
    const importadoEsperando = (repo: TramosEnMemoria): void => {
      repo.situacion = {
        asignadoId: ANA,
        estadoCodigo: 'ESPERANDO_CLIENTE',
        estadoId: IDS_ESTADO.ESPERANDO_CLIENTE,
        slaMetaS: 3 * 3600,
      };
    };

    it('la espera al cliente previa al primer cambio no suma: arranca pausado', async () => {
      const { repo, guardar } = armar();
      importadoEsperando(repo);
      await guardar(art('2026-10-26T09:00'), BETO, 'ESPERANDO_CLIENTE');
      await guardar(art('2026-10-26T11:00'), BETO, 'EN_PROCESO');
      await guardar(art('2026-10-26T12:00'), BETO, 'RESUELTO');

      expect(repo.tramos[0]).toMatchObject({ tecnicoId: BETO, habilS: 3600, cumplido: true });
    });

    it('sin ningún cambio durante el tramo, mide con el estado que tenía el ticket', async () => {
      const { repo, guardar } = armar();
      importadoEsperando(repo);
      await guardar(art('2026-10-26T09:00'), BETO, 'ESPERANDO_CLIENTE');
      await guardar(art('2026-10-26T11:00'), ANA, 'ESPERANDO_CLIENTE');

      expect(repo.tramos[0]).toMatchObject({ tecnicoId: BETO, habilS: 0, motivoFin: 'REASIGNADO' });
    });
  });

  it('cada técnico mide su tramo; solo el que resuelve recibe veredicto (S6)', async () => {
    const { repo, guardar } = armar();
    await guardar(art('2026-10-26T09:00'), ANA, 'EN_PROCESO');
    await guardar(art('2026-10-26T11:00'), BETO, 'EN_PROCESO');
    await guardar(art('2026-10-26T14:00'), BETO, 'RESUELTO');

    expect(resumen(repo.tramos)).toEqual([
      {
        tecnicoId: ANA,
        inicioAt: art('2026-10-26T09:00').toISOString(),
        finAt: art('2026-10-26T11:00').toISOString(),
        motivoFin: 'REASIGNADO',
        habilS: 2 * 3600,
        metaS: 3 * 3600,
        cumplido: null,
      },
      {
        tecnicoId: BETO,
        inicioAt: art('2026-10-26T11:00').toISOString(),
        finAt: art('2026-10-26T14:00').toISOString(),
        motivoFin: 'RESUELTO',
        habilS: 3 * 3600,
        metaS: 3 * 3600,
        cumplido: true,
      },
    ]);
  });

  it('al reabrir abre un tramo nuevo y deja intacto el que cerró en RESUELTO', async () => {
    const { repo, guardar } = armar();
    await guardar(art('2026-10-26T09:00'), ANA, 'EN_PROCESO');
    await guardar(art('2026-10-26T10:00'), ANA, 'RESUELTO');
    await guardar(art('2026-10-26T14:00'), ANA, 'EN_PROCESO');
    await guardar(art('2026-10-26T16:30'), ANA, 'RESUELTO');

    expect(resumen(repo.tramos).map((t) => [t.inicioAt, t.finAt, t.habilS, t.cumplido])).toEqual([
      [art('2026-10-26T09:00').toISOString(), art('2026-10-26T10:00').toISOString(), 3600, true],
      [art('2026-10-26T14:00').toISOString(), art('2026-10-26T16:30').toISOString(), 9000, true],
    ]);
  });

  it('sin meta de SLA el tramo guarda su tiempo y no se evalúa (S4)', async () => {
    const { repo, guardar } = armar();
    await guardar(art('2026-10-26T09:00'), ANA, 'ASIGNADO', null);
    await guardar(art('2026-10-26T10:00'), ANA, 'RESUELTO', null);

    expect(repo.tramos[0]).toMatchObject({ habilS: 3600, metaS: null, cumplido: null });
  });

  it('la meta es la del ticket al cerrar, no la del momento de asignar', async () => {
    const { repo, guardar } = armar();
    await guardar(art('2026-10-26T09:00'), ANA, 'ASIGNADO', null);
    await guardar(art('2026-10-26T13:00'), ANA, 'RESUELTO', 5 * 3600);

    expect(repo.tramos[0]).toMatchObject({ habilS: 4 * 3600, metaS: 5 * 3600, cumplido: true });
  });

  it('asignar y resolver en el mismo guardado deja un tramo de 0 segundos que cumple', async () => {
    const { repo, guardar } = armar();
    await guardar(art('2026-10-26T09:00'), null, 'NUEVO');
    await guardar(art('2026-10-26T10:00'), ANA, 'RESUELTO');

    expect(resumen(repo.tramos)).toEqual([
      {
        tecnicoId: ANA,
        inicioAt: art('2026-10-26T10:00').toISOString(),
        finAt: art('2026-10-26T10:00').toISOString(),
        motivoFin: 'RESUELTO',
        habilS: 0,
        metaS: 3 * 3600,
        cumplido: true,
      },
    ]);
  });

  it('un guardado que no cambia responsable ni estado no toca los tramos', async () => {
    const { repo, guardar } = armar();
    await guardar(art('2026-10-26T09:00'), ANA, 'ASIGNADO');
    const antes = resumen(repo.tramos);

    await guardar(art('2026-10-26T15:00'), ANA, 'ASIGNADO');

    expect(resumen(repo.tramos)).toEqual(antes);
    expect(repo.tramos[0].finAt).toBeNull();
  });

  it('si la medición falla, cierra el tramo sin tiempo ni veredicto y lo loguea', async () => {
    const { repo, logs, guardar } = armar({
      feriadosGlobales: async () => {
        throw new Error('master caído');
      },
    });
    await guardar(art('2026-10-26T09:00'), ANA, 'ASIGNADO');
    await guardar(art('2026-10-26T10:00'), ANA, 'RESUELTO');

    expect(repo.tramos[0]).toMatchObject({
      finAt: art('2026-10-26T10:00'),
      motivoFin: 'RESUELTO',
      habilS: null,
      metaS: 3 * 3600,
      cumplido: null,
    });
    expect(logs).toEqual([
      `TRAMO_TECNICO_MEDICION_FALLO | ticket=${TICKET} | tramo=tramo-1 | master caído`,
    ]);
  });

  it('un error de la base del tenant al leer los feriados del cliente se propaga y no cierra el tramo', async () => {
    // Mismo caso que JD-B-003, con la otra lectura del tenant que hace la medición.
    const falla = new Error('relation "feriados_cliente" does not exist');
    const { repo, logs, guardar } = armar({
      feriadosPropios: async () => {
        throw falla;
      },
    });
    await guardar(art('2026-10-26T09:00'), ANA, 'ASIGNADO');
    const antes = resumen(repo.tramos);

    await expect(guardar(art('2026-10-26T10:00'), ANA, 'RESUELTO')).rejects.toBe(falla);
    expect(resumen(repo.tramos)).toEqual(antes);
    expect(logs).toEqual([]);
  });

  it('descuenta también los feriados propios del cliente', async () => {
    const { repo, guardar } = armar({ feriadosPropios: async () => new Set(['2026-10-27']) });
    await guardar(art('2026-10-26T17:00'), ANA, 'ASIGNADO');
    await guardar(art('2026-10-28T10:00'), ANA, 'RESUELTO');

    expect(repo.tramos[0].habilS).toBe(2 * 3600);
  });

  it('un error de la base del tenant al leer el horario se propaga y no cierra el tramo (JD-B-003)', async () => {
    // En Postgres ese error ya abortó la transacción: tragarlo y seguir con el cierre solo cambia
    // la causa real por un "current transaction is aborted" en el UPDATE del tramo.
    const falla = new Error('relation "horario_laboral_usuario" does not exist');
    const { repo, logs, guardar } = armar({ horarioFalla: falla });
    await guardar(art('2026-10-26T09:00'), ANA, 'ASIGNADO');
    const antes = resumen(repo.tramos);

    await expect(guardar(art('2026-10-26T10:00'), ANA, 'RESUELTO')).rejects.toBe(falla);
    expect(resumen(repo.tramos)).toEqual(antes);
    expect(logs).toEqual([]);
  });

  it('falla si el tramo a cerrar ya no estaba abierto: con la fila bloqueada es un bug', async () => {
    const { repo, guardar } = armar();
    await guardar(art('2026-10-26T09:00'), ANA, 'ASIGNADO');
    repo.cerrar = async () => false;

    await expect(guardar(art('2026-10-26T10:00'), ANA, 'RESUELTO')).rejects.toThrow(
      `Tramos del técnico: el tramo "tramo-1" del ticket "${TICKET}" ya no estaba abierto.`,
    );
  });

  it('falla si el ticket no existe después de guardarlo', async () => {
    const repo = new TramosEnMemoria();
    const servicio = new SincronizarTramoTecnicoService(
      repo,
      { obtenerParaUsuario: async () => ({ calendario: HORARIO_TENANT, origen: 'CLIENTE' }) },
      feriadosEnMemoria(),
      new CalcularSlaHabilVenceService(),
      { error: () => undefined },
    );

    await expect(servicio.sincronizar(TICKET, null)).rejects.toThrow(
      `Tramos del técnico: el ticket "${TICKET}" no existe después de guardarlo.`,
    );
  });
});

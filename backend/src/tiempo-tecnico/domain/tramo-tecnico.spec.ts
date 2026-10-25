import {
  CambioEstadoTramo,
  esMotivoFinTramo,
  evaluarCumplido,
  medirSegundosHabiles,
  planificarTramo,
  SituacionTicketTramo,
  TramoAbierto,
} from './tramo-tecnico';

const ANA = '01900000-0000-7000-8000-0000000000a1';
const BETO = '01900000-0000-7000-8000-0000000000b2';

const situacion = (asignadoId: string | null, estadoCodigo: string): SituacionTicketTramo => ({
  asignadoId,
  estadoCodigo,
});
const tramoDe = (tecnicoId: string): TramoAbierto => ({
  id: 'tramo-1',
  tecnicoId,
  inicioAt: new Date('2026-10-26T12:00:00Z'),
});

describe('planificarTramo (L9)', () => {
  it('el alta con asignado abre un tramo', () => {
    expect(planificarTramo(null, situacion(ANA, 'ASIGNADO'), null)).toEqual({
      cerrar: null,
      abrir: { tecnicoId: ANA, cerrarAlAbrir: null },
    });
  });

  it('el alta sin asignado no abre nada', () => {
    expect(planificarTramo(null, situacion(null, 'NUEVO'), null)).toEqual({
      cerrar: null,
      abrir: null,
    });
  });

  it('asignar un ticket sin responsable abre el tramo del asignado', () => {
    expect(planificarTramo(situacion(null, 'NUEVO'), situacion(ANA, 'ASIGNADO'), null)).toEqual({
      cerrar: null,
      abrir: { tecnicoId: ANA, cerrarAlAbrir: null },
    });
  });

  it('reasignar cierra el tramo del anterior como REASIGNADO y abre el del nuevo (S6)', () => {
    const abierto = tramoDe(ANA);
    expect(
      planificarTramo(situacion(ANA, 'EN_PROCESO'), situacion(BETO, 'EN_PROCESO'), abierto),
    ).toEqual({
      cerrar: { tramo: abierto, motivo: 'REASIGNADO' },
      abrir: { tecnicoId: BETO, cerrarAlAbrir: null },
    });
  });

  it('reasignar mientras espera al cliente también cambia de tramo', () => {
    const abierto = tramoDe(ANA);
    expect(
      planificarTramo(
        situacion(ANA, 'ESPERANDO_CLIENTE'),
        situacion(BETO, 'ESPERANDO_CLIENTE'),
        abierto,
      ),
    ).toEqual({
      cerrar: { tramo: abierto, motivo: 'REASIGNADO' },
      abrir: { tecnicoId: BETO, cerrarAlAbrir: null },
    });
  });

  it('desasignar cierra el tramo como DESASIGNADO y no abre otro', () => {
    const abierto = tramoDe(ANA);
    expect(
      planificarTramo(situacion(ANA, 'EN_PROCESO'), situacion(null, 'EN_PROCESO'), abierto),
    ).toEqual({ cerrar: { tramo: abierto, motivo: 'DESASIGNADO' }, abrir: null });
  });

  it.each(['RESUELTO', 'CERRADO', 'CANCELADO'] as const)(
    'pasar a %s cierra el tramo con ese motivo (S5)',
    (estado) => {
      const abierto = tramoDe(ANA);
      expect(
        planificarTramo(situacion(ANA, 'EN_PROCESO'), situacion(ANA, estado), abierto),
      ).toEqual({ cerrar: { tramo: abierto, motivo: estado }, abrir: null });
    },
  );

  it('un cambio de estado que no cierra deja el tramo abierto', () => {
    expect(
      planificarTramo(
        situacion(ANA, 'EN_PROCESO'),
        situacion(ANA, 'ESPERANDO_CLIENTE'),
        tramoDe(ANA),
      ),
    ).toEqual({ cerrar: null, abrir: null });
  });

  it.each(['RESUELTO', 'CERRADO', 'CANCELADO'])(
    'reabrir desde %s con asignado abre un tramo nuevo',
    (desde) => {
      expect(planificarTramo(situacion(ANA, desde), situacion(ANA, 'EN_PROCESO'), null)).toEqual({
        cerrar: null,
        abrir: { tecnicoId: ANA, cerrarAlAbrir: null },
      });
    },
  );

  it('reabrir sin asignado no abre nada', () => {
    expect(
      planificarTramo(situacion(null, 'RESUELTO'), situacion(null, 'EN_PROCESO'), null),
    ).toEqual({ cerrar: null, abrir: null });
  });

  it('pasar de RESUELTO a CERRADO no abre ni cierra (el tramo ya cerró en RESUELTO)', () => {
    expect(planificarTramo(situacion(ANA, 'RESUELTO'), situacion(ANA, 'CERRADO'), null)).toEqual({
      cerrar: null,
      abrir: null,
    });
  });

  it('un ticket con responsable de antes del deploy no abre tramo si no cambia de manos', () => {
    expect(planificarTramo(situacion(ANA, 'ASIGNADO'), situacion(ANA, 'EN_PROCESO'), null)).toEqual(
      { cerrar: null, abrir: null },
    );
    expect(planificarTramo(situacion(ANA, 'EN_PROCESO'), situacion(ANA, 'RESUELTO'), null)).toEqual(
      { cerrar: null, abrir: null },
    );
  });

  it('un ticket de antes del deploy que se reasigna abre el tramo del nuevo', () => {
    expect(
      planificarTramo(situacion(ANA, 'EN_PROCESO'), situacion(BETO, 'EN_PROCESO'), null),
    ).toEqual({ cerrar: null, abrir: { tecnicoId: BETO, cerrarAlAbrir: null } });
  });

  it('asignar y resolver en el mismo guardado abre y cierra el tramo en el acto', () => {
    expect(planificarTramo(situacion(null, 'NUEVO'), situacion(ANA, 'RESUELTO'), null)).toEqual({
      cerrar: null,
      abrir: { tecnicoId: ANA, cerrarAlAbrir: 'RESUELTO' },
    });
  });

  it('asignar a otro un ticket que ya estaba RESUELTO no abre nada: ese técnico no lo resolvió', () => {
    expect(planificarTramo(situacion(ANA, 'RESUELTO'), situacion(BETO, 'RESUELTO'), null)).toEqual({
      cerrar: null,
      abrir: null,
    });
  });
});

const T0 = new Date('2026-10-26T12:00:00Z');
const enHoras = (horas: number): Date => new Date(T0.getTime() + horas * 3_600_000);
const cambio = (horas: number, estadoCodigo: string): CambioEstadoTramo => ({
  at: enHoras(horas),
  estadoCodigo,
});
/** Reloj 24/7: el tiempo hábil es el tiempo corrido. */
const corrido = (desde: Date, hasta: Date): number => hasta.getTime() - desde.getTime();

describe('medirSegundosHabiles (S5, S7)', () => {
  it('sin cambios de estado cuenta todo el tramo', () => {
    expect(medirSegundosHabiles(T0, enHoras(5), [], corrido)).toBe(5 * 3600);
  });

  it('la espera al cliente pausa el reloj del técnico', () => {
    const cambios = [cambio(1, 'ESPERANDO_CLIENTE'), cambio(3, 'EN_PROCESO')];
    expect(medirSegundosHabiles(T0, enHoras(5), cambios, corrido)).toBe(3 * 3600);
  });

  it('toma el estado al inicio del último cambio anterior: si esperaba al cliente, arranca pausado', () => {
    const cambios = [
      cambio(-10, 'EN_PROCESO'),
      cambio(-2, 'ESPERANDO_CLIENTE'),
      cambio(2, 'EN_PROCESO'),
    ];
    expect(medirSegundosHabiles(T0, enHoras(5), cambios, corrido)).toBe(3 * 3600);
  });

  it('un cambio justo en el inicio define el estado del arranque', () => {
    const cambios = [cambio(0, 'ESPERANDO_CLIENTE'), cambio(4, 'EN_PROCESO')];
    expect(medirSegundosHabiles(T0, enHoras(5), cambios, corrido)).toBe(3600);
  });

  it('ignora los cambios posteriores al fin y acepta los cambios desordenados', () => {
    const cambios = [
      cambio(9, 'ESPERANDO_CLIENTE'),
      cambio(3, 'EN_PROCESO'),
      cambio(1, 'ESPERANDO_CLIENTE'),
    ];
    expect(medirSegundosHabiles(T0, enHoras(5), cambios, corrido)).toBe(3 * 3600);
  });

  it('mide en el horario recibido: solo suma lo que esa función cuenta como hábil', () => {
    const tramos: Array<[string, string]> = [];
    const mitad = (desde: Date, hasta: Date): number => {
      tramos.push([desde.toISOString(), hasta.toISOString()]);
      return (hasta.getTime() - desde.getTime()) / 2;
    };
    const cambios = [cambio(1, 'ESPERANDO_CLIENTE'), cambio(3, 'EN_PROCESO')];

    expect(medirSegundosHabiles(T0, enHoras(5), cambios, mitad)).toBe(1.5 * 3600);
    expect(tramos).toEqual([
      [T0.toISOString(), enHoras(1).toISOString()],
      [enHoras(3).toISOString(), enHoras(5).toISOString()],
    ]);
  });

  it('un tramo sin duración mide 0 sin consultar el horario', () => {
    const sinLlamar = (): number => {
      throw new Error('no debía medir');
    };
    expect(medirSegundosHabiles(T0, T0, [], sinLlamar)).toBe(0);
  });

  it('redondea a segundos', () => {
    expect(medirSegundosHabiles(T0, new Date(T0.getTime() + 1_600), [], corrido)).toBe(2);
  });
});

describe('evaluarCumplido (S4, S6)', () => {
  it('el tramo que resuelve dentro de la meta cumple, incluido el límite exacto', () => {
    expect(evaluarCumplido('RESUELTO', 3600, 7200)).toBe(true);
    expect(evaluarCumplido('RESUELTO', 7200, 7200)).toBe(true);
  });

  it('el tramo que resuelve pasado de la meta no cumple', () => {
    expect(evaluarCumplido('RESUELTO', 7201, 7200)).toBe(false);
  });

  it.each(['REASIGNADO', 'DESASIGNADO', 'CERRADO', 'CANCELADO'] as const)(
    'un tramo cerrado como %s guarda su tiempo sin veredicto',
    (motivo) => {
      expect(evaluarCumplido(motivo, 3600, 7200)).toBeNull();
    },
  );

  it('sin meta no se evalúa', () => {
    expect(evaluarCumplido('RESUELTO', 3600, null)).toBeNull();
  });

  it('sin medición no se evalúa', () => {
    expect(evaluarCumplido('RESUELTO', null, 7200)).toBeNull();
  });
});

describe('esMotivoFinTramo', () => {
  it('acepta los cinco motivos y rechaza cualquier otro texto', () => {
    for (const motivo of ['REASIGNADO', 'DESASIGNADO', 'RESUELTO', 'CERRADO', 'CANCELADO']) {
      expect(esMotivoFinTramo(motivo)).toBe(true);
    }
    expect(esMotivoFinTramo('resuelto')).toBe(false);
    expect(esMotivoFinTramo('VENCIDO')).toBe(false);
  });
});

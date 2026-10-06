/**
 * calcular-sla-habil-vence.service.spec.ts — WU-1 (sdd/sla-habil).
 *
 * RED→GREEN: `CalcularSlaHabilVenceService` (cálculo puro de dominio del
 * vencimiento de SLA sobre horas HÁBILES, en contraste con el reloj 24/7 de
 * `CalcularSlaVenceService`). Ver esa clase para el criterio de validación de
 * `horas` (S2/S3), reutilizado acá sin cambios.
 *
 * Estrategia: una única tabla `it.each` con instante de creación, horas de
 * SLA, feriados del caso y vencimiento esperado — cada fila ejercita una
 * regla de negocio distinta (ver descripción de cada fila). Los instantes se
 * escriben en UTC porque `creadoEn` y el resultado son instantes reales
 * (`@db.Timestamptz`); la conversión a hora local Argentina (UTC-3 fijo, sin
 * horario de verano) está hecha a mano en cada comentario para que la tabla
 * se pueda auditar sin ejecutar nada.
 */
import {
  CalendarioLaboralSemanal,
  CalcularSlaHabilVenceService,
} from './calcular-sla-habil-vence.service';

/**
 * Calendario de producción (regla de negocio 4 del WU): lunes a viernes
 * 09:00–18:00 (540–1080 minutos desde medianoche local), sábado y domingo
 * cerrados. Índice = día de semana ISO-JS (0 = domingo … 6 = sábado), igual
 * a `CalendarioLaboralDiaCliente.diaSemana` en
 * `prisma_tenant/schema.prisma:1315-1323` (sdd/horario-laboral-por-cliente).
 */
const CALENDARIO_L_A_V_9_A_18: CalendarioLaboralSemanal = [
  { aperturaMinuto: null, cierreMinuto: null }, // domingo
  { aperturaMinuto: 540, cierreMinuto: 1080 }, // lunes
  { aperturaMinuto: 540, cierreMinuto: 1080 }, // martes
  { aperturaMinuto: 540, cierreMinuto: 1080 }, // miércoles
  { aperturaMinuto: 540, cierreMinuto: 1080 }, // jueves
  { aperturaMinuto: 540, cierreMinuto: 1080 }, // viernes
  { aperturaMinuto: null, cierreMinuto: null }, // sábado
];

/** Calendario sin ningún día abierto — caso borde de búsqueda sin fin. */
const CALENDARIO_TOTALMENTE_CERRADO: CalendarioLaboralSemanal = [
  { aperturaMinuto: null, cierreMinuto: null },
  { aperturaMinuto: null, cierreMinuto: null },
  { aperturaMinuto: null, cierreMinuto: null },
  { aperturaMinuto: null, cierreMinuto: null },
  { aperturaMinuto: null, cierreMinuto: null },
  { aperturaMinuto: null, cierreMinuto: null },
  { aperturaMinuto: null, cierreMinuto: null },
];

const SIN_FERIADOS: readonly string[] = [];

interface FilaVenceHabil {
  readonly descripcion: string;
  readonly creadoEnIso: string;
  readonly horas: number;
  readonly feriados: readonly string[];
  readonly venceEsperadoIso: string;
}

const TABLA_VENCE_HABIL: readonly FilaVenceHabil[] = [
  {
    descripcion: 'dentro de horario, sin cruzar nada (miércoles 10:00 + 2h → 12:00)',
    // Miércoles 2026-08-05, 10:00 local = 13:00Z.
    creadoEnIso: '2026-08-05T13:00:00.000Z',
    horas: 2,
    feriados: SIN_FERIADOS,
    // 12:00 local = 15:00Z.
    venceEsperadoIso: '2026-08-05T15:00:00.000Z',
  },
  {
    descripcion:
      'fuera de horario a la noche → arranca en la apertura del día siguiente (miércoles 20:00 + 1h → jueves 10:00)',
    // Miércoles 2026-08-05, 20:00 local (después del cierre 18:00) = 23:00Z.
    creadoEnIso: '2026-08-05T23:00:00.000Z',
    horas: 1,
    feriados: SIN_FERIADOS,
    // Jueves 2026-08-06, 09:00 + 1h = 10:00 local = 13:00Z.
    venceEsperadoIso: '2026-08-06T13:00:00.000Z',
  },
  {
    descripcion:
      'viernes tarde → cruza el fin de semana, arranca el lunes 09:00 (viernes 20:00 + 4h → lunes 13:00)',
    // Viernes 2026-08-07, 20:00 local = 23:00Z.
    creadoEnIso: '2026-08-07T23:00:00.000Z',
    horas: 4,
    feriados: SIN_FERIADOS,
    // Lunes 2026-08-10, 09:00 + 4h = 13:00 local = 16:00Z.
    venceEsperadoIso: '2026-08-10T16:00:00.000Z',
  },
  {
    descripcion:
      'cruce de feriado en día hábil del calendario (jueves 17:00 + 2h, viernes feriado → lunes 10:00)',
    // Jueves 2026-04-30, 17:00 local (1h libre hasta el cierre) = 20:00Z.
    creadoEnIso: '2026-04-30T20:00:00.000Z',
    horas: 2,
    // 2026-05-01 (viernes) feriado — día hábil del calendario pero cerrado.
    feriados: ['2026-05-01'],
    // Consume 1h el jueves (queda 1h) → viernes feriado, sáb/dom cerrados →
    // lunes 2026-05-04, 09:00 + 1h = 10:00 local = 13:00Z.
    venceEsperadoIso: '2026-05-04T13:00:00.000Z',
  },
  {
    descripcion:
      'feriado pegado a un fin de semana (miércoles 17:00 + 2h, jueves y viernes feriados → lunes 10:00)',
    // Miércoles 2026-12-23, 17:00 local (1h libre hasta el cierre) = 20:00Z.
    creadoEnIso: '2026-12-23T20:00:00.000Z',
    horas: 2,
    // Jueves 24 y viernes 25 feriados, sábado 26 y domingo 27 cerrados por calendario.
    feriados: ['2026-12-24', '2026-12-25'],
    // Consume 1h el miércoles (queda 1h) → lunes 2026-12-28, 09:00 + 1h = 10:00 local = 13:00Z.
    venceEsperadoIso: '2026-12-28T13:00:00.000Z',
  },
  {
    descripcion:
      'SLA de varios días, consume la ventana completa de dos días y sigue en el tercero (lunes 09:00 + 20h → miércoles 11:00)',
    // Lunes 2026-08-03, 09:00 local exacto (apertura) = 12:00Z.
    creadoEnIso: '2026-08-03T12:00:00.000Z',
    horas: 20,
    feriados: SIN_FERIADOS,
    // Lunes consume 9h (queda 11h), martes consume 9h (queda 2h),
    // miércoles 09:00 + 2h = 11:00 local = 14:00Z.
    venceEsperadoIso: '2026-08-05T14:00:00.000Z',
  },
  {
    descripcion: 'borde exacto de apertura — instante == apertura cuenta como dentro de la ventana',
    // Lunes 2026-08-03, 09:00:00.000 local exacto = 12:00Z.
    creadoEnIso: '2026-08-03T12:00:00.000Z',
    horas: 1,
    feriados: SIN_FERIADOS,
    // 09:00 + 1h = 10:00 local = 13:00Z.
    venceEsperadoIso: '2026-08-03T13:00:00.000Z',
  },
  {
    descripcion:
      'borde exacto de cierre — instante == cierre NO cuenta como dentro (ventana [apertura, cierre)), arranca al día siguiente',
    // Lunes 2026-08-03, 18:00:00.000 local exacto (== cierre) = 21:00Z.
    creadoEnIso: '2026-08-03T21:00:00.000Z',
    horas: 1,
    feriados: SIN_FERIADOS,
    // Martes 2026-08-04, 09:00 + 1h = 10:00 local = 13:00Z.
    venceEsperadoIso: '2026-08-04T13:00:00.000Z',
  },
  {
    descripcion:
      'SLA que termina exactamente en el cierre de la ventana (lunes 09:00 + 9h → 18:00 exacto)',
    // Lunes 2026-08-03, 09:00 local exacto = 12:00Z.
    creadoEnIso: '2026-08-03T12:00:00.000Z',
    horas: 9,
    feriados: SIN_FERIADOS,
    // 09:00 + 9h = 18:00 local exacto = 21:00Z.
    venceEsperadoIso: '2026-08-03T21:00:00.000Z',
  },

  // Las tres filas que siguen ejercitan la llamada inicial de
  // `buscarInicioVentanaAbierta`, cada una por una salida distinta:
  //
  // - La PRIMERA cubre la rama `offset === 0` con el instante ANTES de la
  //   apertura. Es la única de las tres que llega hasta ahí, y solo se alcanza
  //   desde la llamada inicial con `creadoEn`: en las siguientes el cursor
  //   entra valiendo el cierre de la ventana anterior, así que ninguna fila de
  //   cruce la ejercita de rebote. Un ticket abierto a las 07:00 de un día
  //   hábil no es un caso raro.
  // - La SEGUNDA sale antes, en `aperturaMinuto === null` (día cerrado por
  //   calendario).
  // - La TERCERA sale antes también, en `feriados.has(claveDia)`, con un
  //   instante que SÍ está dentro de la ventana horaria: verifica que el
  //   feriado gana sobre el calendario.
  {
    descripcion:
      'antes de la apertura en un día hábil → arranca en la apertura del MISMO día (miércoles 07:00 + 2h → 11:00)',
    // Miércoles 2026-08-05, 07:00 local (antes de la apertura 09:00) = 10:00Z.
    creadoEnIso: '2026-08-05T10:00:00.000Z',
    horas: 2,
    feriados: SIN_FERIADOS,
    // Mismo día: 09:00 + 2h = 11:00 local = 14:00Z.
    venceEsperadoIso: '2026-08-05T14:00:00.000Z',
  },
  {
    descripcion: 'creado en un día cerrado por calendario (sábado 12:00 + 1h → lunes 10:00)',
    // Sábado 2026-08-08, 12:00 local = 15:00Z. El sábado está cerrado.
    creadoEnIso: '2026-08-08T15:00:00.000Z',
    horas: 1,
    feriados: SIN_FERIADOS,
    // Sábado y domingo cerrados → lunes 2026-08-10, 09:00 + 1h = 10:00 local = 13:00Z.
    venceEsperadoIso: '2026-08-10T13:00:00.000Z',
  },
  {
    descripcion:
      'creado DENTRO del horario pero en un feriado (viernes feriado 10:00 + 1h → lunes 10:00)',
    // Viernes 2026-05-01, 10:00 local = 13:00Z. Dentro de la ventana del
    // calendario, pero el día es feriado: el feriado gana.
    creadoEnIso: '2026-05-01T13:00:00.000Z',
    horas: 1,
    feriados: ['2026-05-01'],
    // Feriado, sáb y dom cerrados → lunes 2026-05-04, 09:00 + 1h = 10:00 local = 13:00Z.
    venceEsperadoIso: '2026-05-04T13:00:00.000Z',
  },
];

describe('CalcularSlaHabilVenceService', () => {
  const service = new CalcularSlaHabilVenceService();

  describe('venceAt() — tabla de verdad de horas hábiles (calendario L-V 09:00–18:00)', () => {
    it.each(TABLA_VENCE_HABIL)(
      '$descripcion',
      ({ creadoEnIso, horas, feriados, venceEsperadoIso }) => {
        const resultado = service.venceAt(
          new Date(creadoEnIso),
          horas,
          CALENDARIO_L_A_V_9_A_18,
          new Set(feriados),
        );

        expect(resultado.toISOString()).toBe(venceEsperadoIso);
      },
    );
  });

  it('venceAt() lanza un error acotado si el calendario no tiene ningún día abierto', () => {
    const creadoEn = new Date('2026-08-05T13:00:00.000Z');

    expect(() => service.venceAt(creadoEn, 1, CALENDARIO_TOTALMENTE_CERRADO, new Set())).toThrow(
      /día hábil|ventana/i,
    );
  });

  it('venceAt() lanza si horas no es > 0 (mismo criterio que CalcularSlaVenceService)', () => {
    const creadoEn = new Date('2026-08-05T13:00:00.000Z');

    expect(() => service.venceAt(creadoEn, 0, CALENDARIO_L_A_V_9_A_18, new Set())).toThrow(
      /horas/i,
    );
    expect(() => service.venceAt(creadoEn, -1, CALENDARIO_L_A_V_9_A_18, new Set())).toThrow(
      /horas/i,
    );
  });

  it('venceAt() lanza si horas no es un número finito (NaN/Infinity)', () => {
    const creadoEn = new Date('2026-08-05T13:00:00.000Z');

    expect(() => service.venceAt(creadoEn, Number.NaN, CALENDARIO_L_A_V_9_A_18, new Set())).toThrow(
      /horas/i,
    );
    expect(() =>
      service.venceAt(creadoEn, Number.POSITIVE_INFINITY, CALENDARIO_L_A_V_9_A_18, new Set()),
    ).toThrow(/horas/i);
  });
});

/**
 * WU-2 (sdd/sla-primera-respuesta-y-pausa, ADR-2): `msHabilesEntre` y
 * `sumarMsHabiles` sobre el mismo núcleo que `venceAt`. Calendario L-V
 * 09:00–18:00 local (UTC-3): 09:00 local = 12:00Z, 18:00 local = 21:00Z.
 */
describe('CalcularSlaHabilVenceService — msHabilesEntre / sumarMsHabiles', () => {
  const service = new CalcularSlaHabilVenceService();
  const HORA = 3_600_000;
  const entre = (desde: string, hasta: string, feriados: readonly string[] = SIN_FERIADOS) =>
    service.msHabilesEntre(
      new Date(desde),
      new Date(hasta),
      CALENDARIO_L_A_V_9_A_18,
      new Set(feriados),
    );
  const sumar = (desde: string, ms: number, feriados: readonly string[] = SIN_FERIADOS) =>
    service
      .sumarMsHabiles(new Date(desde), ms, CALENDARIO_L_A_V_9_A_18, new Set(feriados))
      .toISOString();

  describe('msHabilesEntre()', () => {
    it('dentro de una ventana mide el tramo (miércoles 10:00 a 12:30 = 2,5 h)', () => {
      expect(entre('2026-08-05T13:00:00.000Z', '2026-08-05T15:30:00.000Z')).toBe(2.5 * HORA);
    });

    it('la apertura se incluye: desde la apertura exacta cuenta desde 09:00', () => {
      expect(entre('2026-08-05T12:00:00.000Z', '2026-08-05T13:00:00.000Z')).toBe(HORA);
    });

    it('el cierre es exclusivo: un rango que empieza en el cierre (18:00) suma 0', () => {
      expect(entre('2026-08-05T21:00:00.000Z', '2026-08-05T23:00:00.000Z')).toBe(0);
    });

    it('un rango que termina en el cierre suma hasta el cierre', () => {
      expect(entre('2026-08-05T20:00:00.000Z', '2026-08-05T21:00:00.000Z')).toBe(HORA);
    });

    it('cruza el fin de semana: viernes 17:00 a lunes 10:00 = 1 h + 1 h', () => {
      // Viernes 17:00 local = 20:00Z; lunes 10:00 local = 13:00Z.
      expect(entre('2026-08-07T20:00:00.000Z', '2026-08-10T13:00:00.000Z')).toBe(2 * HORA);
    });

    it('un feriado entre medio no suma: lunes feriado, viernes 17:00 a martes 10:00 = 1 h + 1 h', () => {
      expect(entre('2026-08-07T20:00:00.000Z', '2026-08-11T13:00:00.000Z', ['2026-08-10'])).toBe(
        2 * HORA,
      );
    });

    it('un día cerrado (sábado) no suma', () => {
      expect(entre('2026-08-08T13:00:00.000Z', '2026-08-08T20:00:00.000Z')).toBe(0);
    });

    it('hasta <= desde devuelve 0', () => {
      expect(entre('2026-08-05T15:00:00.000Z', '2026-08-05T15:00:00.000Z')).toBe(0);
      expect(entre('2026-08-05T15:00:00.000Z', '2026-08-05T13:00:00.000Z')).toBe(0);
    });

    it('un tramo sin ventana abierta (calendario cerrado) suma 0 sin lanzar', () => {
      const ms = service.msHabilesEntre(
        new Date('2026-08-05T13:00:00.000Z'),
        new Date('2026-09-05T13:00:00.000Z'),
        CALENDARIO_TOTALMENTE_CERRADO,
        new Set(),
      );

      expect(ms).toBe(0);
    });

    it('lanza si el rango excede LIMITE_DIAS_RANGO = 3_700 días, y acepta el límite exacto', () => {
      const desde = new Date('2026-08-05T13:00:00.000Z');
      const enElLimite = new Date(desde.getTime() + 3_700 * 86_400_000);
      const pasado = new Date(enElLimite.getTime() + 1);

      expect(() =>
        service.msHabilesEntre(desde, enElLimite, CALENDARIO_L_A_V_9_A_18, new Set()),
      ).not.toThrow();
      expect(() =>
        service.msHabilesEntre(desde, pasado, CALENDARIO_L_A_V_9_A_18, new Set()),
      ).toThrow(/3700|3\.700/);
    });
  });

  describe('sumarMsHabiles()', () => {
    it('ms = 0 devuelve desde sin alinearlo a una ventana', () => {
      // Sábado 12:00 local: día cerrado.
      expect(sumar('2026-08-08T15:00:00.000Z', 0)).toBe('2026-08-08T15:00:00.000Z');
    });

    it('cruza el fin de semana: viernes 17:00 + 2 h cae el lunes 10:00', () => {
      expect(sumar('2026-08-07T20:00:00.000Z', 2 * HORA)).toBe('2026-08-10T13:00:00.000Z');
    });

    it('cruza un feriado: lunes feriado, viernes 17:00 + 2 h cae el martes 10:00', () => {
      expect(sumar('2026-08-07T20:00:00.000Z', 2 * HORA, ['2026-08-10'])).toBe(
        '2026-08-11T13:00:00.000Z',
      );
    });

    it('viernes 17:30 con cierre 18:00 y meta 2 h vence el lunes 1 h 30 min después de la apertura', () => {
      // Viernes 17:30 local = 20:30Z; 30 min hoy, 1 h 30 min el lunes: 09:00 + 1:30 = 10:30 local = 13:30Z.
      expect(sumar('2026-08-07T20:30:00.000Z', 2 * HORA)).toBe('2026-08-10T13:30:00.000Z');
    });

    it('lanza si ms es negativo o no finito', () => {
      const desde = new Date('2026-08-05T13:00:00.000Z');

      expect(() => service.sumarMsHabiles(desde, -1, CALENDARIO_L_A_V_9_A_18, new Set())).toThrow(
        /ms/,
      );
      expect(() =>
        service.sumarMsHabiles(desde, Number.NaN, CALENDARIO_L_A_V_9_A_18, new Set()),
      ).toThrow(/ms/);
    });

    it('conserva LIMITE_DIAS_BUSQUEDA = 400: 401 ventanas hábiles de 9 h lanzan, 400 no', () => {
      const desde = new Date('2026-08-05T12:00:00.000Z'); // miércoles 09:00 local
      const calendarioTodosLosDias: CalendarioLaboralSemanal = [
        { aperturaMinuto: 540, cierreMinuto: 1080 },
        { aperturaMinuto: 540, cierreMinuto: 1080 },
        { aperturaMinuto: 540, cierreMinuto: 1080 },
        { aperturaMinuto: 540, cierreMinuto: 1080 },
        { aperturaMinuto: 540, cierreMinuto: 1080 },
        { aperturaMinuto: 540, cierreMinuto: 1080 },
        { aperturaMinuto: 540, cierreMinuto: 1080 },
      ];

      expect(() =>
        service.sumarMsHabiles(desde, 400 * 9 * HORA, calendarioTodosLosDias, new Set()),
      ).not.toThrow();
      expect(() =>
        service.sumarMsHabiles(desde, 402 * 9 * HORA, calendarioTodosLosDias, new Set()),
      ).toThrow(/ventanas hábiles/);
    });
  });

  describe('venceAt() delega en sumarMsHabiles()', () => {
    it('venceAt(creadoEn, h) equivale a sumarMsHabiles(creadoEn, h * 3_600_000)', () => {
      const creadoEn = new Date('2026-08-07T20:30:00.000Z');

      expect(service.venceAt(creadoEn, 2, CALENDARIO_L_A_V_9_A_18, new Set()).toISOString()).toBe(
        sumar(creadoEn.toISOString(), 2 * HORA),
      );
    });
  });
});

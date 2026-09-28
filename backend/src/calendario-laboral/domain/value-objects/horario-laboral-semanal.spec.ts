import { describe, expect, it } from 'vitest';
import { DiaHorarioEntrada, HorarioLaboralSemanal } from './horario-laboral-semanal';

/** Horario por defecto sembrado por D1: lunes a viernes 540-1080, sábado y domingo cerrados. */
function diasDefault(): DiaHorarioEntrada[] {
  return [
    { diaSemana: 0, aperturaMinuto: null, cierreMinuto: null },
    { diaSemana: 1, aperturaMinuto: 540, cierreMinuto: 1080 },
    { diaSemana: 2, aperturaMinuto: 540, cierreMinuto: 1080 },
    { diaSemana: 3, aperturaMinuto: 540, cierreMinuto: 1080 },
    { diaSemana: 4, aperturaMinuto: 540, cierreMinuto: 1080 },
    { diaSemana: 5, aperturaMinuto: 540, cierreMinuto: 1080 },
    { diaSemana: 6, aperturaMinuto: null, cierreMinuto: null },
  ];
}

/** Reemplaza la entrada de `diaSemana` por otra, conservando el resto sin tocar. */
function conDia(
  dias: DiaHorarioEntrada[],
  diaSemana: number,
  patch: Partial<DiaHorarioEntrada>,
): DiaHorarioEntrada[] {
  return dias.map((dia) => (dia.diaSemana === diaSemana ? { ...dia, ...patch } : dia));
}

describe('HorarioLaboralSemanal.crear — cantidad y unicidad de días', () => {
  it('acepta el horario default de 7 días (lun-vie 540-1080, sáb/dom cerrados)', () => {
    const resultado = HorarioLaboralSemanal.crear(diasDefault());

    expect(resultado.isOk()).toBe(true);
  });

  it('rechaza un array de 6 días', () => {
    const resultado = HorarioLaboralSemanal.crear(diasDefault().slice(0, 6));

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError().code).toBe('HORARIO_LABORAL_DIAS_INVALIDOS');
  });

  it('rechaza un array de 8 días', () => {
    const ocho = [...diasDefault(), { diaSemana: 6, aperturaMinuto: null, cierreMinuto: null }];

    const resultado = HorarioLaboralSemanal.crear(ocho);

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError().code).toBe('HORARIO_LABORAL_DIAS_INVALIDOS');
  });

  it('rechaza un array vacío', () => {
    const resultado = HorarioLaboralSemanal.crear([]);

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError().code).toBe('HORARIO_LABORAL_DIAS_INVALIDOS');
  });

  it('rechaza lunes repetido y domingo faltante (7 entradas, pero no cubren 0..6)', () => {
    const dias = diasDefault().map((dia) => (dia.diaSemana === 0 ? { ...dia, diaSemana: 1 } : dia));

    const resultado = HorarioLaboralSemanal.crear(dias);

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError().code).toBe('HORARIO_LABORAL_DIAS_INVALIDOS');
  });

  it('rechaza diaSemana = -1 (límite inferior fuera de rango)', () => {
    const dias = conDia(diasDefault(), 0, { diaSemana: -1 });

    const resultado = HorarioLaboralSemanal.crear(dias);

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError().code).toBe('HORARIO_LABORAL_DIAS_INVALIDOS');
  });

  it('rechaza diaSemana = 7 (límite superior fuera de rango)', () => {
    const dias = conDia(diasDefault(), 6, { diaSemana: 7 });

    const resultado = HorarioLaboralSemanal.crear(dias);

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError().code).toBe('HORARIO_LABORAL_DIAS_INVALIDOS');
  });

  it('rechaza un diaSemana no entero', () => {
    const dias = conDia(diasDefault(), 1, { diaSemana: 1.5 });

    const resultado = HorarioLaboralSemanal.crear(dias);

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError().code).toBe('HORARIO_LABORAL_DIAS_INVALIDOS');
  });
});

describe('HorarioLaboralSemanal.crear — ventana de cada día', () => {
  it('rechaza apertura mayor que cierre', () => {
    const dias = conDia(diasDefault(), 1, { aperturaMinuto: 1080, cierreMinuto: 540 });

    const resultado = HorarioLaboralSemanal.crear(dias);

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError().code).toBe('VENTANA_LABORAL_INVALIDA');
  });

  it('rechaza apertura igual a cierre (ventana de duración cero)', () => {
    const dias = conDia(diasDefault(), 1, { aperturaMinuto: 600, cierreMinuto: 600 });

    const resultado = HorarioLaboralSemanal.crear(dias);

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError().code).toBe('VENTANA_LABORAL_INVALIDA');
  });

  it('rechaza un solo extremo null (apertura null, cierre numérico)', () => {
    const dias = conDia(diasDefault(), 1, { aperturaMinuto: null, cierreMinuto: 1080 });

    const resultado = HorarioLaboralSemanal.crear(dias);

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError().code).toBe('VENTANA_LABORAL_INVALIDA');
  });

  it('rechaza un solo extremo null (apertura numérica, cierre null)', () => {
    const dias = conDia(diasDefault(), 1, { aperturaMinuto: 540, cierreMinuto: null });

    const resultado = HorarioLaboralSemanal.crear(dias);

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError().code).toBe('VENTANA_LABORAL_INVALIDA');
  });

  it('rechaza cierre = 1441 (por encima del techo del día)', () => {
    const dias = conDia(diasDefault(), 1, { aperturaMinuto: 540, cierreMinuto: 1441 });

    const resultado = HorarioLaboralSemanal.crear(dias);

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError().code).toBe('VENTANA_LABORAL_INVALIDA');
  });

  it('rechaza apertura = -1 (por debajo del piso del día)', () => {
    const dias = conDia(diasDefault(), 1, { aperturaMinuto: -1, cierreMinuto: 1080 });

    const resultado = HorarioLaboralSemanal.crear(dias);

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError().code).toBe('VENTANA_LABORAL_INVALIDA');
  });

  it('rechaza minutos no enteros', () => {
    const dias = conDia(diasDefault(), 1, { aperturaMinuto: 540.5, cierreMinuto: 1080 });

    const resultado = HorarioLaboralSemanal.crear(dias);

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError().code).toBe('VENTANA_LABORAL_INVALIDA');
  });

  it('acepta apertura = 0 y cierre = 1440 (día abierto las 24 horas, ambos límites incluidos)', () => {
    const dias = conDia(diasDefault(), 1, { aperturaMinuto: 0, cierreMinuto: 1440 });

    const resultado = HorarioLaboralSemanal.crear(dias);

    expect(resultado.isOk()).toBe(true);
    expect(resultado.getValue().aCalendario()[1]).toEqual({
      aperturaMinuto: 0,
      cierreMinuto: 1440,
    });
  });
});

describe('HorarioLaboralSemanal.crear — al menos un día abierto', () => {
  it('rechaza los 7 días cerrados', () => {
    const dias = diasDefault().map((dia) => ({ ...dia, aperturaMinuto: null, cierreMinuto: null }));

    const resultado = HorarioLaboralSemanal.crear(dias);

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError().code).toBe('HORARIO_LABORAL_SIN_DIAS_ABIERTOS');
  });

  it('acepta un único día abierto entre 7', () => {
    const dias = diasDefault().map((dia) =>
      dia.diaSemana === 3 ? dia : { ...dia, aperturaMinuto: null, cierreMinuto: null },
    );

    const resultado = HorarioLaboralSemanal.crear(dias);

    expect(resultado.isOk()).toBe(true);
  });
});

describe('HorarioLaboralSemanal.aCalendario', () => {
  it('produce la tupla de 7 ventanas indexada por diaSemana, sin importar el orden de entrada', () => {
    const dias = [...diasDefault()].reverse();

    const horario = HorarioLaboralSemanal.crear(dias).getValue();
    const calendario = horario.aCalendario();

    expect(calendario).toHaveLength(7);
    expect(calendario[0]).toEqual({ aperturaMinuto: null, cierreMinuto: null });
    expect(calendario[1]).toEqual({ aperturaMinuto: 540, cierreMinuto: 1080 });
    expect(calendario[2]).toEqual({ aperturaMinuto: 540, cierreMinuto: 1080 });
    expect(calendario[3]).toEqual({ aperturaMinuto: 540, cierreMinuto: 1080 });
    expect(calendario[4]).toEqual({ aperturaMinuto: 540, cierreMinuto: 1080 });
    expect(calendario[5]).toEqual({ aperturaMinuto: 540, cierreMinuto: 1080 });
    expect(calendario[6]).toEqual({ aperturaMinuto: null, cierreMinuto: null });
  });
});

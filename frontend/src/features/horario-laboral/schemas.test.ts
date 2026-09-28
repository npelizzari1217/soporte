import { describe, expect, it } from "vitest";
import { horarioLaboralFormSchema, type DiaFormValues } from "./schemas";

function diaCerrado(diaSemana: number): DiaFormValues {
  return { diaSemana, abierto: false, apertura: "", cierre: "" };
}

function diaAbierto(diaSemana: number, apertura = "09:00", cierre = "18:00"): DiaFormValues {
  return { diaSemana, abierto: true, apertura, cierre };
}

const HORARIO_DEFAULT: DiaFormValues[] = [
  diaCerrado(0),
  diaAbierto(1),
  diaAbierto(2),
  diaAbierto(3),
  diaAbierto(4),
  diaAbierto(5),
  diaCerrado(6),
];

describe("horarioLaboralFormSchema — casos válidos", () => {
  it("acepta el default (lun-vie 09-18, sáb/dom cerrados)", () => {
    expect(horarioLaboralFormSchema.safeParse(HORARIO_DEFAULT).success).toBe(true);
  });

  it("acepta apertura 00:00 y cierre 00:00 (fin del día, D14)", () => {
    const horario = [...HORARIO_DEFAULT.slice(0, 6), diaAbierto(6, "00:00", "00:00")];
    expect(horarioLaboralFormSchema.safeParse(horario).success).toBe(true);
  });
});

describe("horarioLaboralFormSchema — 7 días cerrados", () => {
  it("rechaza los 7 días cerrados con el mensaje en la raíz", () => {
    const horario = [0, 1, 2, 3, 4, 5, 6].map(diaCerrado);
    const r = horarioLaboralFormSchema.safeParse(horario);
    expect(r.success).toBe(false);
    if (!r.success) {
      const raiz = r.error.issues.find((issue) => issue.path.length === 0);
      expect(raiz?.message).toBe("Debe quedar al menos un día abierto.");
    }
  });
});

describe("horarioLaboralFormSchema — apertura >= cierre", () => {
  it("rechaza apertura igual a cierre", () => {
    const horario = [...HORARIO_DEFAULT.slice(0, 6), diaAbierto(6, "10:00", "10:00")];
    const r = horarioLaboralFormSchema.safeParse(horario);
    expect(r.success).toBe(false);
  });

  it("rechaza apertura posterior a cierre", () => {
    const horario = [...HORARIO_DEFAULT.slice(0, 6), diaAbierto(6, "18:00", "09:00")];
    const r = horarioLaboralFormSchema.safeParse(horario);
    expect(r.success).toBe(false);
  });
});

describe("horarioLaboralFormSchema — día repetido", () => {
  it("rechaza un día repetido", () => {
    const horario = [diaAbierto(1), diaAbierto(1), diaCerrado(2), diaCerrado(3), diaCerrado(4), diaCerrado(5), diaCerrado(6)];
    const r = horarioLaboralFormSchema.safeParse(horario);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((issue) => issue.message.includes("repetido"))).toBe(true);
    }
  });
});

describe("horarioLaboralFormSchema — largo distinto de 7", () => {
  it("rechaza 6 días", () => {
    const horario = HORARIO_DEFAULT.slice(0, 6);
    expect(horarioLaboralFormSchema.safeParse(horario).success).toBe(false);
  });

  it("rechaza 8 días", () => {
    const horario = [...HORARIO_DEFAULT, diaCerrado(0)];
    expect(horarioLaboralFormSchema.safeParse(horario).success).toBe(false);
  });
});

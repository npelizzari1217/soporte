/**
 * [UNIT] `ResolverHorarioLaboralUsuarioService` (odd/tasks/tiempo-tecnico.md, S1-S2). Puertos
 * mockeados; la resolución contra Postgres real está en
 * `prisma-horario-laboral-usuario.repository.integration.spec.ts`.
 */
import { CalendarioLaboralSemanal } from './calcular-sla-habil-vence.service';
import { ResolverHorarioLaboralUsuarioService } from './resolver-horario-laboral-usuario.service';

const USUARIO = '01900000-0000-7000-8000-000000000701';

const HORARIO_CLIENTE: CalendarioLaboralSemanal = [
  { aperturaMinuto: null, cierreMinuto: null },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: null, cierreMinuto: null },
];

/** Martes a sábado de 14 a 22: distinto del horario del cliente en todos los días abiertos. */
const HORARIO_PROPIO: CalendarioLaboralSemanal = [
  { aperturaMinuto: null, cierreMinuto: null },
  { aperturaMinuto: null, cierreMinuto: null },
  { aperturaMinuto: 840, cierreMinuto: 1320 },
  { aperturaMinuto: 840, cierreMinuto: 1320 },
  { aperturaMinuto: 840, cierreMinuto: 1320 },
  { aperturaMinuto: 840, cierreMinuto: 1320 },
  { aperturaMinuto: 840, cierreMinuto: 1320 },
];

function crear(propio: CalendarioLaboralSemanal | null) {
  const horarioUsuarioRepo = { obtener: vi.fn().mockResolvedValue(propio) };
  const horarioClienteRepo = { obtener: vi.fn().mockResolvedValue(HORARIO_CLIENTE) };
  const servicio = new ResolverHorarioLaboralUsuarioService(horarioUsuarioRepo, horarioClienteRepo);
  return { servicio, horarioUsuarioRepo };
}

describe('ResolverHorarioLaboralUsuarioService.obtenerParaUsuario', () => {
  it('con horario propio, devuelve ese horario con origen USUARIO', async () => {
    const { servicio, horarioUsuarioRepo } = crear(HORARIO_PROPIO);

    await expect(servicio.obtenerParaUsuario(USUARIO)).resolves.toEqual({
      calendario: HORARIO_PROPIO,
      origen: 'USUARIO',
    });
    expect(horarioUsuarioRepo.obtener).toHaveBeenCalledWith(USUARIO);
  });

  it('sin horario propio, devuelve el del cliente con origen CLIENTE (S2)', async () => {
    const { servicio } = crear(null);

    await expect(servicio.obtenerParaUsuario(USUARIO)).resolves.toEqual({
      calendario: HORARIO_CLIENTE,
      origen: 'CLIENTE',
    });
  });

  it('si el horario propio está incompleto, falla en vez de caer al del cliente', async () => {
    const horarioUsuarioRepo = {
      obtener: vi.fn().mockRejectedValue(new Error('falta la fila del día de semana 3')),
    };
    const horarioClienteRepo = { obtener: vi.fn().mockResolvedValue(HORARIO_CLIENTE) };
    const servicio = new ResolverHorarioLaboralUsuarioService(
      horarioUsuarioRepo,
      horarioClienteRepo,
    );

    await expect(servicio.obtenerParaUsuario(USUARIO)).rejects.toThrow('día de semana 3');
  });
});

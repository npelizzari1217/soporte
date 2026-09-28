import { TareasSegundoPlano } from './tareas-segundo-plano';

describe('TareasSegundoPlano (ADR-2)', () => {
  it('la tarea NO corre síncronamente dentro de lanzar()', () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const tareas = new TareasSegundoPlano(logger);
    const tarea = vi.fn().mockResolvedValue(undefined);

    tareas.lanzar('etiqueta', tarea);

    expect(tarea).not.toHaveBeenCalled();
  });

  it('un rechazo se captura y se loguea sin abortar ni propagar', async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const tareas = new TareasSegundoPlano(logger);
    const tarea = vi.fn().mockRejectedValue(new Error('fallo-smtp'));

    expect(() => tareas.lanzar('reset-password.solicitud', tarea)).not.toThrow();
    await tareas.esperarPendientes();

    expect(logger.error).toHaveBeenCalledWith(
      'SEGUNDO_PLANO_ERROR | tarea=reset-password.solicitud | error=fallo-smtp',
    );
  });

  it('un throw síncrono dentro de la tarea también se captura', async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const tareas = new TareasSegundoPlano(logger);
    const tarea = vi.fn(() => {
      throw new Error('sincrono');
    });

    tareas.lanzar('etiqueta', tarea);
    await tareas.esperarPendientes();

    expect(logger.error).toHaveBeenCalledWith(
      'SEGUNDO_PLANO_ERROR | tarea=etiqueta | error=sincrono',
    );
  });

  it('esperarPendientes() resuelve cuando el Set queda vacío', async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const tareas = new TareasSegundoPlano(logger);
    let resueltoUno = false;
    let resueltoDos = false;

    tareas.lanzar('uno', async () => {
      resueltoUno = true;
    });
    tareas.lanzar('dos', async () => {
      resueltoDos = true;
    });

    await tareas.esperarPendientes();

    expect(resueltoUno).toBe(true);
    expect(resueltoDos).toBe(true);
  });

  it('esperarPendientes() también espera las tareas lanzadas mientras espera', async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const tareas = new TareasSegundoPlano(logger);
    let resueltaHija = false;

    tareas.lanzar('madre', async () => {
      tareas.lanzar('hija', async () => {
        resueltaHija = true;
      });
    });
    await tareas.esperarPendientes();

    expect(resueltaHija).toBe(true);
  });

  it('onApplicationShutdown() espera las tareas pendientes', async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const tareas = new TareasSegundoPlano(logger);
    let resuelto = false;

    tareas.lanzar('shutdown', async () => {
      resuelto = true;
    });
    await tareas.onApplicationShutdown();

    expect(resuelto).toBe(true);
  });
});

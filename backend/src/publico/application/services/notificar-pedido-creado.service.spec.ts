import { describe, expect, it, vi } from 'vitest';
import { NotificarPedidoCreadoService } from './notificar-pedido-creado.service';

const PEDIDO = {
  ticketId: 't-1',
  numero: 'T-2026-0007',
  nombre: 'Ana',
  email: 'ana@example.com',
  clienteId: 'c-1',
  clienteNombre: 'Colegio A',
};

describe('NotificarPedidoCreadoService', () => {
  it('difiere el envío: no manda nada hasta que corre la tarea', async () => {
    const enviar = vi.fn().mockResolvedValue(undefined);
    let tarea: (() => Promise<void>) | undefined;
    const tareas = {
      lanzar: vi.fn((_etiqueta: string, fn: () => Promise<void>) => {
        tarea = fn;
      }),
    };

    new NotificarPedidoCreadoService({ enviar }, tareas).notificar(PEDIDO);

    expect(enviar).not.toHaveBeenCalled();
    await tarea?.();
    expect(enviar).toHaveBeenCalledTimes(1);
    const [clienteId, msg] = enviar.mock.calls[0] as [string, { to: string; text: string }];
    expect(clienteId).toBe('c-1');
    expect(msg.to).toBe('ana@example.com');
    expect(msg.text).toContain('T-2026-0007');
  });

  it('la etiqueta de la tarea no lleva PII', () => {
    const tareas = { lanzar: vi.fn() };

    new NotificarPedidoCreadoService({ enviar: vi.fn() }, tareas).notificar(PEDIDO);

    const etiqueta = (tareas.lanzar.mock.calls[0] as [string])[0];
    expect(etiqueta).not.toContain('ana@example.com');
    expect(etiqueta).not.toContain('T-2026-0007');
  });
});

/**
 * T7.4 / T1.1-T1.2 (Fase 3, ADR-5) [UNIT] — Tests de `TenantSeederAdapter`
 * con un `createClient` inyectado (mockeado) — sin Postgres real (eso es la
 * parte de integración de este mismo contrato,
 * `tenant-seeder.adapter.integration.spec.ts`).
 *
 * Contrato verificado (R19, decisión #2025 — reemplaza la lista original de
 * `estados` de R19: 6 códigos finales, no 8; ampliado por Fase 3 ADR-5):
 * - Siembra `estados` (6: NUEVO, ASIGNADO, EN_PROCESO, RESUELTO, CERRADO,
 *   CANCELADO), `prioridades` (4), `tipo_operacion` (5 de R19 —
 *   APROBACION/RECHAZO removidos en PR-1 de sdd/redisenio-modulo-compras),
 *   `tipos_ticket` base incl. MANTENIMIENTO y PREVENTIVO (4) — cada catálogo vía `createMany` con
 *   `skipDuplicates: true` (equivalente a `ON CONFLICT (codigo) DO NOTHING`,
 *   por eso correr el seed dos veces no duplica ni falla).
 * - `tipos_componente` (Fase 3 F3-Q3) YA NO se siembra acá — PR4b
 *   (sdd/tipos-componente-master) lo movió a un catálogo GLOBAL en MASTER,
 *   sembrado una única vez (fuera del alcance de `TenantSeederAdapter`).
 * - `familias_insumo` (11, WU-1 sdd/repuestos-familias) — el piso universal
 *   de familias marcadas `esRepuesto: true`, mismos código/nombre que la
 *   migración de datos hermana (ver `tenant-seeder.adapter.ts`).
 * - `unidades_medida` (4, issue #155) — UNI, PAR, CM, MM, mismos
 *   código/nombre que la migración de datos hermana
 *   `20260911120000_seed_unidades_medida`. Sin este piso ningún tenant nuevo
 *   puede dar de alta un insumo.
 * - `seed` MUST cerrar el client (`$disconnect`) y el pool (`pool.end`)
 *   antes de retornar, incluso si una siembra falla (R18: sin conexiones
 *   activas, si no el DROP de rollback falla).
 *
 * Ref spec: sdd/auth-multitenancy/spec §R19; sdd/flujos-especializados/spec §F3-S1
 * Ref decisión: soporte/rewrite/db-authorization-y-ajustes (#2025) — estados=6
 * Ref design: sdd/flujos-especializados/design ADR-5
 * Tarea: T7.4 (base) / T1.1-T1.2 (Fase 3, PR1 gated)
 */
import { TenantSeederAdapter } from './tenant-seeder.adapter';

const MASTER_URL = 'postgresql://soporte:soporte@localhost:5432/soporte_master';

function makeFakeClient() {
  return {
    estado: { createMany: vi.fn().mockResolvedValue({ count: 6 }) },
    prioridad: {
      createMany: vi.fn().mockResolvedValue({ count: 4 }),
    },
    tipoOperacion: { createMany: vi.fn().mockResolvedValue({ count: 7 }) },
    tipoTicket: { createMany: vi.fn().mockResolvedValue({ count: 4 }) },
    familiaInsumo: { createMany: vi.fn().mockResolvedValue({ count: 11 }) },
    unidadMedida: { createMany: vi.fn().mockResolvedValue({ count: 4 }) },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFakePool() {
  return { end: vi.fn().mockResolvedValue(undefined) };
}

describe('TenantSeederAdapter (T7.4, unit — createClient mockeado)', () => {
  it('[CRITICAL] siembra los 6 estados de la decisión #2025 (NO los 8 originales de R19)', async () => {
    const client = makeFakeClient();
    const pool = makeFakePool();
    const createClient = vi.fn().mockReturnValue({ client, pool });
    const adapter = new TenantSeederAdapter(MASTER_URL, createClient);

    await adapter.seed('soporte_prov_demo_test');

    expect(client.estado.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ codigo: 'NUEVO' }),
        expect.objectContaining({ codigo: 'ASIGNADO' }),
        expect.objectContaining({ codigo: 'EN_PROCESO' }),
        expect.objectContaining({ codigo: 'RESUELTO' }),
        expect.objectContaining({ codigo: 'CERRADO' }),
        expect.objectContaining({ codigo: 'CANCELADO' }),
      ],
      skipDuplicates: true,
    });
  });

  it('siembra las 4 prioridades (BAJA/MEDIA/ALTA/CRITICA)', async () => {
    const client = makeFakeClient();
    const createClient = vi.fn().mockReturnValue({ client, pool: makeFakePool() });
    const adapter = new TenantSeederAdapter(MASTER_URL, createClient);

    await adapter.seed('soporte_prov_demo_test');

    const [[{ data }]] = client.prioridad.createMany.mock.calls;
    expect(data.map((p: { codigo: string }) => p.codigo)).toEqual([
      'BAJA',
      'MEDIA',
      'ALTA',
      'CRITICA',
    ]);
  });

  it('[CRITICAL] siembra los defaults de sla_horas/sla_activo por prioridad (Fase 4, S1, GATE G1 — movido a prioridades)', async () => {
    const client = makeFakeClient();
    const createClient = vi.fn().mockReturnValue({ client, pool: makeFakePool() });
    const adapter = new TenantSeederAdapter(MASTER_URL, createClient);

    await adapter.seed('soporte_prov_demo_test');

    const [[{ data }]] = client.prioridad.createMany.mock.calls;
    expect(
      data.map((p: { codigo: string; slaHoras: number; slaActivo: boolean }) => ({
        codigo: p.codigo,
        slaHoras: p.slaHoras,
        slaActivo: p.slaActivo,
      })),
    ).toEqual([
      { codigo: 'BAJA', slaHoras: 48, slaActivo: true },
      { codigo: 'MEDIA', slaHoras: 24, slaActivo: true },
      { codigo: 'ALTA', slaHoras: 8, slaActivo: true },
      { codigo: 'CRITICA', slaHoras: 4, slaActivo: true },
    ]);
  });

  it('siembra los 5 tipo_operacion de R19, sin APROBACION/RECHAZO (PR-1 compras)', async () => {
    const client = makeFakeClient();
    const createClient = vi.fn().mockReturnValue({ client, pool: makeFakePool() });
    const adapter = new TenantSeederAdapter(MASTER_URL, createClient);

    await adapter.seed('soporte_prov_demo_test');

    const [[{ data }]] = client.tipoOperacion.createMany.mock.calls;
    expect(data.map((t: { codigo: string }) => t.codigo)).toEqual([
      'CAMBIO_ESTADO',
      'COMENTARIO',
      'ASIGNACION',
      'ADJUNTO',
      'AVANCE_EDILICIO',
    ]);
  });

  it('[CRITICAL] siembra tipos_ticket base incluyendo MANTENIMIENTO y PREVENTIVO (no-IT)', async () => {
    const client = makeFakeClient();
    const createClient = vi.fn().mockReturnValue({ client, pool: makeFakePool() });
    const adapter = new TenantSeederAdapter(MASTER_URL, createClient);

    await adapter.seed('soporte_prov_demo_test');

    const [[{ data }]] = client.tipoTicket.createMany.mock.calls;
    expect(data.map((t: { codigo: string }) => t.codigo)).toEqual([
      'SOPORTE',
      'EDILICIA',
      'MANTENIMIENTO',
      'PREVENTIVO',
    ]);
  });

  /**
   * WU-1 (sdd/repuestos-familias): las 11 familias universales de repuesto,
   * verbatim del catálogo `master.tipos_componente` vigente en producción
   * (ver el header de `tenant-seeder.adapter.ts` y de la migración de datos
   * hermana). CPU2, EST500W y DISCO NO están en esta lista a propósito.
   */
  it('[CRITICAL] siembra las 11 familias de insumo de repuesto, todas con esRepuesto: true', async () => {
    const client = makeFakeClient();
    const createClient = vi.fn().mockReturnValue({ client, pool: makeFakePool() });
    const adapter = new TenantSeederAdapter(MASTER_URL, createClient);

    await adapter.seed('soporte_prov_demo_test');

    const [[{ data }]] = client.familiaInsumo.createMany.mock.calls;
    expect(data).toEqual([
      { codigo: 'CPU', nombre: 'CPU', esRepuesto: true },
      { codigo: 'MOUSE', nombre: 'Mouse', esRepuesto: true },
      { codigo: 'TECLADO', nombre: 'Teclado', esRepuesto: true },
      { codigo: 'RAM', nombre: 'Memoria RAM', esRepuesto: true },
      { codigo: 'MONITOR', nombre: 'Monitor', esRepuesto: true },
      { codigo: 'FUENTE', nombre: 'Fuente de alimentación', esRepuesto: true },
      { codigo: 'GPU', nombre: 'Placa de video', esRepuesto: true },
      { codigo: 'RED', nombre: 'Placa de red', esRepuesto: true },
      { codigo: 'SSD', nombre: 'Discos SSD', esRepuesto: true },
      { codigo: 'HDD', nombre: 'Disco HDD', esRepuesto: true },
      { codigo: 'IMPRESORA', nombre: 'Impresora', esRepuesto: true },
    ]);
  });

  /**
   * Issue #155: un tenant recién creado no podía dar de alta NINGÚN insumo
   * porque `unidades_medida` nacía vacía y el alta exige elegir una unidad.
   * Mismo criterio de procedencia que las familias de repuesto (#147): se
   * copia lo que el negocio YA USA en producción (verificado contra el
   * tenant "Santa Cruz"), no una lista inventada.
   */
  it('[CRITICAL] siembra las 4 unidades de medida: UNI, PAR, CM, MM', async () => {
    const client = makeFakeClient();
    const createClient = vi.fn().mockReturnValue({ client, pool: makeFakePool() });
    const adapter = new TenantSeederAdapter(MASTER_URL, createClient);

    await adapter.seed('soporte_prov_demo_test');

    const [[{ data }]] = client.unidadMedida.createMany.mock.calls;
    expect(data).toEqual([
      { codigo: 'UNI', nombre: 'Unidad' },
      { codigo: 'PAR', nombre: 'Pares' },
      { codigo: 'CM', nombre: 'Centímetro' },
      { codigo: 'MM', nombre: 'Milímetro' },
    ]);
  });

  it('todos los createMany usan skipDuplicates: true (idempotencia, R19)', async () => {
    const client = makeFakeClient();
    const createClient = vi.fn().mockReturnValue({ client, pool: makeFakePool() });
    const adapter = new TenantSeederAdapter(MASTER_URL, createClient);

    await adapter.seed('soporte_prov_demo_test');

    expect(client.estado.createMany.mock.calls[0]![0].skipDuplicates).toBe(true);
    expect(client.prioridad.createMany.mock.calls[0]![0].skipDuplicates).toBe(true);
    expect(client.tipoOperacion.createMany.mock.calls[0]![0].skipDuplicates).toBe(true);
    expect(client.tipoTicket.createMany.mock.calls[0]![0].skipDuplicates).toBe(true);
    expect(client.familiaInsumo.createMany.mock.calls[0]![0].skipDuplicates).toBe(true);
    expect(client.unidadMedida.createMany.mock.calls[0]![0].skipDuplicates).toBe(true);
  });

  it('[CRITICAL] construye el client con el dbName recibido', async () => {
    const client = makeFakeClient();
    const createClient = vi.fn().mockReturnValue({ client, pool: makeFakePool() });
    const adapter = new TenantSeederAdapter(MASTER_URL, createClient);

    await adapter.seed('soporte_prov_demo_test');

    expect(createClient).toHaveBeenCalledWith('soporte_prov_demo_test');
  });

  it('[FIX] cierra client y pool tras una siembra exitosa', async () => {
    const client = makeFakeClient();
    const pool = makeFakePool();
    const createClient = vi.fn().mockReturnValue({ client, pool });
    const adapter = new TenantSeederAdapter(MASTER_URL, createClient);

    await adapter.seed('soporte_prov_demo_test');

    expect(client.$disconnect).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it('[FIX][CRITICAL] cierra client y pool incluso si una siembra falla, y propaga el error (R18)', async () => {
    const client = makeFakeClient();
    client.tipoOperacion.createMany.mockRejectedValue(new Error('constraint violation'));
    const pool = makeFakePool();
    const createClient = vi.fn().mockReturnValue({ client, pool });
    const adapter = new TenantSeederAdapter(MASTER_URL, createClient);

    await expect(adapter.seed('soporte_prov_demo_test')).rejects.toThrow('constraint violation');

    expect(client.$disconnect).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});

/**
 * S1-T5 TEST — Unit snapshot: seeders contienen EDICION y ELIMINACION
 *
 * RED → antes de S1-T6 (las constantes SQL no tienen las 2 filas nuevas → falla).
 * GREEN → después de actualizar ambos archivos seeder.
 *
 * Estrategia: lee el contenido fuente de cada archivo seeder como string y verifica
 * que SEED_TIPO_OPERACION_SQL contenga las filas EDICION y ELIMINACION con los
 * UUIDs deterministas correctos e idempotencia ON CONFLICT DO NOTHING.
 *
 * No requiere DB real — es verificación de contenido estático (unit snapshot).
 *
 * Ref spec: [SPEC:tickets-core/Seed de tipo_operacion EDICION y ELIMINACION presente en todo tenant]
 * Tarea: S1-T5 (tickets-editar-borrar)
 */
import * as fs from 'fs';
import * as path from 'path';

const TENANT_SEED_PATH = path.resolve(__dirname, '../../../prisma_tenant/seeds/tenant-seed.ts');

const SEEDER_ADAPTER_PATH = path.resolve(__dirname, './tenant-seeder.adapter.ts');

describe('Seeders — tipo_operacion contiene EDICION y ELIMINACION', () => {
  let tenantSeedContent: string;
  let adapterContent: string;

  beforeAll(() => {
    tenantSeedContent = fs.readFileSync(TENANT_SEED_PATH, 'utf8');
    adapterContent = fs.readFileSync(SEEDER_ADAPTER_PATH, 'utf8');
  });

  // ─── prisma_tenant/seeds/tenant-seed.ts ───────────────────────────────────

  describe('prisma_tenant/seeds/tenant-seed.ts', () => {
    it('contiene UUID f0...007 (EDICION)', () => {
      expect(tenantSeedContent).toContain("'f0000000-0000-4000-f000-000000000007'");
    });

    it("contiene codigo 'EDICION'", () => {
      expect(tenantSeedContent).toContain("'EDICION'");
    });

    it('contiene UUID f0...008 (ELIMINACION)', () => {
      expect(tenantSeedContent).toContain("'f0000000-0000-4000-f000-000000000008'");
    });

    it("contiene codigo 'ELIMINACION'", () => {
      expect(tenantSeedContent).toContain("'ELIMINACION'");
    });

    it('SEED_TIPO_OPERACION_SQL tiene ON CONFLICT DO NOTHING (idempotente)', () => {
      const startIdx = tenantSeedContent.indexOf('SEED_TIPO_OPERACION_SQL');
      // Buscar hasta el final del bloque template string
      const section = tenantSeedContent.slice(startIdx, startIdx + 2000);
      expect(section).toMatch(/on conflict.*do nothing/i);
    });
  });

  // ─── src/clientes/infrastructure/tenant-seeder.adapter.ts ─────────────────

  describe('src/clientes/infrastructure/tenant-seeder.adapter.ts', () => {
    it('contiene UUID f0...007 (EDICION)', () => {
      expect(adapterContent).toContain("'f0000000-0000-4000-f000-000000000007'");
    });

    it("contiene codigo 'EDICION'", () => {
      expect(adapterContent).toContain("'EDICION'");
    });

    it('contiene UUID f0...008 (ELIMINACION)', () => {
      expect(adapterContent).toContain("'f0000000-0000-4000-f000-000000000008'");
    });

    it("contiene codigo 'ELIMINACION'", () => {
      expect(adapterContent).toContain("'ELIMINACION'");
    });

    it('SEED_TIPO_OPERACION_SQL tiene ON CONFLICT DO NOTHING (idempotente)', () => {
      const startIdx = adapterContent.indexOf('SEED_TIPO_OPERACION_SQL');
      const section = adapterContent.slice(startIdx, startIdx + 2000);
      expect(section).toMatch(/on conflict.*do nothing/i);
    });
  });
});

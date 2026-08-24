/**
 * app.module.smoke.spec.ts — smoke test de arranque del contenedor DI
 * completo (WU6, tarea 6.3).
 *
 * `Test.createTestingModule({ imports: [AppModule] }).compile()` instancia
 * TODOS los providers de la app — es la única forma barata de confirmar que
 * un módulo nuevo (`CsatModule`/`CsatLecturaModule`) no rompe la resolución
 * de dependencias ni arma un ciclo (`AuthModule ↔ TicketsModule ↔ CsatModule`,
 * ver ADR-C3 del design de sdd/csat). No abre conexiones reales: `PrismaService`
 * es lazy (el pool de `pg` se construye recién en la primera query — ver
 * `SharedModule`), así que compilar el módulo no requiere una DB levantada.
 *
 * Ref design: sdd/csat/design, ADR-C3. Tarea: 6.3.
 */
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

describe('AppModule (smoke)', () => {
  it('compila el contenedor DI completo sin ciclos ni providers faltantes', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef).toBeDefined();

    await moduleRef.close();
  }, 30000);
});

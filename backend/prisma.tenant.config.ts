// Configuración del CLI de Prisma 7 para la DB TENANT (por cliente).
//
// Usada EXCLUSIVAMENTE por los comandos de migración del tenant:
//   pnpm run migrate:tenant   → prisma migrate deploy --schema=prisma_tenant/...
//
// En Prisma 7, el bloque `datasource` del schema ya NO acepta `url`:
// la conexión para los comandos de Migrate vive acá.
// En RUNTIME la app NO usa esta url — PrismaService inyecta la conexión
// via @prisma/adapter-pg (ver src/shared/infrastructure/persistence/prisma.service.ts).
//
// DATABASE_URL_TENANT apunta a una DB tenant concreta:
//   - En dev: puede apuntar a una DB tenant de prueba (ej. soporte_tenant_test).
//   - En CI: debe apuntar a la DB tenant de test (soporte_tenant_test).
//   - En fan-out de migraciones: el script externo sobreescribe esta variable
//     para iterar sobre todas las DBs tenant y aplicar la migración.
//
// Ver también:
//   prisma.config.ts      — config de la DB MASTER
//   package.json          — scripts generate:tenant, migrate:tenant
//   openspec/.../design.md — decisión de separación física master/tenant
import { defineConfig } from 'prisma/config';

// Node 22+: carga .env sin dependencias. En CI/prod las env vars ya están en
// el entorno real, por eso el try/catch (no hay archivo .env y no debe fallar).
try {
  process.loadEnvFile();
} catch {
  // .env ausente — se usan las variables del entorno.
}

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL_TENANT,
  },
});

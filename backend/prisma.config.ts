// Configuración del CLI de Prisma 7 (migrate / db / studio) para la DB MASTER.
//
// En Prisma 7 el bloque `datasource` del schema ya NO acepta `url`: la
// conexión para los comandos de Migrate vive acá. En RUNTIME la app NO usa
// esta url — PrismaService inyecta la conexión vía @prisma/adapter-pg (ver
// src/shared/infrastructure/persistence/prisma.service.ts).
//
// El schema y el directorio de migraciones se resuelven por el flag --schema
// de cada script (generate:master / migrate:master), que apunta a
// prisma_master/. Las migraciones de tenant usan prisma.tenant.config.ts.
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
    url: process.env.DATABASE_URL_MASTER,
  },
});

# Exploración: Rotación segura de `EMAIL_CRYPTO_KEY`

> Ciclo SDD `rotacion-email-crypto-key`. Deuda técnica citada en
> `docs/roadmap-comercial.md:486` ("Rotación de `EMAIL_CRYPTO_KEY`: no existe
> herramienta").

## Estado actual

### Formato exacto del ciphertext

`AesGcmSecretCipher` (`backend/src/shared/infrastructure/crypto/aes-gcm-secret-cipher.ts:1-104`)
persiste un único string: `v1:{iv_b64}:{tag_b64}:{ciphertext_b64}` (líneas 64-69),
unido con `:`. `KEY_VERSION = 'v1'` (línea 5) viaja como **prefijo del mismo
string**, no como columna hermana — decisión explícita para que un `UPDATE`
parcial no pueda desincronizar versión/iv/tag/ciphertext (líneas 17-20).

- IV: 12 bytes / 96 bits (líneas 7-8), aleatorio por llamada.
- Clave maestra: 32 bytes = 64 caracteres hex, leída de `process.env.EMAIL_CRYPTO_KEY`
  **en cada llamada** (`readKey()`, líneas 36-44), nunca cacheada ni validada al boot.
- AAD = `clienteId` (`i-secret-cipher.port.ts:6-12`) — liga criptográficamente el
  ciphertext a la fila; mover un ciphertext de un cliente a otro hace fallar
  `decrypt()` por diseño.
- **No hay identificador de clave (`kid`) embebido.** El prefijo `v1` identifica
  únicamente el ESQUEMA del payload, no CUÁL clave maestra lo cifró. Dado un
  ciphertext, hoy es imposible saber con qué clave se cifró sin intentar
  descifrarlo.
- `decrypt()` (líneas 72-103): solo el prefijo de versión produce un mensaje
  explícito (`Versión de clave desconocida`, línea 88). Una clave AES incorrecta
  y un payload manipulado fallan igual, en la verificación de integridad GCM de
  `decipher.final()` (comentario líneas 95-96). Un script de rotación no puede
  confiar en el tipo de excepción: tiene que probar las claves candidatas
  explícitamente.

### Dónde vive el ciphertext — un solo lugar

La migración `20260820160000_add_cliente_smtp_config`
(`backend/prisma_master/migrations/20260820160000_add_cliente_smtp_config/migration.sql:27-36`)
agrega las columnas SMTP a `clientes`, tabla de la base **master**
(`soporte_master`), explícitamente **no** en la base de cada tenant (comentario
líneas 4-7). Una sola columna de ciphertext: `smtp_password_cifrada TEXT`
(línea 33), en Prisma `Cliente.smtpPasswordCifrada`
(`backend/prisma_master/schema.prisma:99`). El CHECK
`clientes_smtp_config_todo_o_nada_check` (líneas 44-52) obliga a que
host/port/user/from/password_cifrada sean todos NULL o todos NOT NULL.

**Ninguna otra columna, en ninguna base (master o tenant), usa este cifrado.**
Confirmado buscando `EMAIL_CRYPTO_KEY` e `ISecretCipher` en todo `backend/`.

### Consumidores de `ISecretCipher` — un solo punto de borde

- **Único consumidor**: `PrismaClienteEmailConfigRepository`
  (`backend/src/clientes/infrastructure/persistence/prisma/prisma-cliente-email-config.repository.ts`):
  `encrypt()` en `save()` (línea 118), `decrypt()` en `findForSend()` (línea 92,
  AAD = `clienteId`).
- Ningún caso de uso inyecta `ISecretCipher` directamente — decisión documentada
  en `configurar-correo-cliente.use-case.ts:6-13`, `ver-correo-cliente.use-case.ts:12`
  y `tenant-aware-email-sender.ts:36-38`. Un cambio de firma del cipher solo toca
  este adaptador y su binding DI.
- DI: `SECRET_CIPHER` → `AesGcmSecretCipher`, en `backend/src/shared/shared.module.ts:85,125`
  (módulo `@Global()`).
- **Segunda implementación, duplicada a propósito**:
  `backend/scripts/backfill-correo-clientes.mjs:37-104` reimplementa el mismo
  cifrado (no puede importar `src/` sin build). Su cabecera (líneas 24-28) advierte
  el riesgo de divergencia, y `backfill-correo-clientes.spec.ts` tiene un test de
  descifrado cruzado. **Un cambio de formato del payload tiene que mover las DOS
  implementaciones en el mismo commit.**

### No hay fail-fast al boot para `EMAIL_CRYPTO_KEY`

`backend/src/config/entorno.ts` valida al arrancar solo `DATABASE_URL_MASTER`,
`JWT_SECRET` y `APP_BASE_URL` (`README.md:150-159`). Sin `EMAIL_CRYPTO_KEY` la app
arranca; el guardado de config responde 503 y el envío degrada con razón
`EMAIL_CRYPTO_KEY_AUSENTE` (`README.md:155`). El sistema ya tolera una clave
ausente o inválida degradando solo esa funcionalidad.

### `deploy.ps1` hoy: genera la clave una sola vez, nunca la toca

`deploy.ps1:147-174` (paso 7, `DEPLOY-VPS-runbook.md:146`): si `EMAIL_CRYPTO_KEY`
ya existe en `backend/.env` no se toca (línea 158); si no existe, la genera y
reescribe el archivo entero, nunca con `Add-Content` (comentario líneas 162-167,
incidente del 2026-08-20 con `ROOT_ADMIN_PASSWORD`). **Cero soporte de rotación**:
rotar hoy significa editar `backend/.env` a mano en el VPS, fuera de las
salvaguardas de `deploy.ps1`.

`DEPLOY-VPS-runbook.md:313-330` ("`EMAIL_CRYPTO_KEY` no se rota") ya documenta el
problema, y recuerda que la clave se respalda junto con la base (líneas 440-442).

### Escala de producción

`docs/roadmap-comercial.md:28`: producción tiene dos clientes. La tabla
`clientes` tiene un puñado de filas, así que una ventana de mantenimiento sobre
ella dura milisegundos.

## Áreas afectadas

- `backend/src/shared/infrastructure/crypto/aes-gcm-secret-cipher.ts` (+ spec) —
  cambio de formato/firma solo si se adopta keyring o `kid`.
- `backend/scripts/backfill-correo-clientes.mjs` (+ sus dos specs) — copia del
  cifrado que debe moverse en lockstep con cualquier cambio de formato.
- `backend/src/clientes/infrastructure/persistence/prisma/prisma-cliente-email-config.repository.ts` (+ spec).
- `backend/src/shared/shared.module.ts` — wiring DI si el cipher necesita una
  segunda variable de entorno.
- **Script nuevo**: `backend/scripts/rotar-email-crypto-key.mjs` (o equivalente),
  entregable central del cambio.
- **Posible `.ps1` operativo nuevo**, análogo a `rotate-admin-pw.ps1`. Si se crea,
  entra a la tabla de excepciones PowerShell de `~/proyectos/CLAUDE.md` §2.2.
- `deploy.ps1` — probablemente no se toca (precedente `predeploy-dump.ps1`).
- `DEPLOY-VPS-runbook.md` §5 (líneas 313-330) y `README.md:155` — quedan
  desactualizados en cuanto exista la herramienta.
- Tests: unit del cipher, integración del script nuevo (molde:
  `backend/scripts/backfill-correo-clientes.integration.spec.ts`).

## Enfoques de rotación

| Enfoque | Descripción | Pros | Contras | Esfuerzo |
|---|---|---|---|---|
| **(a) Re-cifrado offline en ventana de mantenimiento** | Script con `OLD_KEY` y `NEW_KEY` explícitas: descifra cada fila con `OLD_KEY`, re-cifra con `NEW_KEY`, escribe. Corre con los servicios detenidos. No toca el formato ni `AesGcmSecretCipher`. | Cambio mínimo; ventana de milisegundos a esta escala; sin variable de entorno permanente extra. | Estado mixto si se interrumpe sin transacción; cada rotación futura repite el procedimiento. | Bajo |
| **(b) Dual-key / keyring en `decrypt()`** | `decrypt()` acepta `EMAIL_CRYPTO_KEY` + `EMAIL_CRYPTO_KEY_ANTERIOR`. Se despliega el código, se re-cifra en vivo, y un segundo deploy quita la anterior. | Cero downtime real. | Complejidad por un beneficio marginal a esta escala; toca la firma del cipher; dos variables a sincronizar. | Medio |
| **(c) `kid` en el payload (`v2:<kid>:...`)** | `encrypt()` escribe `v2:{kid}:...`; `decrypt()` soporta `v1` y `v2` con keyring. El script filtra `WHERE smtp_password_cifrada LIKE 'v1:%'`: idempotente por construcción. | Rotaciones futuras triviales; estado de migración legible en la columna. | Cambia el contrato persistido; mover las dos implementaciones del cifrado juntas; más superficie de revisión. | Medio-Alto |

## Recomendación

**Enfoque (a) para esta primera herramienta**, salvo que la decisión 1 (rotaciones
periódicas) justifique (c). La deuda real no es "falta cero downtime": es "no
existe ninguna herramienta".

Reglas duras del script:

1. **Transacción única** sobre todas las filas: una interrupción hace ROLLBACK
   completo y deja todo en `OLD_KEY`, en vez de un estado mixto sin marcador.
2. **`--dry-run`**: descifra con `OLD_KEY`, re-cifra en memoria con `NEW_KEY`,
   descifra de vuelta y compara, sin escribir (patrón de `predeploy-dump.ps1 -DryRun`,
   `DEPLOY-VPS-runbook.md:187-193`).
3. **Round-trip antes del `COMMIT`**: releer y descifrar con `NEW_KEY` dentro de la
   transacción.
4. **Backup previo** (`predeploy-dump.ps1`) y **no descartar `OLD_KEY` hasta
   confirmar éxito** (criterio de `DEPLOY-VPS-runbook.md:440-442`).
5. **Fallo explícito** ante una fila que no descifra con ninguna de las dos claves:
   abortar, nunca saltear.

## Modos de falla a diseñar

- **Interrupción a mitad de camino**: mitigada por la transacción única.
- **Clave desconocida vs. payload corrupto**: indistinguibles en `decrypt()`; probar
  ambas claves y fallar duro si ninguna funciona.
- **Idempotencia**: no hay columna "ya migrado" (el `WHERE ... IS NULL` de
  `backfill-correo-clientes.mjs:167` no aplica). Una re-corrida sobre filas ya
  migradas falla al descifrar con `OLD_KEY`: seguro, pero hay que documentarlo o
  tratar "ya descifra con `NEW_KEY`" como no-op explícito.
- **Rollback**: restaurar el dump y conservar `OLD_KEY`; un `git revert` no
  devuelve datos ya escritos.

## Restricciones operativas

- VPS Windows con servicios NSSM `soporte-backend`/`soporte-frontend`
  (`DEPLOY-VPS-runbook.md:86`); `.env` en `C:\soporte\backend\.env`.
- **Trampa de los dos Node**: en el VPS `node` resuelve a la versión 22 del PATH
  salvo que se anteponga `C:\nodejs24` (`DEPLOY-VPS-runbook.md:92-130`).
- Un `rotate-email-crypto-key.ps1` encaja en el patrón de `rotate-admin-pw.ps1` y
  debe agregarse a la tabla de `~/proyectos/CLAUDE.md` §2.2. Debe ser 100 % ASCII
  y sin BOM.
- Precedente de no tocar `deploy.ps1`: `predeploy-dump.ps1` quedó separado del
  pipeline (`DEPLOY-VPS-runbook.md:165-167`).
- El script se versiona desde el primer commit — no repetir el caso de
  `rotate-jwt.ps1`/`install-cert-soporte.ps1` (`DEPLOY-VPS-runbook.md:490`).

## Infraestructura de test relevante

- `soporte_master_test` es compartida; un spec que la trunque llama
  `usarLockMasterTest()` (`backend/src/testing/lock-master-test.ts:95-124`).
- **Molde a seguir**: `backend/scripts/backfill-correo-clientes.integration.spec.ts`
  no toca `soporte_master_test` — crea una base efímera con `PostgresAdminService`,
  replaya los `migration.sql` relevantes (`reproducirSchemaPrevio`, líneas 40-53) y
  la dropea en `afterAll` con `pool.end()` antes de `dropDatabase()` (líneas 94-97).
  Ya modela idempotencia con dos corridas.

## Deuda adyacente — fuera de alcance

`SmtpEmailSender.send()` loguea el `error.message` crudo de nodemailer
(`docs/roadmap-comercial.md:488`). Sin relación estructural con la rotación.

## Decisiones abiertas (antes de `sdd-propose`)

1. ¿Se anticipan rotaciones periódicas, o es "una vez, ante incidente"? Decide
   entre (a) y (c).
2. ¿Es aceptable una ventana de mantenimiento breve? Si no, (b).
3. ¿`.ps1` operativo dedicado, o script Node + runbook?
4. Sin endpoint HTTP: la rotación es operación de infraestructura sobre el VPS.
5. Runbook §5 y `README.md:155` se reescriben en el mismo work unit que el script.

## Alcance no incluido (recomendado)

- Versionar `rotate-jwt.ps1` / `install-cert-soporte.ps1`.
- Tocar `SmtpEmailSender.send()`.
- Endpoint HTTP para disparar la rotación.
- Enfoque (c) sin que la decisión 1 lo justifique.

## Riesgos

- Estado mixto tras una interrupción (mitigado por transacción única).
- Indistinguibilidad clave-equivocada / payload-corrupto en `decrypt()`.
- Divergencia entre las dos implementaciones del cifrado si cambia el formato.
- Rotar a mano hoy saltea las salvaguardas de `deploy.ps1`.
- Restaurar un dump sin la `EMAIL_CRYPTO_KEY` vigente en ese momento deja las
  credenciales indescifrables.

## Listo para propuesta

Sí, una vez resueltas las decisiones 1-3 por el dueño del repo.

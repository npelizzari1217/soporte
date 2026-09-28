# Tareas: Rotación de `EMAIL_CRYPTO_KEY`

> **Desviación de presupuesto declarada.** La skill `sdd-tasks` limita este artefacto a 530
> palabras; este documento lo supera, siguiendo el precedente de
> `openspec/changes/archive/2026-09-24-feriados-configurables/tasks.md` y
> `openspec/changes/archive/2026-09-21-logo-por-cliente/tasks.md`. La presión: 14
> requerimientos con su trazabilidad (`Rn`), 4 work units cada una con código+tests+docs en
> el mismo commit (regla del repo), y verificación explícita por unidad — nada recortable sin
> perder trazabilidad o el control de secretos que la propia spec exige (R12).

## Review Workload Forecast

| Campo | Valor |
|-------|-------|
| Líneas cambiadas estimadas | WU1a ~212 · WU1b ~209 · WU2a ~230 · WU2b ~170 · WU3 ~345 (total ~1.075) |
| Riesgo respecto del presupuesto de 400 líneas | Alto si fuera una sola PR; cada unidad ya dividida queda Baja/Media |
| PRs encadenadas recomendadas | Sí |
| División sugerida | PR 1 (WU1a) → PR 2 (WU1b) → PR 3 (WU2a) → PR 4 (WU2b) → PR 5 (WU3) |
| Estrategia de entrega | auto-chain |
| Estrategia de cadena | stacked-to-main (PR1 → `main`; PR2 → rama de PR1; PR3 → rama de PR2; PR4 → rama de PR3; PR5 → rama de PR4) |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

**Nota sobre WU2**: el diseño estimó la unidad "Transacción, `--dry-run`, `--verificar`,
`main()` + integración y test de proceso" en ~400 líneas — justo en el borde del
presupuesto. Se divide preventivamente en **WU2a** (transacción real + `--dry-run`) y
**WU2b** (`--verificar` + test de proceso), para no arriesgar sobrepasar el límite si el
código real queda más largo que la estimación.

### Unidades de trabajo sugeridas

| Unidad | Objetivo | PR probable | Comando de test focalizado | Harness de runtime | Límite de rollback |
|---|---|---|---|---|---|
| 1a | `lib/cifrado-secreto-v1.mjs` (puro) + su spec de descifrado cruzado | PR 1 | `pnpm vitest run scripts/lib/cifrado-secreto-v1.spec.ts` | N/A — funciones puras, sin I/O ni base de datos | Archivos nuevos sin wiring; revertir borra un módulo sin tocar nada existente |
| 1b | Validación/clasificación de `rotar-email-crypto-key.mjs` + su spec unitario | PR 2 | `pnpm vitest run scripts/rotar-email-crypto-key.spec.ts` | N/A — funciones puras, sin I/O ni base de datos | Archivos nuevos que solo importan el módulo de WU1a; revertir no toca WU1a |
| 2a | `ejecutarRotacion()` transaccional + `--dry-run` + `main()`/CLI + integración completa | PR 3 | `pnpm vitest run backend/scripts/rotar-email-crypto-key.integration.spec.ts` | Base efímera de Postgres (`soporte-postgres-master`), corrida real del script contra ella | Extiende el archivo de WU1 de forma aditiva; el script nunca corrió fuera de una base de test, revertir no afecta producción |
| 2b | Modo `--verificar` + test de proceso (exit codes y ausencia de secretos en stdout/stderr) | PR 4 | `pnpm vitest run backend/scripts/rotar-email-crypto-key.proceso.spec.ts` | `spawn` real del proceso Node contra la misma base efímera | Agrega un modo de solo lectura y un spec nuevo; revertir no toca la transacción de WU2a |
| 3 | `rotate-email-crypto-key.ps1` + `ps1-ascii.spec.ts` + runbook §5 + `README.md:155` | PR 5 | `pnpm vitest run backend/scripts/ps1-ascii.spec.ts` | Manual: `-DryRun` contra el VPS real — hueco declarado, no hay forma de ejecutar `.ps1` desde WSL | `.ps1` + docs nuevos/modificados; revertir no toca el script Node de WU1/WU2 |

---

**Nota sobre WU1**: la unidad original sumó 421 líneas de código y tests, por encima del
presupuesto de 400. Por decisión del dueño del repo (2026-09-28) se parte en **WU1a**
(cifrado puro + descifrado cruzado) y **WU1b** (validación y clasificación).

## WU1a: Cifrado puro (PR 1 → `main`)

- [x] 1.1 Crear `backend/scripts/lib/cifrado-secreto-v1.mjs`: `leerClaveHex(hex)`,
      `cifrarV1(claveBuffer, textoPlano, aad)`, `descifrarV1(claveBuffer, payload, aad)`,
      formato `v1:{iv}:{tag}:{ct}` espejo de
      `backend/src/shared/infrastructure/crypto/aes-gcm-secret-cipher.ts` (read-only). (R8, R10)
- [x] 1.2 Crear `backend/scripts/lib/cifrado-secreto-v1.spec.ts`: descifrado cruzado en las
      dos direcciones contra `AesGcmSecretCipher` (read-only), payload rechazado con AAD
      ajeno, payload rechazado con clave ajena. (R8, R10)
- [x] 1.6 Verificación de la unidad: `pnpm lint`, `pnpm typecheck`,
      `pnpm vitest run scripts/lib/cifrado-secreto-v1.spec.ts`, `pnpm test` (suite completa de backend).

## WU1b: Validación y clasificación (PR 2 → rama de PR 1)

- [x] 1.3 Agregar `validarClaves(oldKey, newKey)` a
      `backend/scripts/rotar-email-crypto-key.mjs`: 64 caracteres hexadecimales, comparación
      **como bytes** para exigir `OLD !== NEW`, aborta antes de abrir cualquier conexión a la
      base. (R1)
- [x] 1.4 Agregar `clasificarFila(fila, oldKeyBuf, newKeyBuf)` a
      `backend/scripts/rotar-email-crypto-key.mjs`: tabla ADR-1
      (`pendiente`/`ya_migrada`/`indescifrable`); un payload malformado (≠4 segmentos o
      prefijo ≠ `v1`) también es `indescifrable`. (R5, R6)
- [x] 1.5 Crear `backend/scripts/rotar-email-crypto-key.spec.ts`: validación de longitud/hex/
      igualdad por bytes (R1), tabla completa de clasificación de ADR-1 incl. payload
      malformado (R5, R6); molde `backend/scripts/backfill-correo-clientes.spec.ts`
      (read-only) para setear `process.env.EMAIL_CRYPTO_KEY`.
- [x] 1.7 Verificación de la unidad: `pnpm lint`, `pnpm typecheck`,
      `pnpm vitest run scripts/rotar-email-crypto-key.spec.ts`, `pnpm test` (suite completa de backend).

## WU2a: Transacción real + `--dry-run` (PR 3 → rama de PR 2)

- [ ] 2a.1 Agregar `ejecutarRotacion(pool, opciones, deps = { cifrar: cifrarV1 })` a
      `backend/scripts/rotar-email-crypto-key.mjs`: un solo
      `client = await pool.connect()`, `BEGIN`, `SELECT ... FOR UPDATE` (excluye
      `smtp_password_cifrada IS NULL`), clasificar con 1.4, `UPDATE ... WHERE id=$1 AND
      smtp_password_cifrada=$2` exigiendo `rowCount===1`, `SELECT` de relectura, descifrado
      con `NEW_KEY` y comparación contra el texto plano, `COMMIT`/`ROLLBACK`.
      (R2, R4, R7, R8, R9)
- [ ] 2a.2 Agregar el modo `--dry-run` (`BEGIN READ ONLY` … `ROLLBACK`, round-trip solo en
      memoria, ningún `UPDATE`). (R3)
- [ ] 2a.3 Agregar el parseo de CLI y `main()` con guarda `import.meta.url` (molde
      `backend/scripts/backfill-correo-clientes.mjs:250` (read-only)); códigos de salida
      0/1/2/3 de ADR-1. (R1, R2)
- [ ] 2a.4 Crear `backend/scripts/rotar-email-crypto-key.integration.spec.ts`: base efímera
      (molde `backend/scripts/backfill-correo-clientes.integration.spec.ts` (read-only),
      `PostgresAdminService`, replay hasta `20260820160000_add_cliente_smtp_config`,
      `pool.end()` antes de `dropDatabase()`); escenarios: rotación completa exitosa,
      `ROLLBACK` ante una fila indescifrable, `--dry-run` sin cambios (payloads idénticos
      byte a byte), re-corrida no-op, filas mixtas OLD/NEW, filas `NULL` intactas, AAD
      ligado (el ciphertext de A no descifra con el `id` de B), round-trip fallido vía
      `deps.cifrar` → `ROLLBACK` total. (R2, R3, R4, R5, R6, R7, R8, R9)
- [ ] 2a.5 Verificación de la unidad: `pnpm lint`, `pnpm typecheck`,
      `pnpm vitest run backend/scripts/rotar-email-crypto-key.integration.spec.ts`,
      `pnpm test`.

## WU2b: Modo `--verificar` + test de proceso (PR 4 → rama de PR 3)

- [ ] 2b.1 Agregar el modo `--verificar` a `backend/scripts/rotar-email-crypto-key.mjs`:
      recibe `ROTACION_VERIFICAR_KEY`, `BEGIN READ ONLY` … `ROLLBACK`, comprueba que toda
      fila no nula descifra con esa clave usando su `id` como AAD, nunca escribe, nunca
      imprime la clave ni texto plano, exit 0 si todas descifran, mismo exit que una fila
      indescifrable si al menos una falla. (R11, R12)
- [ ] 2b.2 Extender `rotar-email-crypto-key.integration.spec.ts` con los escenarios de
      `--verificar`: todas las filas descifran (exit 0, sin escritura), al menos una no
      descifra (exit ≠0, sin escritura). (R11)
- [ ] 2b.3 Crear `backend/scripts/rotar-email-crypto-key.proceso.spec.ts`:
      `spawn(process.execPath, [script])` contra la misma base efímera; exit codes 0/2/3
      para rotación éxito/no-op/fallo y para `--verificar` éxito/fallo; asserts de que
      `OLD_KEY`, `NEW_KEY` y cualquier texto plano **nunca** aparecen en stdout+stderr
      combinados. Es el único caso de la matriz de amenazas del diseño con applicability
      real (paso de secretos al proceso hijo, ADR-3) — test obligatorio antes de cerrar
      esta unidad. (R12)
- [ ] 2b.4 Verificación de la unidad: `pnpm lint`, `pnpm typecheck`,
      `pnpm vitest run backend/scripts/rotar-email-crypto-key.integration.spec.ts backend/scripts/rotar-email-crypto-key.proceso.spec.ts`,
      `pnpm test`.

## WU3: `.ps1` operativo + runbook + README (PR 5 → rama de PR 4)

- [ ] 3.1 Crear `rotate-email-crypto-key.ps1`, pasos 0-3: guardia de PATH/versión de Node
      (molde `deploy.ps1:38-73` (read-only)), carga y validación de `OLD` desde
      `backend/.env`, aborto si existe `backups\rotacion-email-crypto-key-*.PENDIENTE.txt`,
      generación de `NEW` vía `& $NodeExe -e "...randomBytes(32)..."` (molde
      `deploy.ps1:160` (read-only)), invocación de Node en `--dry-run`. (R13)
- [ ] 3.2 Agregar los pasos 4-6: invocar `predeploy-dump.ps1` (read-only) como proceso hijo,
      escribir `backups\rotacion-email-crypto-key-<ts>.PENDIENTE.txt` (ASCII) ANTES del paso
      que puede hacer `COMMIT`, invocar Node en modo real, árbol de recuperación con
      `--verificar OLD/NEW` ante `exit ≠ 0` (ADR-4). (R13)
- [ ] 3.3 Agregar los pasos 7-9: reescritura completa de `.env` vía archivo temporal +
      `[System.IO.File]::Replace` (nunca `Add-Content`), relectura desde disco +
      `--verificar`, ACL con `icacls` (SIDs `S-1-5-32-544`/`S-1-5-18`) sobre los dos
      archivos de recuperación, cierre del archivo permanente (solo `OLD_KEY`+`DUMP`+fecha,
      nunca `NEW_KEY`) y borrado del `PENDIENTE`, `Start-Service` de los dos servicios.
      (R13)
- [ ] 3.4 Códigos de salida 0/1/3/4 del `.ps1` y mensajes de consola sin secretos (ADR-4);
      molde `rotate-admin-pw.ps1` (read-only) y `AssertOk` de `deploy.ps1:51-55`
      (read-only). (R12, R13)
- [ ] 3.5 Crear `backend/scripts/ps1-ascii.spec.ts`: todo `*.ps1` de la raíz del repo, cada
      byte ≤ 0x7F y sin marca BOM. (R14)
- [ ] 3.6 Reescribir `DEPLOY-VPS-runbook.md` §5 (~313-330): uso del `.ps1`, códigos de
      salida, recuperación ante fallo tras `COMMIT`, retención de los archivos de
      recuperación. (R13)
- [ ] 3.7 Actualizar `README.md:155`: la fila de `EMAIL_CRYPTO_KEY` remite a
      `rotate-email-crypto-key.ps1`.
- [ ] 3.8 Verificación de la unidad: `pnpm lint`, `pnpm typecheck`,
      `pnpm vitest run backend/scripts/ps1-ascii.spec.ts`, `pnpm test`.

---

## Seguimiento fuera de este ciclo

La fila de `rotate-email-crypto-key.ps1` en la tabla §2.2 de las reglas globales vive en el
repositorio padre `proyectos`, que tiene otro historial. No es una tarea de este ciclo: se
hace como edición directa en ese repositorio, en su propio commit, una vez integrada WU3.

## Trazabilidad de requerimientos

R1 → 1.3, 1.5, 2a.3 · R2 → 2a.1, 2a.3, 2a.4 · R3 → 2a.2, 2a.4 · R4 → 2a.1, 2a.4 · R5 → 1.4,
1.5, 2a.4 · R6 → 1.4, 1.5, 2a.4 · R7 → 2a.1, 2a.4 · R8 → 1.1, 1.2, 2a.1, 2a.4 · R9 → 2a.1,
2a.4 · R10 → 1.1, 1.2 · R11 → 2b.1, 2b.2 · R12 → 2b.1, 2b.3, 3.4 · R13 → 3.1, 3.2, 3.3, 3.6
· R14 → 3.5

## Success Criteria (de `proposal.md`)

Cubiertos: base efímera en `NEW_KEY` (2a.4) · `--dry-run` sin escritura (2a.2, 2a.4) · fila
indescifrable aborta sin modificar nada (1.4, 2a.4) · re-corrida no-op (1.4, 2a.4) ·
descifrado cruzado en verde (1.2) · `.ps1` ASCII sin BOM (3.5) · runbook + README
actualizados (3.6, 3.7) · `pnpm lint`/`typecheck`/`test` en verde en cada unidad (1.6, 1.7, 2a.5,
2b.4, 3.8).

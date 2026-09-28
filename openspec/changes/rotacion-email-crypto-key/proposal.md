# Proposal: Rotación de `EMAIL_CRYPTO_KEY`

## Intent

Hoy no existe ninguna herramienta para rotar `EMAIL_CRYPTO_KEY` (`docs/roadmap-comercial.md:486`). Rotarla implica editar `backend/.env` a mano en el VPS y deja indescifrables las `smtp_password_cifrada` de `clientes`. Ante un incidente (clave filtrada), la operación tiene que ser segura y repetible.

## Decisiones cerradas por el dueño (2026-09-28)

| # | Decisión |
|---|---|
| 1 | Rotación **ocasional, ante incidente** → enfoque (a): re-cifrado offline con `OLD_KEY`/`NEW_KEY` explícitas. Formato `v1` intacto; sin `kid`, sin `v2`, sin keyring |
| 2 | Ventana de mantenimiento breve **aceptada**; sin dual-key |
| 3 | `.ps1` dedicado `rotate-email-crypto-key.ps1`, molde de `rotate-admin-pw.ps1` |
| 4 | Sin fase de research |

## Preguntas de `rules.proposal`

- ¿Espeja otra capa? Sí: el script Node duplica el cifrado de `AesGcmSecretCipher` → test de descifrado cruzado obligatorio.
- ¿Alternativas con comportamiento distinto? (b) y (c) de la exploración, descartadas por las decisiones 1 y 2.
- ¿Cambia lo que ve el usuario? No. Sin deuda de Ayuda.

## Scope

### In Scope
- `backend/scripts/rotar-email-crypto-key.mjs`: transacción única; `--dry-run` con round-trip; round-trip antes del `COMMIT`; fallo duro ante una fila que no descifra con ninguna clave; re-corrida documentada (fila que ya descifra con `NEW_KEY` = no-op explícito).
- Tests: unitario con descifrado cruzado contra `AesGcmSecretCipher`; integración con base efímera (molde `backfill-correo-clientes.integration.spec.ts`).
- `rotate-email-crypto-key.ps1` en la raíz: backup (`predeploy-dump.ps1`), dry-run, re-cifrado, reescritura completa de `.env` (nunca `Add-Content`), Node fijado a `C:\nodejs24`. 100 % ASCII, sin BOM.
- Mismo work unit: reescribir `DEPLOY-VPS-runbook.md` §5 (~313-330) y `README.md:155`.

### Out of Scope
- Endpoint HTTP; log crudo de `SmtpEmailSender.send()`; versionar `rotate-jwt.ps1`/`install-cert-soporte.ps1`; modificar `deploy.ps1`; cambios a `AesGcmSecretCipher`.

### Seguimiento cross-repo (fuera de los commits de `soporte`)
- Agregar `soporte/rotate-email-crypto-key.ps1` a la tabla §2.2 de `~/proyectos/CLAUDE.md` (repo padre `/home/usuario/proyectos`, commit propio).

## Capabilities

### New Capabilities
- `email-crypto-key-rotacion`: re-cifrado atómico de `clientes.smtp_password_cifrada` de `OLD_KEY` a `NEW_KEY`, con dry-run, verificación, fallo duro y re-corrida definida.

### Modified Capabilities
- Ninguna.

## Affected Areas

| Área | Impacto |
|---|---|
| `backend/scripts/rotar-email-crypto-key.mjs` (+ specs) | New |
| `rotate-email-crypto-key.ps1` | New |
| `DEPLOY-VPS-runbook.md` §5 · `README.md:155` | Modified |
| `AesGcmSecretCipher` · `deploy.ps1` | Sin cambios |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Divergencia entre las dos implementaciones del cifrado | Media | Test de descifrado cruzado |
| Clave errónea indistinguible de payload corrupto | Media | Probar ambas claves; abortar si ninguna sirve |
| `.env` corrupto o `OLD_KEY` perdida | Media | Reescritura completa; conservar `OLD_KEY` hasta confirmar éxito |
| Dump restaurado sin su clave vigente | Baja | Runbook: la clave se respalda junto con el dump |

## Rollback Plan

Código: `git revert`. Datos: si el `COMMIT` no ocurrió, la transacción deja todo en `OLD_KEY`. Si ocurrió, restaurar el dump previo y el `.env` con `OLD_KEY`, o re-correr el script invirtiendo las claves.

## Dependencies

- Postgres master accesible; ventana de mantenimiento con NSSM detenido.

## Success Criteria

- [ ] Rotación en base efímera: todas las filas descifran con `NEW_KEY`.
- [ ] `--dry-run` no escribe nada.
- [ ] Una fila indescifrable aborta sin modificar ninguna fila.
- [ ] Re-corrida sobre filas migradas: no-op explícito.
- [ ] Descifrado cruzado script ↔ `AesGcmSecretCipher` en verde.
- [ ] `.ps1` 100 % ASCII, sin BOM.
- [ ] Runbook §5 y `README.md:155` actualizados.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` en verde en backend.

# Propuesta: formulario público por cliente + QR en equipos

## Intención

Quien está frente a un equipo con falla (un aula, una oficina) suele no tener cuenta y no puede abrir un ticket. Un formulario público por cliente, al que se llega por un QR pegado en el equipo, resuelve el caso sin la ambigüedad de tenant que postergó el punto 6: el cliente viene en la URL.

Decisión de producto: `docs/roadmap-comercial.md`, "Segunda etapa — brechas frente a la competencia" → "Decisiones de producto de la segunda etapa" → "Segunda etapa, punto 1 — formulario público + QR". Cada viñeta (D1-D12) se convierte en requerimiento con escenario en la spec.

## Alcance

### Incluido
- D1: cualquiera pide; el ticket se crea al confirmar un link de un solo uso enviado por mail.
- D2: solicitante externo local al tenant; sin `Usuario` ni `Membresia`.
- D3: cliente sin correo configurado: solo usuarios registrados, con sesión iniciada (el formulario y el QR llevan al login y después al alta con el equipo cargado). Precisado por el dueño el 2026-10-03.
- D4: el ticket nace en NUEVO, sin moderación.
- D5: número, cambios de estado y CSAT por mail al solicitante.
- D6: tipo SOPORTE y prioridad MEDIA fijos.
- D7: slug del cliente cargado por ROOT, inmutable tras el primer QR.
- D8: un QR por equipo con token opaco regenerable; equipo dado de baja abre el formulario sin equipo.
- D10: 3 pedidos por mail cada 15 min, 30 por cliente por hora; mensaje genérico al excederlos.
- D11: datos del externo retenidos mientras exista el ticket; retención anotada para revisión.
- D12: formulario apagado por defecto; lo habilita ROOT, como CSAT.
- 404 uniforme ante slug, token o cliente inválidos (anti-enumeración).

### Excluido
- D5: página de seguimiento. D8: impresión de QR en lote. D9: adjuntos.
- Política de borrado de datos de externos (D11, revisión posterior).
- Escritura de Ayuda (suspendida): solo se anota la deuda en commit y PR.

## Capacidades

### Nuevas
- `formulario-publico-cliente`: slug, habilitación ROOT, regla de correo (D3, D7, D12).
- `equipos-qr`: emitir, regenerar y resolver el token de equipo (D8).
- `solicitante-externo`: identidad local al tenant, contacto para notificaciones y CSAT (D2, D5, D11).
- `pedido-publico`: alta pública, verificación por link, defaults, límites, 404 uniforme (D1, D4, D6, D10).

### Modificadas
- Ninguna.

## Enfoque

Enfoque B de la exploración. El cliente se resuelve desde la fila master por slug y recién entonces se bindea `TenantContext` (patrón `ResolverEncuestaTokenService`). Token de verificación en master, calcado de `EncuestaToken`. Throttler propio por email y por cliente, sin XFF. El alta pasa por `CrearTicketSoporteUseCase` para heredar ciclo, numeración, lock de baja y SLA. `solicitanteId` pasa a nullable con CHECK "exactamente uno" frente a `solicitante_externo_id`.

Preguntas de `config.yaml`: espeja otra capa (Zod del frontend, CHECK de Postgres; el backend es la fuente); hubo alternativas (A y C, descartadas); cambia lo que ve el usuario (deuda de Ayuda).

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `backend/prisma_master/schema.prisma` | Modificado | slug, habilitación, token de verificación |
| `backend/prisma_tenant/schema.prisma` | Modificado | solicitante externo, token QR, `tickets.solicitante_id` nullable |
| `backend/src/clientes`, `equipos`, `tickets`, `notificaciones`, `csat` | Modificado | ROOT, QR, contacto del externo |
| `backend/src/publico` (nuevo) | Nuevo | controlador, throttler, verificación |
| `frontend/src/app/(publico)/c/[slug]/pedido`, `middleware.ts` | Nuevo/Modificado | formulario, `/c/` en `RUTAS_PUBLICAS` |

## Entrega

`auto-chain`, 1.600-2.400 líneas: WU-1 slug y habilitación; WU-2 token y QR; WU-3 solicitante externo; WU-4 endpoint público y anti-abuso; WU-5 frontend público. PR encadenado por WU bajo 400 líneas.

## Riesgos

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Escritura en un tenant ajeno | Baja | e2e con dos tenants y guards reales; mutación del bind |
| `solicitanteId` nulo rompe listados o CSAT | Media | tests de cada lector en WU-3 |
| Throttler en memoria no escala | Media | documentado; un solo proceso hoy |
| D3 sin mail: cómo prueba identidad un registrado | Media | resuelto por el dueño: se exige sesión iniciada |

## Rollback

Habilitación apagada por defecto: desactivar por cliente lo vuelve inerte. Cada WU se revierte con `git revert`; las migraciones son aditivas, salvo el nullable, que se revierte mientras no existan tickets externos.

## Dependencias

- SMTP por cliente (`ICorreoDeCliente`) para D1.

## Criterios de éxito

- [ ] D1-D12 con requerimiento, escenario y test.
- [ ] Ningún pedido escribe fuera del tenant del slug.
- [ ] Gates backend y frontend en verde; `check-roadmap-fresco.mjs` pasa con la viñeta declarada Cumplida o Desviación.

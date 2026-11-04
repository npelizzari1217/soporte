# Edilicia con obra externa: presupuesto, pesos y certificación de avance

Un ticket de Edilicia puede ejecutarse con técnicos internos (como hoy) o con un contratista externo.
En el externo, el presupuesto es una compra aprobada, el avance son las tareas con peso, y un
responsable certifica grupos de tareas para que administración pague fuera del sistema.

## Specs

- **S1 — Modalidad.** "permitir indicar si el trabajo se va a hacer por tecnicos internos o Externos, si es interno sería como trabaja ahora". El ticket lleva `modalidad` `INTERNA | EXTERNA`, con `INTERNA` por defecto; un ticket interno se comporta exactamente como hoy. Vale para cualquier tipo de ticket (L6). Se puede cambiar solo mientras el ticket no tenga tareas ni compras vinculadas (L6).
- **S2 — Presupuesto.** "si es externo las compras serían una suerte de presupuesto aprobado". El presupuesto es una o más compras vinculadas con ítems de servicio (`es_servicio`, sin insumo). Un ítem de servicio no suma stock. Una compra cuyos ítems activos son todos de servicio no bloquea el ticket, cualquiera sea su modalidad; una compra mixta sigue bloqueando (L6).
- **S3 — Avance por tareas.** "el avance de obra complido serian las tareas que van desarrollando". El avance físico de un ticket externo son sus tareas completadas.
- **S4 — Peso de las tareas.** "las tareas deben tener un peso en si mismo". En un ticket externo cada tarea tiene un peso; los pesos del ticket suman exactamente 100 % antes de poder emitir el primer certificado. En un ticket interno el peso no se usa.
- **S5 — Certificado agrupa tareas.** "un certificado del 20% tiene 5 tareas que se deben cumplir para llegar a ese 20 %". Un certificado incluye una o más tareas completadas y vale la suma de sus pesos; el porcentaje se calcula, no se carga a mano. Una tarea entra en un solo certificado vigente.
- **S6 — Responsable que certifica.** "tiene que existir un responsable dentro del sistema que marque que ese avance de obra se certifico terminado para realizar el pago". Certificar requiere un permiso propio (`CERTIFICAR`); el certificado registra quién lo emitió y cuándo.
- **S7 — Sin administración.** "no vamos a realizar la administracion con lo cual alcanza con que el responsable marque el avance de obra". El sistema no registra pagos, facturas ni retenciones; el certificado (con su PDF) es la salida hacia administración.
- **S8 — Inmutabilidad de lo certificado.** El certificado guarda una copia del peso de cada tarea. Una tarea certificada no puede cambiar su peso, borrarse ni descompletarse sin anular antes el certificado; la anulación exige motivo y queda en el historial.
- **S9 — Adicionales.** Una tarea nueva en un ticket con pesos que ya suman 100 % obliga a redistribuir los pesos solo entre las tareas no certificadas. La ampliación de presupuesto queda fuera de esta versión.
- **S10 — Cierre y métricas.** Un ticket externo no se cierra con tareas sin certificar. Las tareas de un ticket externo no suman en la métrica "tareas completadas por técnico".

## Tasks

- [x] T1a — S1: `tickets.modalidad` en backend (migración, entidad, DTOs, regla de edición) · inline · commit: `c4c4fee2`
- [ ] T1b — S2: ítems de servicio en compras y excepción al bloqueo · inline · commit: —
- [ ] T1c — S1, S2: frontend de modalidad y del ítem de servicio · inline · commit: —
- [ ] T2 — S3, S4, S9: `tareas_ticket.peso`, validación de suma 100 % y redistribución ante adicionales · inline · commit: —
- [ ] T3 — S5, S6, S8: tablas `certificaciones_avance` y `certificacion_tarea`, permiso `CERTIFICAR`, emisión y anulación · inline + verify (riesgo alto: permisos y datos) · commit: —
- [ ] T4 — S5, S6, S8: frontend de certificados en el detalle del ticket · inline · commit: —
- [ ] T5 — S7, S10: PDF del certificado, regla de cierre y exclusión en el dashboard · inline · commit: —

## Log

- **L1 (pedido original):** "quiero que analicemos el impacto que tiene modificar los items de Edilicia para permitir indicar si el trabajo se va a hacer por tecnicos internos o Externos, si es interno sería como trabaja ahora, pero si es externo las compras serían una suerte de presupuesto aprobado y el avance de obra complido serian las tareas que van desarrollando. dime como lo plantearias tu y vemos si conviene hacerlo junto a lo que hay o por separado y si ademas tiene sentido colocarlo dentro del sistema"
- **L2 (decisión):** se hace dentro del ticket unificado, como modalidad, sin tablas satélite.
- **L3 (usuario):** "Creo que hay que certificarlo, tiene que existir un responsable dentro del sistema que marque que ese avance de obra se certifico terminado para realizar el pago, aunque como digimos no vamos a realizar la administracion con lo cual alcanza con que el responsable marque el avance de obra que incluso puede incluir varias tareas"
- **L4 (usuario):** "pienso que las tareas deben tener un peso en si mismo y puede ser que un certificado del 20% tiene 5 tareas que se deben cumplir para llegar a ese 20 %"
- **L5 (decisión propuesta y aceptada al crear el documento):** S8 y S9 son recomendaciones del análisis (copia del peso en el certificado; redistribución solo entre tareas no certificadas). Se revisan antes de T2 y T3 si el dueño quiere otra cosa.
- **L6 (usuario, decisiones de T1):** modalidad editable "Solo sin tareas ni compras"; EXTERNA vale para "Cualquier tipo"; deja de bloquear "Cualquier compra solo de servicio"; presupuestos "Varios, sin límite".
- **L7 (evidencia T1a):** typecheck 0; lint 0; suite completa 820/821 archivos en verde, el restante era el centinela del catálogo de errores (faltaba `ModalidadNoEditableError`), corregido y en verde (91/91). Integración `tickets-modalidad` roja sin la migración y verde con ella.
- **L8 (verificación independiente de T1a, bugfix con TDD):** el verificador encontró que `modalidad: null` pasaba la validación (`@IsOptional` acepta null) y volvía INTERNA en silencio a un ticket EXTERNA. RED: `modalidad-dto.spec.ts`, 6/6 en rojo por aceptar null. GREEN: `@ValidateIf(v !== undefined)` en los cuatro DTO, 6/6 en verde. Se sumaron los casos faltantes de `EditarReparacion` (compra cancelada con ROOT; reenviar la misma modalidad). Focalizados 315/315, typecheck 0, lint 0.

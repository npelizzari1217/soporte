# Delta for Unidades de Insumo con Número de Serie

## MODIFIED Requirements

### Requirement: Las operaciones de unidad son reutilizables en lote

Las operaciones que mueven una unidad entre estados (devolver al depósito,
descartar) DEBEN poder aplicarse a varias unidades dentro de una misma transacción,
con reversión total si una falla y sin depender del flujo de un componente
individual. La baja de equipo completo (spec `equipos-baja-completa`) DEBE
consumirlas: una sola llamada por tipo de operación con todas las unidades del
equipo, tomando los bloqueos de insumo y de unidad en un orden ordenado y
consistente con el de las instalaciones. La baja solo lleva unidades `INSTALADA` a
`EN_DEPOSITO` `USADO` o a `DESCARTADA`, y exige que cada unidad esté instalada en el
equipo dado de baja; la entrega (`ENTREGADA`) y su devolución son propias de la
SALIDA manual desde el depósito y no forman parte de la baja de equipo. La forma de
la interfaz queda a decisión de diseño.
(Previously: las operaciones "DEBERÍAN" ser reutilizables en lote para un ciclo futuro, e incluía la instalación, y el requerimiento prohibía implementar la baja de equipo completo.)

#### Scenario: Varias unidades en una transacción

- GIVEN un equipo con dos unidades `INSTALADA`
- WHEN se devuelven ambas al depósito mediante la operación de unidad en una sola transacción
- THEN ambas quedan `EN_DEPOSITO` `USADO` con su serial

#### Scenario: Falla en una del lote

- GIVEN un lote donde una de las unidades ya no está `INSTALADA`
- WHEN se aplica la operación
- THEN se rechaza el lote y ninguna unidad cambia

#### Scenario: Descartar varias unidades en una transacción

- GIVEN un equipo con dos unidades `INSTALADA`
- WHEN se descartan ambas mediante la operación de unidad en una sola transacción
- THEN ambas quedan `DESCARTADA` con su evento `DESCARTE` y sin movimientos

#### Scenario: Unidad instalada en otro equipo

- GIVEN un lote donde una unidad está `INSTALADA` en un equipo distinto del que se da de baja
- WHEN se aplica la operación
- THEN se rechaza el lote y ninguna unidad cambia

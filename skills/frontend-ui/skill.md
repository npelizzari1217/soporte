---
name: frontend-ui-polish
description: Aplica el sistema de diseño premium, tokens de Tailwind y valida la consistencia visual en Next.js.
trigger:
  files:
    - "frontend/src/**/*"
    - "tailwind.config.*"
---

# SKILL: DISEÑO PREMIUM Y CONSISTENCIA VISUAL

## Objetivo
Garantizar que todo desarrollo en el Frontend de "Soporte" se adhiera a la paleta sofisticada, interacciones de alta calidad y la regla de diseño consistente.

## Paleta de Colores Corporativa (Tailwind)
* **Background General (Dark Mode):** `#0b0f19` (Slate azulado muy oscuro).
* **Tarjetas y Contenedores:** `#111827` (Gris oscuro/Slate).
* **Acento Primario:** Violet / Indigo (`#8b5cf6`).
* **Estados de Ticket:**
  * Abierto / Pendiente: Amber / Orange (`#f59e0b` / `#f97316`).
  * En Curso / Reparando: Cyan (`#06b6d4`).
  * Completado / Resuelto: Emerald Green (`#10b981`).
  * Rechazado / Cancelado: Rose / Red (`#f43f5e`).

## Reglas de Ejecución UI
* **Modo Oscuro/Claro:** Todas las clases de color deben contemplar variantes de contraste nativas usando el prefijo `dark:`.
* **Notificaciones:** El sistema de alertas se realiza exclusivamente a través de Toasts en pantalla (sonido apagado, animación de entrada fluida por el lateral derecho superior).
* **Inputs y Formularios:** Siempre deben incluir validaciones en cliente con feedback inmediato en color rojo (`text-rose-500`) y deshabilitar el botón de submit si existen errores.

"use client";

/**
 * WebhookSection — CONTAINER de la sección "Webhooks" de Integraciones
 * (webhooks, T7 / CA4, CA6, CA7): configuración del destino, secreto de firma
 * y registro de entregas. Se monta dentro del `<SoloAdminCliente>` de la vista.
 *
 * El secreto en claro vive SOLO en `secreto` (estado local), como la clave de
 * API: llega por el callback del guardado que crea el destino o de "Regenerar
 * secreto", se muestra en `ClaveCreadaDialog` y se tira al cerrarlo.
 *
 * El front no sabe si la API del cliente está habilitada (el flag es de ROOT),
 * así que el formulario queda siempre activo y el 422 se informa con su aviso.
 */
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatearInstante } from "@/shared/lib/formato-fecha";
import { notifyError } from "@/shared/lib/toast";
import { useWebhookConfig } from "../hooks/use-webhook";
import { avisoErrorWebhook, useGuardarWebhook, useRegenerarSecretoWebhook } from "../hooks/use-webhook-mutations";
import { ClaveCreadaDialog, type TextosSecretoUnico } from "./clave-creada-dialog";
import { WebhookConfigForm } from "./webhook-config-form";
import { WebhookEntregasTable } from "./webhook-entregas-table";

const TEXTOS_SECRETO_WEBHOOK: TextosSecretoUnico = {
  titulo: "Secreto de firma",
  descripcion:
    "Cópielo y guárdelo en un lugar seguro ahora: es la única vez que podrá verlo. Con él su sistema verifica que cada aviso viene de soporte. Si lo pierde, regenérelo.",
  etiqueta: "Secreto de firma del webhook",
  copiar: "Copiar secreto",
  copiado: "Copiado",
  cerrar: "Ya lo guardé",
};

export function WebhookSection() {
  const [secreto, setSecreto] = useState<string | null>(null);
  const query = useWebhookConfig();
  const guardarMutation = useGuardarWebhook(setSecreto);
  const regenerarMutation = useRegenerarSecretoWebhook(setSecreto);
  const config = query.data;

  return (
    <section aria-labelledby="webhooks-titulo" className="mt-10 border-t pt-6">
      <h2 id="webhooks-titulo" className="text-lg font-semibold text-foreground">
        Webhooks
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Soporte avisa a una URL de su sistema cada vez que ocurre un evento de un ticket, con una firma que su sistema
        verifica con el secreto. Para configurarlo, ROOT tiene que haber habilitado la API de este cliente.
      </p>

      {query.isLoading && <Skeleton className="h-40 w-full max-w-2xl" />}
      {query.isError && (
        <ErrorState message="No se pudo cargar la configuración del webhook." onRetry={() => query.refetch().catch(notifyError)} />
      )}
      {config && (
        <>
          <WebhookConfigForm
            key={config.actualizadoEn ?? "nuevo"}
            inicial={config}
            guardando={guardarMutation.isPending}
            errorServidor={guardarMutation.isError ? avisoErrorWebhook(guardarMutation.error) : undefined}
            onGuardar={(body) => guardarMutation.mutate(body)}
          />
          {config.configurado && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="outline" size="sm">
                    Regenerar secreto
                  </Button>
                }
                title="Regenerar secreto"
                description="¿Confirma regenerar el secreto de firma? El actual deja de funcionar en el acto: su sistema va a rechazar los avisos hasta que cargue el nuevo."
                confirmLabel="Regenerar"
                confirmVariant="destructive"
                isConfirming={regenerarMutation.isPending}
                onConfirm={() => regenerarMutation.mutate()}
              />
              {config.actualizadoEn && (
                <span className="text-xs text-muted-foreground">
                  Última modificación: {formatearInstante(config.actualizadoEn)}
                </span>
              )}
            </div>
          )}
        </>
      )}

      <h3 className="mb-2 mt-8 text-sm font-semibold text-foreground">Registro de entregas</h3>
      <WebhookEntregasTable />
      <ClaveCreadaDialog clave={secreto} onCerrar={() => setSecreto(null)} textos={TEXTOS_SECRETO_WEBHOOK} />
    </section>
  );
}

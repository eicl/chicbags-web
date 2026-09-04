import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fetchMessageTemplates, updateMessageTemplate, MessageTemplateKey } from "@/lib/api";
import { DEFAULT_MESSAGE_TEMPLATES } from "@/lib/messageTemplates";

// Orden y datos de referencia de cada plantilla — variables disponibles y en
// qué momento se usa cada una, para que quien edite sepa qué puede meter en
// el texto y cuándo se dispara.
const TEMPLATE_META: { key: MessageTemplateKey; label: string; usage: string; variables: [string, string][] }[] = [
  {
    key: "order_registration",
    label: "Confirmación de registro de pedido",
    usage: "Se abre en WhatsApp justo después de registrar un pedido (registro público o desde el panel).",
    variables: [
      ["cliente", "Nombre del cliente"],
      ["pedido", "Número de pedido"],
      ["fecha", "Fecha y hora en que se registró"],
      ["items", "Lista de productos/servicios del pedido"],
      ["total", "Total del pedido (sin \"S/.\")"],
      ["estado_texto", "Bloque con el estado y, si aplica, pagado/saldo pendiente/plazo"],
    ],
  },
  {
    key: "order_status_update",
    label: "Actualización de estado del pedido",
    usage: 'Se envía desde Admin > Pedidos al hacer clic en "Enviar estado por WhatsApp".',
    variables: [
      ["cliente", "Nombre del cliente"],
      ["pedido", "Número de pedido"],
      ["items", "Lista de productos/servicios del pedido"],
      ["estado_texto", "Bloque con el estado y, si aplica, pagado/saldo pendiente/plazo"],
    ],
  },
  {
    key: "customer_registration",
    label: "Confirmación de registro de cliente",
    usage: "Se abre en WhatsApp justo después de que un cliente se registra.",
    variables: [
      ["cliente", "Nombre del cliente"],
      ["apellido", "Apellido paterno del cliente"],
      ["codigo", "Código de cliente"],
      ["link", "Link para registrar su pedido"],
    ],
  },
];

const TemplateCard = ({ meta }: { meta: (typeof TEMPLATE_META)[number] }) => {
  const queryClient = useQueryClient();
  const { data: templates = [] } = useQuery({ queryKey: ["messageTemplates"], queryFn: fetchMessageTemplates });
  const savedValue = templates.find((t) => t.key === meta.key)?.template ?? DEFAULT_MESSAGE_TEMPLATES[meta.key];
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? savedValue;

  const mutation = useMutation({
    mutationFn: (template: string) => updateMessageTemplate(meta.key, template),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messageTemplates"] });
      toast.success("Plantilla guardada");
      setDraft(null);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo guardar la plantilla"),
  });

  const isDirty = draft !== null && draft !== savedValue;

  return (
    <div className="p-6 border border-border rounded-lg bg-card">
      <h3 className="text-lg font-medium mb-1" style={{ fontFamily: "var(--font-display)" }}>{meta.label}</h3>
      <p className="text-sm text-muted-foreground mb-4">{meta.usage}</p>

      <div className="flex flex-wrap gap-2 mb-3">
        {meta.variables.map(([name, description]) => (
          <span
            key={name}
            title={description}
            className="text-xs font-mono px-2 py-1 rounded-sm bg-muted text-muted-foreground"
          >
            {`{{${name}}}`}
          </span>
        ))}
      </div>

      <textarea
        value={value}
        onChange={(e) => setDraft(e.target.value)}
        rows={6}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />

      <div className="flex gap-3 mt-3">
        <Button
          size="sm"
          onClick={() => mutation.mutate(value)}
          disabled={mutation.isPending || !isDirty}
          className="gap-2"
        >
          <Save className="w-3.5 h-3.5" /> {mutation.isPending ? "Guardando..." : "Guardar"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDraft(DEFAULT_MESSAGE_TEMPLATES[meta.key])}
          disabled={value === DEFAULT_MESSAGE_TEMPLATES[meta.key]}
          className="gap-2"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Restaurar por defecto
        </Button>
      </div>
    </div>
  );
};

const AdminMessageTemplates = () => {
  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Personaliza el texto de los mensajes que se abren en WhatsApp. Usa los marcadores{" "}
        <span className="font-mono">{"{{...}}"}</span> que aparecen sobre cada campo — se reemplazan por el dato real
        al momento de enviar el mensaje.
      </p>
      {TEMPLATE_META.map((meta) => (
        <TemplateCard key={meta.key} meta={meta} />
      ))}
    </div>
  );
};

export default AdminMessageTemplates;

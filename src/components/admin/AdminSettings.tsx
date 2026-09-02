import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fetchSettings, updateSettings, AppSettings } from "@/lib/api";

// Panel de configuración general, organizado por secciones — por ahora solo
// "Pedidos" (todo lo relacionado al ciclo de vida y descuentos de un
// pedido). Si más adelante hace falta configurar otra cosa (productos,
// clientes, etc.), va como una sección nueva acá mismo.
const AdminSettings = () => {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });

  const [publicMax, setPublicMax] = useState("");
  const [adminMax, setAdminMax] = useState("");
  const [separationDays, setSeparationDays] = useState("");
  const [nearSeparationDeadlineDays, setNearSeparationDeadlineDays] = useState("");

  useEffect(() => {
    if (settings) {
      setPublicMax(String(settings.maxItemDiscountPublic));
      setAdminMax(String(settings.maxItemDiscountAdmin));
      setSeparationDays(String(settings.separationDays));
      setNearSeparationDeadlineDays(String(settings.nearSeparationDeadlineDays));
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: (data: AppSettings) => updateSettings(data),
    onSuccess: () => {
      toast.success("Configuración guardada");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo guardar la configuración"),
  });

  const handleSave = () => {
    const publicValue = Number(publicMax);
    const adminValue = Number(adminMax);
    const separationValue = Number(separationDays);
    const nearDeadlineValue = Number(nearSeparationDeadlineDays);
    if (!Number.isFinite(publicValue) || publicValue < 0) {
      toast.error("Ingresa un descuento máximo público válido");
      return;
    }
    if (!Number.isFinite(adminValue) || adminValue < 0) {
      toast.error("Ingresa un descuento máximo con admin válido");
      return;
    }
    if (!Number.isFinite(separationValue) || separationValue <= 0) {
      toast.error("Ingresa un plazo de separación válido");
      return;
    }
    if (!Number.isFinite(nearDeadlineValue) || nearDeadlineValue < 0) {
      toast.error("Ingresa un número de días válido para la alerta de plazo próximo");
      return;
    }
    mutation.mutate({
      maxItemDiscountPublic: publicValue,
      maxItemDiscountAdmin: adminValue,
      separationDays: separationValue,
      nearSeparationDeadlineDays: nearDeadlineValue,
    });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="p-6 border border-border rounded-lg bg-card">
        <h2 className="text-lg font-medium mb-1" style={{ fontFamily: "var(--font-display)" }}>Pedidos</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Descuentos máximos por ítem y plazos del ciclo de vida de un pedido.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Descuento máximo — link público (S/.)</label>
            <Input type="number" min={0} step={0.5} value={publicMax} onChange={(e) => setPublicMax(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Descuento máximo — con sesión de admin (S/.)</label>
            <Input type="number" min={0} step={0.5} value={adminMax} onChange={(e) => setAdminMax(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Plazo de separación (días)</label>
            <p className="text-xs text-muted-foreground mb-1">
              Días calendario para cancelar un pedido en "Separación" desde su primer pago, antes de que se cumpla el plazo.
            </p>
            <Input type="number" min={1} step={1} value={separationDays} onChange={(e) => setSeparationDays(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Alerta de plazo próximo (días)</label>
            <p className="text-xs text-muted-foreground mb-1">
              A cuántos días desde el primer pago se enciende la banderita roja en Pedidos.
            </p>
            <Input
              type="number"
              min={0}
              step={1}
              value={nearSeparationDeadlineDays}
              onChange={(e) => setNearSeparationDeadlineDays(e.target.value)}
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={mutation.isPending} className="gap-2">
          <Save className="w-4 h-4" /> {mutation.isPending ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </div>
  );
};

export default AdminSettings;

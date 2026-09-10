import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Upload, Loader2, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  fetchSettings, updateSettings, AppSettings,
  fetchPaymentCardLogos, createPaymentCardLogo, deletePaymentCardLogo, uploadImage,
} from "@/lib/api";
import { productImageUrl } from "@/lib/images";

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
  const [paymentGatewayLogo, setPaymentGatewayLogo] = useState("");
  const [uploadingGatewayLogo, setUploadingGatewayLogo] = useState(false);

  useEffect(() => {
    if (settings) {
      setPublicMax(String(settings.maxItemDiscountPublic));
      setAdminMax(String(settings.maxItemDiscountAdmin));
      setSeparationDays(String(settings.separationDays));
      setNearSeparationDeadlineDays(String(settings.nearSeparationDeadlineDays));
      setPaymentGatewayLogo(settings.paymentGatewayLogo);
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
      paymentGatewayLogo,
    });
  };

  const handleUploadGatewayLogo = async (file: File) => {
    setUploadingGatewayLogo(true);
    try {
      const { filename } = await uploadImage(file);
      setPaymentGatewayLogo(filename);
    } catch {
      toast.error("No se pudo subir el logo");
    } finally {
      setUploadingGatewayLogo(false);
    }
  };

  const { data: cardLogos = [] } = useQuery({ queryKey: ["paymentCardLogos"], queryFn: fetchPaymentCardLogos });
  const [uploadingCardLogo, setUploadingCardLogo] = useState(false);

  const createLogoMutation = useMutation({
    mutationFn: (image: string) => createPaymentCardLogo(image),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["paymentCardLogos"] }),
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo agregar el logo"),
  });

  const deleteLogoMutation = useMutation({
    mutationFn: (id: number) => deletePaymentCardLogo(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["paymentCardLogos"] }),
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo eliminar el logo"),
  });

  const handleAddCardLogo = async (file: File) => {
    setUploadingCardLogo(true);
    try {
      const { filename } = await uploadImage(file);
      createLogoMutation.mutate(filename);
    } catch {
      toast.error("No se pudo subir el logo");
    } finally {
      setUploadingCardLogo(false);
    }
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
              A cuántos días calendario desde el primer pago se enciende la banderita roja en Pedidos.
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

      <div className="p-6 border border-border rounded-lg bg-card">
        <h2 className="text-lg font-medium mb-1" style={{ fontFamily: "var(--font-display)" }}>Pago con tarjeta</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Logos que se muestran en el paso de pago con tarjeta del checkout. Los de ejemplo son insignias genéricas —
          reemplázalas por los logos reales de las marcas.
        </p>

        <div className="mb-6">
          <label className="text-sm text-muted-foreground mb-1 block">Logo de la pasarela ("Transacciones realizadas vía...")</label>
          <div className="flex items-center gap-3">
            {paymentGatewayLogo && (
              <img
                src={productImageUrl(paymentGatewayLogo)}
                alt="Logo de la pasarela"
                className="h-8 w-auto max-w-[140px] object-contain border border-border rounded bg-background p-1"
              />
            )}
            <label className="flex items-center gap-2 h-9 px-3 rounded-md border border-input text-sm cursor-pointer hover:bg-muted/50">
              {uploadingGatewayLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {paymentGatewayLogo ? "Cambiar" : "Subir"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadGatewayLogo(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">Se guarda junto con el resto de esta página, con el botón "Guardar" de arriba.</p>
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Logos de tarjetas aceptadas</label>
          <div className="flex flex-wrap items-center gap-3">
            {cardLogos.map((logo) => (
              <div key={logo.id} className="relative group">
                <img
                  src={productImageUrl(logo.image)}
                  alt="Logo de tarjeta"
                  className="h-8 w-auto max-w-[100px] object-contain border border-border rounded bg-background p-1"
                />
                <button
                  type="button"
                  onClick={() => deleteLogoMutation.mutate(logo.id)}
                  disabled={deleteLogoMutation.isPending}
                  aria-label="Eliminar logo"
                  className="absolute -top-2 -right-2 p-1 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            <label className="flex items-center gap-2 h-9 px-3 rounded-md border border-dashed border-input text-sm cursor-pointer hover:bg-muted/50">
              {uploadingCardLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Agregar logo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAddCardLogo(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;

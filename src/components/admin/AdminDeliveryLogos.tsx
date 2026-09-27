import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2 } from "lucide-react";
import { fetchDeliveryCornerLogos, updateDeliveryCornerLogo, uploadImage, DeliveryCornerLogo } from "@/lib/api";
import { productImageUrl } from "@/lib/images";
import { toast } from "sonner";

const DeliveryLogoCard = ({ logo }: { logo: DeliveryCornerLogo }) => {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const mutation = useMutation({
    mutationFn: (image: string) => updateDeliveryCornerLogo(logo.deliveryType, image),
    onSuccess: () => {
      toast.success("Guardado");
      queryClient.invalidateQueries({ queryKey: ["deliveryCornerLogos"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo guardar"),
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const { filename } = await uploadImage(file);
      mutation.mutate(filename);
    } catch {
      toast.error("No se pudo subir el logo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <p className="font-medium">{logo.deliveryType}</p>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-md border border-border bg-background flex items-center justify-center overflow-hidden shrink-0">
          {logo.image ? (
            <img src={productImageUrl(logo.image)} alt={logo.deliveryType} className="w-full h-full object-contain p-1" />
          ) : (
            <span className="text-xs text-muted-foreground text-center px-1">Sin logo</span>
          )}
        </div>
        <label className="flex items-center gap-2 h-9 px-3 rounded-md border border-input text-sm cursor-pointer hover:bg-muted/50">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {logo.image ? "Cambiar" : "Subir"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">Se guarda de inmediato al subirlo.</p>
    </div>
  );
};

// Mantenimiento fijo (no se agregan/quitan tipos de delivery acá, solo se
// sube/cambia el logo de cada uno) — mismo criterio que Vistas previas
// (route_meta): una tarjeta por fila fija, sin alta/baja.
const AdminDeliveryLogos = () => {
  const { data: logos = [], isLoading, isError } = useQuery({ queryKey: ["deliveryCornerLogos"], queryFn: fetchDeliveryCornerLogos });

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-6">
        Logo que se imprime en la esquina inferior izquierda de la etiqueta de envío, según el tipo de delivery del
        pedido (ej. el logo de la agencia, o el ícono de la moto).
      </p>
      {isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}
      {isError && <p className="text-sm text-destructive">No se pudo conectar con la API.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {logos.map((logo) => (
          <DeliveryLogoCard key={logo.deliveryType} logo={logo} />
        ))}
      </div>
    </div>
  );
};

export default AdminDeliveryLogos;

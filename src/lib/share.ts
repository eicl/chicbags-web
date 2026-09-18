import { toast } from "sonner";

// Usado tanto en el catálogo (ProductCard) como en el detalle de producto
// (ProductDetail) — el servidor le arma su propia vista previa (foto,
// título, descripción) a /producto/:id, ver el catch-all en server/index.js.
export const shareProductLink = async (productName: string, url: string) => {
  if (navigator.share) {
    try {
      await navigator.share({ title: productName, text: `Mira ${productName} en ChicBags`, url });
    } catch {
      // El usuario canceló el diálogo nativo de compartir — no es un error.
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado al portapapeles");
  } catch {
    toast.error("No se pudo copiar el link");
  }
};

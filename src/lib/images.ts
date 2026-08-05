const PRODUCT_IMAGES_PATH = "/product-images/";

/**
 * El backend solo guarda el nombre del archivo de cada imagen; esta función
 * arma la ruta real dentro de la carpeta public/product-images del frontend.
 */
export const productImageUrl = (filename?: string) => {
  if (!filename) return "";
  if (filename.startsWith("data:") || filename.startsWith("http") || filename.startsWith("/")) {
    return filename;
  }
  return `${PRODUCT_IMAGES_PATH}${filename}`;
};

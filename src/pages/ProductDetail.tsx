import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ShoppingBag, Truck, ShieldCheck } from "lucide-react";
import { useProducts } from "@/context/ProductContext";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import CartDrawer from "@/components/CartDrawer";
import Footer from "@/components/Footer";
import { toast } from "sonner";
import { productImageUrl } from "@/lib/images";
import { CART_ENABLED } from "@/lib/config";
import { sortColors } from "@/lib/colors";

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { products, isLoading, isError } = useProducts();
  const { addToCart } = useCart();

  const product = products.find((p) => p.id === Number(id));

  const [selectedColor, setSelectedColor] = useState(0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Cargando producto...</p>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 px-4">
        <h1 className="text-2xl font-medium" style={{ fontFamily: "var(--font-display)" }}>
          {isError ? "No se pudo cargar el producto" : "Producto no encontrado"}
        </h1>
        <Button onClick={() => navigate("/")} variant="outline" className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Volver a la tienda
        </Button>
      </div>
    );
  }

  const colors = sortColors(product.colors ?? []);
  const displayImage = colors[selectedColor]?.image ?? product.image;

  const handleAddToCart = () => {
    if (colors.length > 0 && colors[selectedColor]?.stock === 0) {
      toast.error("Ese color está agotado");
      return;
    }
    addToCart({
      ...product,
      image: displayImage,
    });
    toast.success("Agregado al carrito");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto px-4 md:px-8 py-8 md:py-12">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link to="/catalogo" className="hover:text-foreground transition-colors">Catálogo</Link>
          <span>/</span>
          <Link to="/catalogo" className="hover:text-foreground transition-colors">{product.category}</Link>
          <span>/</span>
          <span className="text-foreground">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
          {/* Galería */}
          <div>
            <div className="relative aspect-[4/5] overflow-hidden bg-muted rounded-sm mb-4">
              <AnimatePresence mode="wait">
                <motion.img
                  key={displayImage}
                  src={productImageUrl(displayImage)}
                  alt={`${product.name}${colors[selectedColor] ? " - " + colors[selectedColor].name : ""}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="w-full h-full object-cover"
                />
              </AnimatePresence>
            </div>

            {colors.length > 1 && (
              <div className="flex flex-wrap gap-3">
                {colors.map((color, index) => (
                  <button
                    key={color.name}
                    onClick={() => color.stock > 0 && setSelectedColor(index)}
                    disabled={color.stock === 0}
                    aria-label={`Ver color ${color.name}${color.stock === 0 ? " (agotado)" : ""}`}
                    aria-pressed={selectedColor === index}
                    title={color.stock === 0 ? `${color.name} - Agotado` : color.name}
                    className={`relative w-16 h-20 rounded-sm overflow-hidden border-2 transition-all ${
                      selectedColor === index ? "border-primary" : "border-border hover:border-muted-foreground/50"
                    } ${color.stock === 0 ? "cursor-not-allowed" : ""}`}
                  >
                    <img
                      src={productImageUrl(color.image)}
                      alt={color.name}
                      className={`w-full h-full object-cover ${color.stock === 0 ? "opacity-40 grayscale" : ""}`}
                    />
                    {color.stock === 0 && (
                      <span className="absolute inset-0 flex items-center justify-center bg-background/40">
                        <span className="text-[10px] font-medium tracking-wide uppercase text-foreground bg-background/90 px-1.5 py-0.5 rounded-sm -rotate-12">
                          Agotado
                        </span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {((product.photos?.length ?? 0) > 0 || (product.videos?.length ?? 0) > 0) && (
              <div className="mt-6 pt-6 border-t border-border">
                <p className="text-sm font-medium mb-3">Más fotos y videos</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {product.photos?.map((photo, index) => (
                    <img
                      key={photo}
                      src={productImageUrl(photo)}
                      alt={`${product.name} - foto ${index + 1}`}
                      className="w-full aspect-square object-cover rounded-sm bg-muted"
                    />
                  ))}
                  {product.videos?.map((video, index) => (
                    <video
                      key={video}
                      src={productImageUrl(video)}
                      controls
                      className="w-full aspect-square object-cover rounded-sm bg-muted"
                      aria-label={`${product.name} - video ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs tracking-widest uppercase text-muted-foreground">{product.category}</p>
              {product.code && <p className="text-xs text-muted-foreground">Código: {product.code}</p>}
            </div>
            {product.brand && <p className="text-sm text-primary font-medium mb-1">{product.brand}</p>}
            <h1 className="text-3xl md:text-4xl font-medium mb-3" style={{ fontFamily: "var(--font-display)" }}>
              {product.name}
            </h1>
            <p className="text-2xl font-medium text-foreground mb-6">S/.{product.price.toFixed(2)}</p>
            <p className="text-muted-foreground leading-relaxed mb-8">{product.description}</p>

            {colors.length > 0 && (
              <div className="mb-8">
                <p className="text-sm font-medium mb-3">
                  Color: <span className="text-muted-foreground font-normal">{colors[selectedColor]?.name}</span>
                  {colors[selectedColor] && colors[selectedColor].stock > 0 && (
                    <span className="text-muted-foreground font-normal"> · {colors[selectedColor].stock} disponibles</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-3">
                  {colors.map((color, index) => (
                    <button
                      key={color.name}
                      onClick={() => color.stock > 0 && setSelectedColor(index)}
                      disabled={color.stock === 0}
                      aria-label={`${color.name}${color.stock === 0 ? " (agotado)" : ""}`}
                      aria-pressed={selectedColor === index}
                      title={color.stock === 0 ? `${color.name} - Agotado` : color.name}
                      className={`relative w-8 h-8 rounded-full border-2 transition-all ${
                        selectedColor === index ? "border-primary scale-110" : "border-border hover:scale-105"
                      } ${color.stock === 0 ? "cursor-not-allowed opacity-50" : ""}`}
                      style={{ backgroundColor: color.hex }}
                    >
                      {color.stock === 0 && (
                        <span
                          aria-hidden
                          className="absolute inset-0 rounded-full"
                          style={{ background: `linear-gradient(to top right, transparent 46%, currentColor 48%, currentColor 52%, transparent 54%)`, color: "var(--destructive)" }}
                        />
                      )}
                    </button>
                  ))}
                </div>
                {colors.some((c) => c.stock === 0) && (
                  <p className="text-xs text-muted-foreground mt-2">Algunos colores están agotados temporalmente.</p>
                )}
              </div>
            )}

            <div className="mb-8">
              <Button
                onClick={handleAddToCart}
                disabled={!CART_ENABLED}
                className="w-full py-6 text-sm tracking-widest uppercase gap-2"
              >
                <ShoppingBag className="w-4 h-4" /> Agregar al carrito
              </Button>
              {!CART_ENABLED && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  La compra en línea estará disponible próximamente.
                </p>
              )}
            </div>

            <div className="space-y-4 border-t border-border pt-6">
              <div className="flex items-start gap-3 text-sm text-muted-foreground">
                <Truck className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Envío en 24h dentro de Lima Metropolitana. Envío gratis en compras mayores a S/ 500.</span>
              </div>
              <div className="flex items-start gap-3 text-sm text-muted-foreground">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Producto 100% original y verificado.</span>
              </div>
            </div>
          </div>
        </div>
        {product.extraDescription?.trim() && (
          <div className="mt-12 lg:mt-16 pt-8 border-t border-border max-w-3xl">
            <h2 className="text-xl font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>
              Más sobre este producto
            </h2>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              {product.extraDescription
                .split(/\n+/)
                .map((paragraph) => paragraph.trim())
                .filter(Boolean)
                .map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
            </div>
          </div>
        )}
      </div>

      <CartDrawer />
      <Footer />
    </div>
  );
};

export default ProductDetail;

import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Maximize2, Play, ShoppingBag, Truck, ShieldCheck, X } from "lucide-react";
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
  // Cuando se hace click en una foto o video adicional, se muestra en el
  // visor grande de arriba (igual que al elegir un color) hasta que se
  // vuelva a elegir un color, que retoma la foto de ese color.
  const [mediaOverride, setMediaOverride] = useState<{ kind: "photo" | "video"; index: number } | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const handleSelectColor = (index: number) => {
    setSelectedColor(index);
    setMediaOverride(null);
  };

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen]);

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

  // Los agotados quedan al final (orden estable, así que dentro de cada
  // grupo — disponibles / agotados — se respeta el orden configurado).
  const colors = sortColors(product.colors ?? []).sort((a, b) => Number(a.stock === 0) - Number(b.stock === 0));
  const displayImage = colors[selectedColor]?.image ?? product.image;
  const photos = product.photos ?? [];
  const videos = product.videos ?? [];

  const activeVideo = mediaOverride?.kind === "video" ? videos[mediaOverride.index] : undefined;
  const activePhoto = mediaOverride?.kind === "photo" ? photos[mediaOverride.index] : undefined;
  const mainMediaSrc = activeVideo ?? activePhoto ?? displayImage;
  const showAvailabilityBadge = !mediaOverride && colors.length > 0;
  const isAvailable = colors[selectedColor]?.stock !== 0;

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
          <Link to="/catalogo" className="hover:text-foreground transition-colors">{product.categories.join(", ")}</Link>
          <span>/</span>
          <span className="text-foreground">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
          {/* Galería */}
          <div>
            <div className="relative aspect-[4/5] overflow-hidden bg-muted rounded-sm mb-4">
              <AnimatePresence mode="wait">
                {activeVideo ? (
                  <motion.video
                    key={activeVideo}
                    src={productImageUrl(activeVideo)}
                    controls
                    autoPlay
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <motion.img
                    key={mainMediaSrc}
                    src={productImageUrl(mainMediaSrc)}
                    alt={activePhoto ? product.name : `${product.name}${colors[selectedColor] ? " - " + colors[selectedColor].name : ""}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="w-full h-full object-cover"
                  />
                )}
              </AnimatePresence>
              {showAvailabilityBadge && (
                <span
                  className={`absolute top-3 right-3 z-10 text-[10px] font-medium tracking-widest uppercase px-2.5 py-1 rounded-sm ${
                    isAvailable ? "bg-emerald-600 text-white" : "bg-destructive text-destructive-foreground"
                  }`}
                >
                  {isAvailable ? "Disponible" : "Agotado"}
                </span>
              )}
              {!activeVideo && (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="absolute bottom-3 right-3 p-2 rounded-full bg-background/80 text-foreground hover:bg-background transition-colors shadow-sm"
                  aria-label="Ver foto más grande"
                  title="Ver foto más grande"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {(colors.length > 1 || photos.length > 0 || videos.length > 0) && (
              <div className="flex flex-wrap gap-3">
                {colors.length > 1 &&
                  colors.map((color, index) => (
                    <button
                      key={color.name}
                      onClick={() => color.stock > 0 && handleSelectColor(index)}
                      disabled={color.stock === 0}
                      aria-label={`Ver color ${color.name}${color.stock === 0 ? " (agotado)" : ""}`}
                      aria-pressed={!mediaOverride && selectedColor === index}
                      title={color.stock === 0 ? `${color.name} - Agotado` : color.name}
                      className={`relative w-16 h-20 rounded-sm overflow-hidden border-2 transition-all ${
                        !mediaOverride && selectedColor === index ? "border-primary" : "border-border hover:border-muted-foreground/50"
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
                {photos.map((photo, index) => (
                  <button
                    key={photo}
                    onClick={() => setMediaOverride({ kind: "photo", index })}
                    aria-label={`Ver foto ${index + 1} de ${product.name}`}
                    aria-pressed={mediaOverride?.kind === "photo" && mediaOverride.index === index}
                    className={`relative w-16 h-20 rounded-sm overflow-hidden border-2 transition-all ${
                      mediaOverride?.kind === "photo" && mediaOverride.index === index
                        ? "border-primary"
                        : "border-border hover:border-muted-foreground/50"
                    }`}
                  >
                    <img src={productImageUrl(photo)} alt={`${product.name} - foto ${index + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
                {videos.map((video, index) => (
                  <button
                    key={video}
                    onClick={() => setMediaOverride({ kind: "video", index })}
                    aria-label={`Ver video ${index + 1} de ${product.name}`}
                    aria-pressed={mediaOverride?.kind === "video" && mediaOverride.index === index}
                    className={`relative w-16 h-20 rounded-sm overflow-hidden border-2 transition-all ${
                      mediaOverride?.kind === "video" && mediaOverride.index === index
                        ? "border-primary"
                        : "border-border hover:border-muted-foreground/50"
                    }`}
                  >
                    <video src={productImageUrl(video)} muted className="w-full h-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-background/30">
                      <Play className="w-5 h-5 text-white drop-shadow" fill="white" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs tracking-widest uppercase text-muted-foreground">{product.categories.join(", ")}</p>
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
                    <span className="text-muted-foreground font-normal"> · Disponible</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-3">
                  {colors.map((color, index) => (
                    <button
                      key={color.name}
                      onClick={() => color.stock > 0 && handleSelectColor(index)}
                      disabled={color.stock === 0}
                      aria-label={`${color.name}${color.stock === 0 ? " (agotado)" : ""}`}
                      aria-pressed={!mediaOverride && selectedColor === index}
                      title={color.stock === 0 ? `${color.name} - Agotado` : color.name}
                      className={`relative w-8 h-8 rounded-full border-2 transition-all ${
                        !mediaOverride && selectedColor === index ? "border-primary scale-110" : "border-border hover:scale-105"
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

      <AnimatePresence>
        {lightboxOpen && !activeVideo && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/80 z-50"
              onClick={() => setLightboxOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-4 md:inset-12 z-50 flex items-center justify-center pointer-events-none"
            >
              <img
                src={productImageUrl(mainMediaSrc)}
                alt={activePhoto ? product.name : `${product.name}${colors[selectedColor] ? " - " + colors[selectedColor].name : ""}`}
                className="max-w-full max-h-full object-contain pointer-events-auto"
              />
            </motion.div>
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="fixed top-4 right-4 md:top-6 md:right-6 z-50 p-2 rounded-full bg-background/90 text-foreground hover:bg-background transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </>
        )}
      </AnimatePresence>

      <CartDrawer />
      <Footer />
    </div>
  );
};

export default ProductDetail;

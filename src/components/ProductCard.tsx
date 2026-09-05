import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { Product, ProductColor, useCart } from "@/context/CartContext";
import { productImageUrl } from "@/lib/images";
import { CART_ENABLED } from "@/lib/config";
import { sortColors } from "@/lib/colors";

// Si el primer color (el que se mostraría por defecto) está agotado, elige
// al azar la foto de otro color que sí tenga stock, para no mostrar en el
// catálogo principal un color que no se puede comprar. Si todos están
// agotados, no hay de otra: se queda en el primero.
const pickDefaultColorIndex = (colors: ProductColor[]) => {
  if (colors.length === 0 || colors[0].stock > 0) return 0;
  const inStock = colors.map((_, index) => index).filter((index) => colors[index].stock > 0);
  if (inStock.length === 0) return 0;
  return inStock[Math.floor(Math.random() * inStock.length)];
};

const ProductCard = ({ product, isNew = false }: { product: Product; isNew?: boolean }) => {
  const { addToCart } = useCart();
  const colors = sortColors(product.colors ?? []);
  const [selectedColor, setSelectedColor] = useState(() => pickDefaultColorIndex(colors));
  const [hoveredColor, setHoveredColor] = useState<number | null>(null);

  const activeColor = hoveredColor ?? selectedColor;
  const displayImage = colors[activeColor]?.image ?? product.image;
  const activeStock = colors[activeColor]?.stock;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5 }}
      className="group bg-card rounded-lg border border-border shadow-sm overflow-hidden"
    >
      <Link to={`/producto/${product.id}`}>
        <div className="relative aspect-[4/5] overflow-hidden bg-muted">
          {isNew && (
            <span className="absolute top-3 left-3 z-10 bg-primary text-primary-foreground text-[10px] font-medium tracking-widest uppercase px-2.5 py-1 rounded-sm">
              Nuevo
            </span>
          )}
          {colors.length > 0 && (
            <span
              className={`absolute top-3 right-3 z-10 text-[10px] font-medium tracking-widest uppercase px-2.5 py-1 rounded-sm ${
                activeStock === 0 ? "bg-destructive text-destructive-foreground" : "bg-emerald-600 text-white"
              }`}
            >
              {activeStock === 0 ? "Agotado" : "Disponible"}
            </span>
          )}
          <img
            src={productImageUrl(displayImage)}
            alt={`${product.name}${colors[activeColor] ? " - " + colors[activeColor].name : ""}`}
            loading="lazy"
            width={640}
            height={800}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          />
          {colors[selectedColor]?.stock !== 0 && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!CART_ENABLED) return;
                addToCart({ ...product, image: colors[selectedColor]?.image ?? product.image });
              }}
              disabled={!CART_ENABLED}
              className={`absolute bottom-4 right-4 bg-foreground text-background p-3 rounded-full opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 ${
                CART_ENABLED ? "hover:bg-primary" : "cursor-not-allowed opacity-0 group-hover:opacity-60"
              }`}
              aria-label={CART_ENABLED ? `Agregar ${product.name} al carrito` : "Compra no disponible por el momento"}
              title={CART_ENABLED ? undefined : "Compra no disponible por el momento"}
            >
              <Plus className="w-4 h-4" />
            </button>
          )}

          {colors[activeColor] && (
            <span className="absolute bottom-3 left-3 z-10 bg-background/85 backdrop-blur-sm text-foreground text-[10px] font-medium tracking-widest uppercase px-2.5 py-1 rounded-sm">
              {colors[activeColor].name}
            </span>
          )}

          {colors.length > 1 && (
            <div className="absolute bottom-11 left-4 flex gap-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
              {colors.map((color, index) => (
                <button
                  key={color.name}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedColor(index);
                  }}
                  onMouseEnter={() => setHoveredColor(index)}
                  onMouseLeave={() => setHoveredColor(null)}
                  aria-label={`Ver color ${color.name}${color.stock === 0 ? " (agotado)" : ""}`}
                  aria-pressed={selectedColor === index}
                  title={color.stock === 0 ? `${color.name} - Agotado` : color.name}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${
                    selectedColor === index
                      ? "border-primary scale-110"
                      : "border-background/70 hover:scale-105"
                  } ${color.stock === 0 ? "opacity-40" : ""}`}
                  style={{ backgroundColor: color.hex }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs tracking-widest uppercase text-muted-foreground">{product.categories.join(", ")}</p>
            {product.code && <p className="text-xs text-muted-foreground">{product.code}</p>}
          </div>
          {product.brand && <p className="text-xs text-primary font-medium mb-0.5">{product.brand}</p>}
          <h3 className="font-medium text-foreground mb-1" style={{ fontFamily: "var(--font-display)" }}>{product.name}</h3>
          <p className="text-sm text-muted-foreground mb-2">{product.description}</p>
          <div className="flex items-center justify-between">
            <p className="text-foreground font-medium">S/.{product.price.toFixed(2)}</p>
            {colors[selectedColor] && (
              <p className="text-xs text-muted-foreground">{colors[selectedColor].name}</p>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

export default ProductCard;

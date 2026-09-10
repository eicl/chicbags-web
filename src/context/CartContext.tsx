import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface ProductColor {
  name: string;
  hex: string;
  image: string;
  stock: number;
  order?: number;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  image: string;
  categories: string[];
  description: string;
  colors?: ProductColor[];
  code?: string;
  brand?: string;
  photos?: string[];
  videos?: string[];
  extraDescription?: string;
  sortOrder?: number;
  cost?: number | null;
  // Oculta el producto del catálogo público y su página de detalle sin
  // borrarlo — sigue existiendo para pedidos ya hechos y se le puede
  // seguir vendiendo a mano desde el panel admin.
  visible: boolean;
}

export interface CartItem extends Product {
  quantity: number;
  // Color elegido al agregar (vacío si el producto no tiene colores) — el
  // pedido real exige un color por ítem, así que dos colores del mismo
  // producto deben ser líneas distintas, no una sola cantidad sumada.
  colorName: string;
  colorStock: number;
}

// Identidad de una línea del carrito: mismo patrón que lineKey() en
// OrderRegister.tsx, para que dos colores del mismo producto no colisionen.
export const cartLineKey = (id: number, colorName: string) => `${id}::${colorName}`;

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, colorName?: string, colorStock?: number) => void;
  removeFromCart: (id: number, colorName: string) => void;
  updateQuantity: (id: number, colorName: string, quantity: number) => void;
  clearCart: () => void;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

// Para que el carrito sobreviva a un refresh de página — se guarda en
// localStorage (por navegador/dispositivo, no por cuenta: igual que la
// mayoría de tiendas, se arma antes de necesitar sesión).
const CART_STORAGE_KEY = "chicbags_cart";

const loadStoredCart = (): CartItem[] => {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>(loadStoredCart);
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // localStorage lleno o no disponible (ej. modo incógnito estricto) —
      // el carrito sigue funcionando en memoria, solo no persiste.
    }
  }, [items]);

  const addToCart = (product: Product, colorName = "", colorStock = Infinity) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.id === product.id && item.colorName === colorName);
      if (existing) {
        if (existing.quantity >= existing.colorStock) return prev;
        return prev.map((item) =>
          item.id === product.id && item.colorName === colorName ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, colorName, colorStock, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (id: number, colorName: string) => {
    setItems((prev) => prev.filter((item) => !(item.id === id && item.colorName === colorName)));
  };

  const updateQuantity = (id: number, colorName: string, quantity: number) => {
    if (quantity <= 0) return removeFromCart(id, colorName);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id && item.colorName === colorName ? { ...item, quantity: Math.min(quantity, item.colorStock) } : item
      )
    );
  };

  const clearCart = () => setItems([]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addToCart, removeFromCart, updateQuantity, clearCart, isCartOpen, setIsCartOpen, totalItems, totalPrice }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
};

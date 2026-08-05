import { useState } from "react";
import { ShoppingBag, Menu, X, Search, User, Truck, Lock, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { useCart } from "@/context/CartContext";
import { motion, AnimatePresence } from "framer-motion";

const NAV_LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/catalogo", label: "Catálogo" },
  { href: "/#nosotros", label: "Nosotros" },
  { href: "/#contacto", label: "Contacto" },
];

const TOPBAR_ITEMS = [
  { icon: Truck, label: "Envíos a todo Perú" },
  { icon: Lock, label: "Pago seguro: Yape, Plin, Tarjetas y más" },
  { icon: Star, label: "Calidad garantizada" },
];

const isRouteLink = (href: string) => href === "/" || href === "/catalogo";

const Header = () => {
  const { totalItems, setIsCartOpen } = useCart();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="hidden md:flex items-center justify-center divide-x divide-border bg-muted py-2 text-xs text-muted-foreground">
        {TOPBAR_ITEMS.map(({ icon: Icon, label }) => (
          <span key={label} className="flex items-center gap-2 px-6">
            <Icon className="w-3.5 h-3.5 text-primary" />
            {label}
          </span>
        ))}
      </div>

      <div className="container mx-auto flex items-center justify-between py-4 px-4 md:px-8">
        <h1 className="flex items-center gap-2 text-2xl md:text-3xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          <img src="/chicBags.jpeg" alt="ChicBags" className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover" />
          ChicBags
        </h1>
        <nav className="hidden md:flex gap-8 text-sm tracking-widest uppercase text-muted-foreground">
          {NAV_LINKS.map((link) =>
            isRouteLink(link.href) ? (
              <Link key={link.href} to={link.href} className="hover:text-primary transition-colors">
                {link.label}
              </Link>
            ) : (
              <a key={link.href} href={link.href} className="hover:text-primary transition-colors">
                {link.label}
              </a>
            )
          )}
        </nav>
        <div className="flex items-center gap-1">
          <button
            className="hidden sm:inline-flex p-2 hover:bg-muted rounded-full transition-colors"
            aria-label="Buscar"
          >
            <Search className="w-5 h-5 text-foreground" />
          </button>
          <button
            className="hidden sm:inline-flex p-2 hover:bg-muted rounded-full transition-colors"
            aria-label="Mi cuenta"
          >
            <User className="w-5 h-5 text-foreground" />
          </button>
          <button
            onClick={() => setIsCartOpen(true)}
            className="relative p-2 hover:bg-muted rounded-full transition-colors"
            aria-label="Abrir carrito"
          >
            <ShoppingBag className="w-5 h-5 text-foreground" />
            <AnimatePresence>
              {totalItems > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center font-medium"
                >
                  {totalItems}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <button
            onClick={() => setIsMenuOpen((open) => !open)}
            className="md:hidden p-2 hover:bg-muted rounded-full transition-colors"
            aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={isMenuOpen}
          >
            {isMenuOpen ? <X className="w-5 h-5 text-foreground" /> : <Menu className="w-5 h-5 text-foreground" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden overflow-hidden border-t border-border"
          >
            <div className="flex flex-col px-4 py-2">
              {NAV_LINKS.map((link) =>
                isRouteLink(link.href) ? (
                  <Link
                    key={link.href}
                    to={link.href}
                    onClick={() => setIsMenuOpen(false)}
                    className="py-3 text-sm tracking-widest uppercase text-muted-foreground hover:text-primary transition-colors border-b border-border last:border-0"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMenuOpen(false)}
                    className="py-3 text-sm tracking-widest uppercase text-muted-foreground hover:text-primary transition-colors border-b border-border last:border-0"
                  >
                    {link.label}
                  </a>
                )
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;

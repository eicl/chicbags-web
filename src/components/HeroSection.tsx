import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const MotionLink = motion(Link);

const HeroSection = () => (
  <section className="bg-muted/60 overflow-hidden">
    <div className="container mx-auto px-4 md:px-8 py-16 md:py-24 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
      <div className="text-center md:text-left">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-xs md:text-sm tracking-[0.3em] uppercase mb-4 text-primary font-medium"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Nueva colección 2026
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-3xl md:text-5xl font-medium text-foreground leading-tight mb-6"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Bellas por naturaleza, elegantes por elección.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="text-muted-foreground max-w-md mx-auto md:mx-0 mb-8"
        >
          Tu tienda de confianza. Encuentra el accesorio perfecto para cualquier ocasión.
        </motion.p>
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
          <MotionLink
            to="/catalogo"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="px-8 py-3 rounded-sm bg-primary text-primary-foreground text-sm tracking-widest uppercase hover:bg-primary/90 transition-colors"
          >
            Comprar ahora
          </MotionLink>
          <MotionLink
            to="/catalogo"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="px-8 py-3 rounded-sm border border-foreground/20 text-foreground text-sm tracking-widest uppercase hover:bg-foreground hover:text-background transition-colors"
          >
            Ver catálogo
          </MotionLink>
        </div>
        <div className="flex items-center justify-center md:justify-start gap-2 mt-10" aria-hidden="true">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <span className="w-2 h-2 rounded-full bg-border" />
          <span className="w-2 h-2 rounded-full bg-border" />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="relative aspect-[4/5] md:aspect-square rounded-2xl overflow-hidden shadow-xl"
      >
        <img
          src="/portada1.png"
          alt="Colección de carteras ChicBags"
          className="w-full h-full object-cover"
        />
      </motion.div>
    </div>
  </section>
);

export default HeroSection;

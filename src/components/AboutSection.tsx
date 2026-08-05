import { motion } from "framer-motion";

const AboutSection = () => {
  return (
    <section id="nosotros" className="container mx-auto px-4 md:px-8 py-16 md:py-24">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xs tracking-widest uppercase text-muted-foreground mb-3">Sobre nosotros</p>
          <h2 className="text-3xl md:text-4xl font-medium mb-6" style={{ fontFamily: "var(--font-display)" }}>
            ChicBags
          </h2>
          <div className="space-y-4 text-muted-foreground leading-relaxed">
            <p>
              En ChicBags creemos que una cartera es mucho más que un accesorio: es el complemento que refleja tu estilo y personalidad.
            </p>
            <p>
              Nos dedicamos a seleccionar carteras, bolsos y accesorios modernos, elegantes y de excelente calidad para acompañarte en cada ocasión. Trabajamos con proveedores cuidadosamente elegidos para ofrecer productos que combinan diseño, durabilidad y precios accesibles.
            </p>
            <p>
              Nuestra misión es brindarte una experiencia de compra segura, con atención personalizada, envíos rápidos a todo el Perú y la confianza de recibir exactamente lo que esperas.
            </p>
            <p>
              En ChicBags queremos que cada mujer encuentre la cartera perfecta para expresar su esencia con elegancia y estilo.
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-2 gap-6"
        >
          {[
            { value: "500+", label: "Carteras vendidas" },
            { value: "100%", label: "Autenticidad" },
            { value: "24h", label: "Envío rápido" },
            { value: "4.9★", label: "Valoración" },
          ].map((stat) => (
            <div key={stat.label} className="border border-border rounded-lg p-6 text-center bg-card">
              <p className="text-2xl md:text-3xl font-semibold text-foreground mb-1" style={{ fontFamily: "var(--font-display)" }}>
                {stat.value}
              </p>
              <p className="text-xs tracking-widest uppercase text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default AboutSection;

import { Truck, Lock, ShieldCheck } from "lucide-react";

const ITEMS = [
  { icon: Truck, title: "Envíos a todo Perú", subtitle: "Rápidos y seguros" },
  { icon: Lock, title: "Pago seguro", subtitle: "Yape, Plin, Tarjetas y más" },
  { icon: ShieldCheck, title: "Calidad garantizada", subtitle: "Productos 100% originales" },
];

const TrustBar = () => (
  <section className="bg-card border-y border-border">
    <div className="container mx-auto px-4 md:px-8 py-8 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
      {ITEMS.map(({ icon: Icon, title, subtitle }) => (
        <div key={title} className="flex items-center justify-center gap-3 py-4 sm:py-0">
          <Icon className="w-6 h-6 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      ))}
    </div>
  </section>
);

export default TrustBar;

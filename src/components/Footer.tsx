import { Link } from "react-router-dom";
import { Headphones, RefreshCw, ShieldCheck, MessageCircle, Music2 } from "lucide-react";

const SUPPORT_ITEMS = [
  { icon: Headphones, title: "Atención personalizada", subtitle: "Te ayudamos en lo que necesites" },
  { icon: RefreshCw, title: "Cambios y devoluciones", subtitle: "Fáciles y sin complicaciones" },
  { icon: ShieldCheck, title: "Compra 100% segura", subtitle: "Tus datos siempre protegidos" },
];

const iconProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg {...iconProps} className={className}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg {...iconProps} className={className}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

const SOCIAL_LINKS = [
  { label: "Instagram", href: "https://instagram.com", Icon: InstagramIcon },
  { label: "Facebook", href: "https://facebook.com", Icon: FacebookIcon },
  { label: "TikTok", href: "https://tiktok.com", Icon: Music2 },
  { label: "WhatsApp", href: "https://wa.me/51914104629", Icon: MessageCircle },
];

const Footer = () => (
  <footer className="border-t border-border bg-card">
    <div className="container mx-auto px-4 md:px-8 py-8 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border border-b border-border">
      {SUPPORT_ITEMS.map(({ icon: Icon, title, subtitle }) => (
        <div key={title} className="flex items-center justify-center gap-3 py-4 sm:py-0">
          <Icon className="w-5 h-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      ))}
    </div>

    <div className="container mx-auto px-4 md:px-8 py-12 md:py-16">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <h3 className="text-xl font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>ChicBags</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Tu tienda de confianza.
          </p>
        </div>
        <div>
          <h4 className="text-sm tracking-widest uppercase mb-4 text-muted-foreground">Navegación</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/catalogo" className="text-foreground hover:text-primary transition-colors">Catálogo</Link></li>
            <li><a href="/#nosotros" className="text-foreground hover:text-primary transition-colors">Nosotros</a></li>
            <li><a href="/#contacto" className="text-foreground hover:text-primary transition-colors">Contacto</a></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm tracking-widest uppercase mb-4 text-muted-foreground">Contacto</h4>
          <ul className="space-y-2 text-sm text-foreground">
            <li>edwinceslev@gmail.com</li>
            <li>+51 914104629</li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm tracking-widest uppercase mb-4 text-muted-foreground">Síguenos</h4>
          <div className="flex gap-3">
            {SOCIAL_LINKS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="w-9 h-9 flex items-center justify-center rounded-full border border-border text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
              >
                <Icon className="w-[18px] h-[18px]" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>

    <div className="bg-foreground text-background text-center text-xs py-4">
      © 2026 ChicBags. Todos los derechos reservados.
    </div>
  </footer>
);

export default Footer;

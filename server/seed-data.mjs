import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const IMAGES_DIR = path.join(__dirname, "..", "public", "product-images");

const PALETTE = {
  Blanco: { hex: "#efefef", fg: "#222222" },
  Negro: { hex: "#161616", fg: "#eeeeee" },
  Rojo: { hex: "#a4231c", fg: "#ffffff" },
  "Azul Marino": { hex: "#1b2a4a", fg: "#ffffff" },
  Verde: { hex: "#31502f", fg: "#ffffff" },
  Gris: { hex: "#6b6b6b", fg: "#ffffff" },
  Beige: { hex: "#cdbfa5", fg: "#222222" },
  Dorado: { hex: "#9c7a2d", fg: "#ffffff" },
};

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

const slugify = (value) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// Genera un archivo de imagen real dentro de public/product-images y
// devuelve solo el nombre de archivo (el backend nunca guarda la ruta completa).
const writePlaceholderFile = (productId, label, bg, fg) => {
  const width = 640;
  const height = 800;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="${bg}"/>
    <text x="50%" y="50%" fill="${fg}" font-family="sans-serif" font-size="${Math.round(width / 14)}" text-anchor="middle" dominant-baseline="middle">${label}</text>
  </svg>`;
  const filename = `${productId}-${slugify(label)}.svg`;
  writeFileSync(path.join(IMAGES_DIR, filename), svg);
  return filename;
};

const out = (name) => ({ name, stock: 0 });

const makeColors = (productId, label, specs) =>
  specs.map((spec) => {
    const name = typeof spec === "string" ? spec : spec.name;
    const stock = typeof spec === "string" ? 12 : spec.stock;
    const { hex, fg } = PALETTE[name];
    const filename = writePlaceholderFile(productId, `${label} ${name}`, hex, fg);
    return { name, hex, stock, image: filename };
  });

const makeProduct = (id, name, price, category, description, colorSpecs) => {
  const colors = makeColors(id, name, colorSpecs);
  const defaultImage = colors.find((c) => c.stock > 0)?.image ?? colors[0].image;
  return { id, name, price, category, description, image: defaultImage, colors };
};

// Construye la lista de productos y, como efecto secundario, (re)genera los
// archivos de imagen placeholder en disco. Se puede llamar siempre de forma
// segura: sobrescribe los SVG existentes con el mismo contenido.
export const buildProducts = () => {
  mkdirSync(IMAGES_DIR, { recursive: true });
  return [
    // Nike
    makeProduct(1, "Nike Air Force 1 White", 380, "Nike", "El clásico inmortal. Blanco total, combina con todo.", ["Blanco", "Negro", "Gris", "Azul Marino", "Beige", out("Rojo")]),
    makeProduct(6, "Nike Blazer Mid 77", 420, "Nike", "Estilo retro basketball. Blanco con swoosh negro, look vintage.", ["Blanco", "Negro", "Gris", "Verde", "Beige", out("Dorado")]),
    makeProduct(9, "Nike Dunk Low Panda", 450, "Nike", "El modelo más buscado. Blanco y negro, diseño icónico.", ["Negro", "Blanco", "Gris", "Azul Marino", "Rojo", out("Verde")]),
    makeProduct(15, "Nike Air Max 90 Red", 480, "Nike", "Amortiguación Air visible. Blanco con rojo, estilo deportivo retro.", ["Rojo", "Blanco", "Negro", "Gris", "Azul Marino", out("Dorado")]),

    // Adidas
    makeProduct(4, "Adidas Stan Smith Green", 350, "Adidas", "Elegancia minimalista. Blanco con talón verde, un clásico atemporal.", ["Verde", "Blanco", "Azul Marino", "Negro", "Beige", out("Rojo")]),
    makeProduct(8, "Adidas Samba OG", 400, "Adidas", "Herencia futbolera. Blanco con rayas negras y suela de goma.", ["Blanco", "Negro", "Gris", "Beige", "Azul Marino", out("Rojo")]),
    makeProduct(12, "Adidas Superstar", 370, "Adidas", "La concha dorada. Blanco con rayas negras, leyenda del hip-hop.", ["Blanco", "Negro", "Dorado", "Gris", "Azul Marino", out("Rojo")]),
    makeProduct(18, "Adidas Gazelle Navy", 360, "Adidas", "Gamuza azul marino con rayas blancas. Estilo europeo clásico.", ["Azul Marino", "Beige", "Negro", "Blanco", "Verde", out("Gris")]),

    // Converse
    makeProduct(2, "Converse Chuck Taylor High", 250, "Converse", "El ícono del streetwear desde 1917. Negro con suela blanca.", ["Negro", "Blanco", "Rojo", "Beige", "Azul Marino", out("Verde")]),
    makeProduct(10, "Converse One Star Black", 270, "Converse", "Gamuza negra con estrella. Estilo punk y skate desde los 70s.", ["Negro", "Beige", "Blanco", "Gris", "Rojo", out("Dorado")]),
    makeProduct(16, "Converse Run Star Hike", 320, "Converse", "Plataforma moderna. Blanco total con suela elevada, look audaz.", ["Blanco", "Negro", "Gris", "Rojo", "Beige", out("Azul Marino")]),

    // Vans
    makeProduct(3, "Vans Old Skool Black", 280, "Vans", "La silueta skater por excelencia. Negro con franja blanca.", ["Negro", "Blanco", "Azul Marino", "Gris", "Beige", out("Rojo")]),
    makeProduct(11, "Vans Sk8-Hi Black", 310, "Vans", "Caña alta legendaria. Negro con franja blanca, protección de tobillo.", ["Negro", "Gris", "Blanco", "Azul Marino", "Beige", out("Verde")]),
    makeProduct(17, "Vans Authentic Red", 240, "Vans", "Canvas rojo clásico. Simple, ligero y con onda californiana.", ["Rojo", "Beige", "Negro", "Blanco", "Gris", out("Azul Marino")]),

    // Puma
    makeProduct(5, "Puma Suede Classic Navy", 320, "Puma", "Gamuza azul marino premium. Estilo urbano desde los 60s.", ["Azul Marino", "Negro", "Rojo", "Blanco", "Gris", out("Beige")]),
    makeProduct(13, "Puma RS-X White Blue", 390, "Puma", "Tecnología running retro. Blanco y azul, suela chunky futurista.", ["Blanco", "Azul Marino", "Negro", "Gris", "Rojo", out("Verde")]),
    makeProduct(19, "Puma Cali White", 340, "Puma", "Plataforma elegante. Blanco con detalles negros, inspiración californiana.", ["Blanco", "Negro", "Beige", "Gris", "Azul Marino", out("Rojo")]),

    // Reebok
    makeProduct(7, "Reebok Classic Leather", 300, "Reebok", "Cuero blanco total. Comodidad y estilo minimalista.", ["Blanco", "Beige", "Negro", "Gris", "Azul Marino", out("Verde")]),
    makeProduct(14, "Reebok Club C 85", 290, "Reebok", "Silueta limpia de los 80s. Blanco vintage, elegancia tennis.", ["Blanco", "Verde", "Negro", "Beige", "Gris", out("Rojo")]),
    makeProduct(20, "Reebok Nano X3", 360, "Reebok", "Entrenamiento funcional. Blanco y negro, máximo rendimiento.", ["Negro", "Gris", "Rojo", "Blanco", "Azul Marino", out("Beige")]),
  ];
};

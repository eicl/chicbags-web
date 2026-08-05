import { useRef, useState } from "react";
import { useProducts } from "@/context/ProductContext";
import { Product, ProductColor } from "@/context/CartContext";
import { Plus, Pencil, Trash2, ArrowLeft, Save, X, Upload, Loader2, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { uploadImage } from "@/lib/api";
import { productImageUrl } from "@/lib/images";

const emptyForm = { name: "", price: 0, category: "", description: "" };
const emptyColor: ProductColor = { name: "", hex: "#161616", image: "", stock: 0 };

const Admin = () => {
  const { products, addProduct, updateProduct, deleteProduct, isLoading, isError } = useProducts();
  const { user, logout } = useAuth();
  const [editing, setEditing] = useState<Product | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [colors, setColors] = useState<ProductColor[]>([]);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const handleEdit = (product: Product) => {
    setEditing(product);
    setForm({ name: product.name, price: product.price, category: product.category, description: product.description });
    setColors(product.colors ?? []);
    setIsAdding(false);
  };

  const handleAdd = () => {
    setIsAdding(true);
    setEditing(null);
    setForm(emptyForm);
    setColors([{ ...emptyColor }]);
  };

  const handleAddColorRow = () => setColors((prev) => [...prev, { ...emptyColor }]);

  const handleRemoveColorRow = (index: number) => setColors((prev) => prev.filter((_, i) => i !== index));

  const handleColorChange = (index: number, field: keyof ProductColor, value: string | number) => {
    setColors((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const handleColorImageUpload = async (index: number, file: File) => {
    setUploadingIndex(index);
    try {
      const { filename } = await uploadImage(file);
      handleColorChange(index, "image", filename);
    } catch {
      toast.error("No se pudo subir la imagen");
    } finally {
      setUploadingIndex(null);
    }
  };

  const handleSave = () => {
    if (!form.name || !form.category || form.price <= 0) {
      toast.error("Completa todos los campos requeridos");
      return;
    }
    const validColors = colors.filter((c) => c.name.trim());
    if (validColors.some((c) => !c.image)) {
      toast.error("Cada color debe tener una imagen");
      return;
    }
    const image = validColors.find((c) => c.stock > 0)?.image ?? validColors[0]?.image ?? "";

    const payload = { ...form, image, colors: validColors };

    if (editing) {
      updateProduct({ ...editing, ...payload });
      toast.success("Zapatilla actualizada");
    } else {
      addProduct(payload);
      toast.success("Zapatilla agregada");
    }
    setEditing(null);
    setIsAdding(false);
    setForm(emptyForm);
    setColors([]);
  };

  const handleDelete = (id: number) => {
    deleteProduct(id);
    toast.success("Zapatilla eliminada");
    if (editing?.id === id) {
      setEditing(null);
      setForm(emptyForm);
      setColors([]);
    }
  };

  const handleCancel = () => {
    setEditing(null);
    setIsAdding(false);
    setForm(emptyForm);
    setColors([]);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 py-4 px-4 md:px-8">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link to="/">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
            </Link>
            <h1 className="flex items-center gap-2 text-lg sm:text-xl md:text-2xl font-semibold tracking-tight truncate" style={{ fontFamily: "var(--font-display)" }}>
              <img src="/chicBags.jpeg" alt="ChicBags" className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover shrink-0" />
              Panel Admin — ChicBags
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {user && <span className="hidden sm:inline text-sm text-muted-foreground">{user.username}</span>}
            <Button onClick={handleAdd} className="gap-2">
              <Plus className="w-4 h-4" /> Agregar
            </Button>
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 md:px-8 py-8">
        {(isAdding || editing) && (
          <div className="mb-8 p-6 border border-border rounded-lg bg-card">
            <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>
              {editing ? "Editar Zapatilla" : "Nueva Zapatilla"}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Nombre *</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jordan 1 High..." />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Precio *</label>
                <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} placeholder="189" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Categoría *</label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Jordan, Nike, Adidas..." />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-muted-foreground mb-1 block">Descripción</label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descripción del producto..." />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium">Colores y stock *</label>
                <Button type="button" variant="outline" size="sm" onClick={handleAddColorRow} className="gap-2">
                  <Plus className="w-3.5 h-3.5" /> Agregar color
                </Button>
              </div>

              {colors.length === 0 && (
                <p className="text-sm text-muted-foreground mb-2">Agrega al menos un color con su foto y stock.</p>
              )}

              <div className="space-y-3">
                {colors.map((color, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-3 p-3 rounded-md border border-border bg-background/50">
                    <input
                      ref={(el) => { fileInputRefs.current[index] = el; }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleColorImageUpload(index, file);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRefs.current[index]?.click()}
                      className="relative w-14 h-14 rounded-sm overflow-hidden bg-muted border border-border shrink-0 flex items-center justify-center"
                    >
                      {uploadingIndex === index ? (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      ) : color.image ? (
                        <img src={productImageUrl(color.image)} alt={color.name} className="w-full h-full object-cover" />
                      ) : (
                        <Upload className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>

                    <Input
                      value={color.name}
                      onChange={(e) => handleColorChange(index, "name", e.target.value)}
                      placeholder="Nombre del color"
                      className="flex-1 min-w-[7rem]"
                    />

                    <input
                      type="color"
                      value={color.hex}
                      onChange={(e) => handleColorChange(index, "hex", e.target.value)}
                      className="w-9 h-9 rounded border border-border bg-transparent cursor-pointer"
                      title="Color de referencia"
                    />

                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">Stock</label>
                      <Input
                        type="number"
                        min={0}
                        value={color.stock}
                        onChange={(e) => handleColorChange(index, "stock", Number(e.target.value))}
                        className="w-20"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveColorRow(index)}
                      className="ml-auto p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Quitar color"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button onClick={handleSave} className="gap-2"><Save className="w-4 h-4" /> Guardar</Button>
              <Button variant="outline" onClick={handleCancel} className="gap-2"><X className="w-4 h-4" /> Cancelar</Button>
            </div>
          </div>
        )}

        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Imagen</th>
                  <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Nombre</th>
                  <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Categoría</th>
                  <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Precio</th>
                  <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Stock total</th>
                  <th className="text-right text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const totalStock = product.colors?.reduce((sum, c) => sum + c.stock, 0) ?? 0;
                  return (
                    <tr key={product.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                      <td className="py-3 px-4">
                        <div className="w-12 h-12 rounded bg-muted overflow-hidden">
                          {product.image && <img src={productImageUrl(product.image)} alt={product.name} className="w-full h-full object-cover" />}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium">{product.name}</td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">{product.category}</td>
                      <td className="py-3 px-4">S/.{product.price.toFixed(2)}</td>
                      <td className="py-3 px-4">
                        <span className={totalStock === 0 ? "text-destructive" : "text-muted-foreground"}>
                          {totalStock === 0 ? "Agotado" : totalStock}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(product)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(product.id)} className="text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      Cargando productos...
                    </td>
                  </tr>
                )}
                {isError && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-destructive">
                      No se pudo conectar con la API.
                    </td>
                  </tr>
                )}
                {!isLoading && !isError && products.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      No hay zapatillas. Agrega una nueva.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Admin;

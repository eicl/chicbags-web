import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProducts } from "@/context/ProductContext";
import { Product, ProductColor } from "@/context/CartContext";
import { Plus, Pencil, Trash2, X, Upload, Loader2, Video as VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { uploadImage, uploadVideo, fetchBrands, fetchCategories } from "@/lib/api";
import { productImageUrl } from "@/lib/images";

const emptyForm = { name: "", price: 0, cost: "", category: "", description: "", code: "", brand: "", extraDescription: "", sortOrder: "" };
const emptyColor: ProductColor = { name: "", hex: "#161616", image: "", stock: 0 };
const MAX_PHOTOS = 5;
const MAX_VIDEOS = 2;

const AdminProducts = () => {
  const { products, addProduct, updateProduct, deleteProduct, isLoading, isError } = useProducts();
  const { data: brands = [] } = useQuery({ queryKey: ["brands"], queryFn: fetchBrands });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const [editing, setEditing] = useState<Product | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [colors, setColors] = useState<ProductColor[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const handleEdit = (product: Product) => {
    setEditing(product);
    setForm({
      name: product.name,
      price: product.price,
      cost: product.cost == null ? "" : String(product.cost),
      category: product.category,
      description: product.description,
      code: product.code ?? "",
      brand: product.brand ?? "",
      extraDescription: product.extraDescription ?? "",
      sortOrder: String(product.sortOrder ?? ""),
    });
    setColors((product.colors ?? []).map((c, i) => ({ ...c, order: c.order ?? i })));
    setPhotos(product.photos ?? []);
    setVideos(product.videos ?? []);
    setIsAdding(false);
  };

  const handleAdd = () => {
    setIsAdding(true);
    setEditing(null);
    setForm(emptyForm);
    setColors([{ ...emptyColor, order: 0 }]);
    setPhotos([]);
    setVideos([]);
  };

  const handleAddColorRow = () => setColors((prev) => [...prev, { ...emptyColor, order: prev.length }]);

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

  const handlePhotoUpload = async (file: File) => {
    if (photos.length >= MAX_PHOTOS) {
      toast.error(`Máximo ${MAX_PHOTOS} fotos por producto`);
      return;
    }
    setUploadingPhoto(true);
    try {
      const { filename } = await uploadImage(file);
      setPhotos((prev) => [...prev, filename]);
    } catch {
      toast.error("No se pudo subir la foto");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = (index: number) => setPhotos((prev) => prev.filter((_, i) => i !== index));

  const handleVideoUpload = async (file: File) => {
    if (videos.length >= MAX_VIDEOS) {
      toast.error(`Máximo ${MAX_VIDEOS} videos por producto`);
      return;
    }
    setUploadingVideo(true);
    try {
      const { filename } = await uploadVideo(file);
      setVideos((prev) => [...prev, filename]);
    } catch {
      toast.error("No se pudo subir el video");
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleRemoveVideo = (index: number) => setVideos((prev) => prev.filter((_, i) => i !== index));

  const handleSave = () => {
    if (!form.name || !form.category || form.price <= 0) {
      toast.error("Completa todos los campos requeridos");
      return;
    }
    const validColors = colors
      .filter((c) => c.name.trim())
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (validColors.some((c) => !c.image)) {
      toast.error("Cada color debe tener una imagen");
      return;
    }
    if (validColors.some((c) => !/^#[0-9a-fA-F]{6}$/.test(c.hex))) {
      toast.error("Cada color debe tener un código HTML válido (#RRGGBB)");
      return;
    }
    const image = validColors.find((c) => c.stock > 0)?.image ?? validColors[0]?.image ?? "";

    const payload = {
      ...form,
      image,
      colors: validColors,
      photos,
      videos,
      cost: form.cost === "" ? null : Number(form.cost),
      sortOrder: form.sortOrder === "" ? undefined : Number(form.sortOrder),
    };

    if (editing) {
      updateProduct({ ...editing, ...payload });
      toast.success("Producto actualizado");
    } else {
      addProduct(payload);
      toast.success("Producto agregado");
    }
    setEditing(null);
    setIsAdding(false);
    setForm(emptyForm);
    setColors([]);
  };

  const handleDelete = (id: number) => {
    deleteProduct(id);
    toast.success("Producto eliminado");
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
    setPhotos([]);
    setVideos([]);
  };

  return (
    <div>
      <div className="flex justify-end mb-6">
        <Button onClick={handleAdd} className="gap-2">
          <Plus className="w-4 h-4" /> Agregar
        </Button>
      </div>

      {(isAdding || editing) && (
        <div className="mb-8 p-6 border border-border rounded-lg bg-card">
          <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>
            {editing ? "Editar Producto" : "Nuevo Producto"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Nombre *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cartera Elegance..." />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Precio *</label>
              <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} placeholder="189" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                Costo
                <span className="text-xs font-normal"> — solo visible en el panel admin</span>
              </label>
              <Input
                type="number"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
                placeholder="120"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Categoría *</label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Carteras, Bolsos..."
                list="category-options"
              />
              <datalist id="category-options">
                {categories.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Código</label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="SKU-001" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                Orden en el catálogo
                <span className="text-xs font-normal"> — menor número aparece primero</span>
              </label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                placeholder="Automático (al final)"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Marca</label>
              <Input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="ChicBags, Michael Kors..."
                list="brand-options"
              />
              <datalist id="brand-options">
                {brands.map((b) => (
                  <option key={b.id} value={b.name} />
                ))}
              </datalist>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-muted-foreground mb-1 block">Descripción</label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descripción del producto..." />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-muted-foreground mb-1 block">
                Descripción adicional
                <span className="text-xs font-normal"> — se muestra al final de la página de detalle del producto, admite varios párrafos</span>
              </label>
              <textarea
                value={form.extraDescription}
                onChange={(e) => setForm({ ...form, extraDescription: e.target.value })}
                placeholder="Información detallada, materiales, cuidados, medidas..."
                rows={6}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
              />
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

                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(color.hex) ? color.hex : "#000000"}
                      onChange={(e) => handleColorChange(index, "hex", e.target.value)}
                      className="w-9 h-9 rounded border border-border bg-transparent cursor-pointer shrink-0"
                      title="Elegir color"
                    />
                    <Input
                      value={color.hex}
                      onChange={(e) => handleColorChange(index, "hex", e.target.value)}
                      placeholder="#RRGGBB"
                      maxLength={7}
                      className="w-24 font-mono text-sm"
                      title="Código de color HTML"
                    />
                  </div>

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

                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Orden</label>
                    <Input
                      type="number"
                      value={color.order ?? index}
                      onChange={(e) => handleColorChange(index, "order", Number(e.target.value))}
                      className="w-16"
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

          <div className="border-t border-border pt-4 mt-4">
            <label className="text-sm font-medium mb-3 block">
              Fotos del producto ({photos.length}/{MAX_PHOTOS})
              <span className="text-xs text-muted-foreground font-normal"> — aparte de las fotos de color</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {photos.map((photo, index) => (
                <div key={photo} className="relative w-20 h-20 rounded-sm overflow-hidden bg-muted border border-border group">
                  <img src={productImageUrl(photo)} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(index)}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-background/90 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Quitar foto"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="w-20 h-20 rounded-sm border border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-muted-foreground/50 transition-colors"
                  >
                    {uploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-border pt-4 mt-4">
            <label className="text-sm font-medium mb-3 block">Videos ({videos.length}/{MAX_VIDEOS})</label>
            <div className="flex flex-wrap gap-3">
              {videos.map((video, index) => (
                <div key={video} className="relative w-32 h-20 rounded-sm overflow-hidden bg-muted border border-border group">
                  <video src={productImageUrl(video)} className="w-full h-full object-cover" muted />
                  <button
                    type="button"
                    onClick={() => handleRemoveVideo(index)}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-background/90 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Quitar video"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {videos.length < MAX_VIDEOS && (
                <>
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleVideoUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="w-32 h-20 rounded-sm border border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-muted-foreground/50 transition-colors"
                  >
                    {uploadingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <VideoIcon className="w-4 h-4" />}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button onClick={handleSave} className="gap-2"><Plus className="w-4 h-4" /> Guardar</Button>
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
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Orden</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Código</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Marca</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Nombre</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Categoría</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Precio</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Costo</th>
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
                    <td className="py-3 px-4 text-muted-foreground text-sm">{product.sortOrder ?? "—"}</td>
                    <td className="py-3 px-4 text-muted-foreground text-sm">{product.code || "—"}</td>
                    <td className="py-3 px-4 text-muted-foreground text-sm">{product.brand || "—"}</td>
                    <td className="py-3 px-4 font-medium">{product.name}</td>
                    <td className="py-3 px-4 text-muted-foreground text-sm">{product.category}</td>
                    <td className="py-3 px-4">S/.{product.price.toFixed(2)}</td>
                    <td className="py-3 px-4 text-muted-foreground text-sm">
                      {product.cost == null ? "—" : `S/.${product.cost.toFixed(2)}`}
                    </td>
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
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    Cargando productos...
                  </td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-destructive">
                    No se pudo conectar con la API.
                  </td>
                </tr>
              )}
              {!isLoading && !isError && products.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    No hay productos. Agrega uno nuevo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminProducts;

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { saveProduct } from "@/lib/erp/server";
import { CATEGORIES, UNITS } from "@/lib/erp/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ProductDialog({
  open,
  onOpenChange,
  onSaved,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  initial?: {
    id: number;
    sku: string;
    name: string;
    unit: string;
    category: string;
    purchasePrice: number;
    salePrice: number;
    minStock: number;
    barcode: string | null;
  };
}) {
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "шт");
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0]);
  const [purchasePrice, setPurchasePrice] = useState(
    String(initial?.purchasePrice ?? ""),
  );
  const [salePrice, setSalePrice] = useState(String(initial?.salePrice ?? ""));
  const [minStock, setMinStock] = useState(String(initial?.minStock ?? "0"));
  const [barcode, setBarcode] = useState(initial?.barcode ?? "");

  const mut = useMutation({
    mutationFn: () =>
      saveProduct({
        data: {
          id: initial?.id,
          sku,
          name,
          unit,
          category,
          purchasePrice: Number(purchasePrice) || 0,
          salePrice: Number(salePrice) || 0,
          minStock: Number(minStock) || 0,
          barcode,
        },
      }),
    onSuccess: () => {
      toast.success(initial ? "Товар обновлён" : "Товар создан");
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Товар" : "Новый товар"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label>Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Артикул</Label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label>Ед. изм.</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Категория</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Цена закупа</Label>
              <Input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Цена продажи</Label>
              <Input
                type="number"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Мин. остаток</Label>
              <Input
                type="number"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Штрихкод</Label>
              <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mut.isPending}>
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

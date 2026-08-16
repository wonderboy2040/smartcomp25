import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Plus, Trash2, Package, ShoppingCart } from 'lucide-react'
import { apiPost } from '@/lib/api'

interface PurchaseItem {
  itemId: string
  itemName: string
  quantity: number
  costPrice: number
  sellingPrice: number
}

interface PurchaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: any[]
  refetch: () => void
}

export function PurchaseDialog({ open, onOpenChange, items, refetch }: PurchaseDialogProps) {
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([])
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const handleAddLine = () => {
    setPurchaseItems([
      ...purchaseItems,
      { itemId: '', itemName: '', quantity: 1, costPrice: 0, sellingPrice: 0 }
    ])
  }

  const handleRemoveLine = (index: number) => {
    setPurchaseItems(purchaseItems.filter((_, i) => i !== index))
  }

  const handleItemChange = (index: number, itemId: string) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return

    const newItems = [...purchaseItems]
    newItems[index] = {
      itemId: item.id,
      itemName: item.name,
      quantity: 1,
      costPrice: Number(item.costPrice) || 0,
      sellingPrice: Number(item.sellingPrice) || 0,
    }
    setPurchaseItems(newItems)
  }

  const handleQuantityChange = (index: number, quantity: number) => {
    const newItems = [...purchaseItems]
    newItems[index].quantity = quantity
    setPurchaseItems(newItems)
  }

  const handleCostPriceChange = (index: number, costPrice: number) => {
    const newItems = [...purchaseItems]
    newItems[index].costPrice = costPrice
    setPurchaseItems(newItems)
  }

  const handleSellingPriceChange = (index: number, sellingPrice: number) => {
    const newItems = [...purchaseItems]
    newItems[index].sellingPrice = sellingPrice
    setPurchaseItems(newItems)
  }

  const handleSubmit = async () => {
    // Validation
    if (purchaseItems.length === 0) {
      toast({ title: 'Add at least one item', variant: 'destructive' })
      return
    }

    const invalid = purchaseItems.find(item => !item.itemId || item.quantity <= 0)
    if (invalid) {
      toast({ title: 'All items must have valid quantity', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      // Update each item's stock and prices
      for (const purchaseItem of purchaseItems) {
        const currentItem = items.find(i => i.id === purchaseItem.itemId)
        if (!currentItem) continue

        const newQuantity = (Number(currentItem.quantity) || 0) + purchaseItem.quantity

        await apiPost('/api/items', {
          method: 'PUT',
          id: purchaseItem.itemId,
          body: {
            quantity: newQuantity,
            costPrice: purchaseItem.costPrice,
            sellingPrice: purchaseItem.sellingPrice,
          }
        })

        // Log stock movement
        await apiPost('/api/stock-movements', {
          itemId: purchaseItem.itemId,
          itemName: purchaseItem.itemName,
          changeType: 'purchase',
          quantity: purchaseItem.quantity,
          notes: `Purchase added: ${purchaseItem.quantity} units at Rs.${purchaseItem.costPrice}`,
        }).catch(() => {}) // Silent fail for movement log
      }

      toast({
        title: 'Purchase added successfully!',
        description: `${purchaseItems.length} items updated`,
      })

      refetch()
      onOpenChange(false)
      setPurchaseItems([])
    } catch (e: any) {
      toast({
        title: 'Failed to add purchase',
        description: e.message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const totalQuantity = purchaseItems.reduce((sum, item) => sum + item.quantity, 0)
  const totalCost = purchaseItems.reduce((sum, item) => sum + (item.quantity * item.costPrice), 0)
  const totalSelling = purchaseItems.reduce((sum, item) => sum + (item.quantity * item.sellingPrice), 0)
  const potentialProfit = totalSelling - totalCost

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-blue-600" />
            </div>
            Add Purchase - Multiple Items
          </DialogTitle>
          <p className="text-sm text-slate-500 mt-1">
            Add stock for multiple items at once. Quantities will be added to existing stock.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          {purchaseItems.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-lg">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500 mb-3">No items added yet</p>
              <Button onClick={handleAddLine} size="sm">
                <Plus className="w-4 h-4 mr-1" /> Add First Item
              </Button>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-slate-600 px-2">
                <div className="col-span-4">Item</div>
                <div className="col-span-2">Quantity</div>
                <div className="col-span-2">Cost Price</div>
                <div className="col-span-2">Selling Price</div>
                <div className="col-span-2 text-right">Amount</div>
              </div>

              {/* Items */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {purchaseItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 p-2 border border-slate-200 rounded-lg bg-slate-50">
                    <div className="col-span-4">
                      <Select
                        value={item.itemId}
                        onValueChange={(value) => handleItemChange(index, value)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select item..." />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.name} {i.sku ? `(${i.sku})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="col-span-2">
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleQuantityChange(index, Number(e.target.value))}
                        className="h-9"
                        placeholder="Qty"
                      />
                    </div>

                    <div className="col-span-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.costPrice}
                        onChange={(e) => handleCostPriceChange(index, Number(e.target.value))}
                        className="h-9"
                        placeholder="Cost"
                      />
                    </div>

                    <div className="col-span-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.sellingPrice}
                        onChange={(e) => handleSellingPriceChange(index, Number(e.target.value))}
                        className="h-9"
                        placeholder="Selling"
                      />
                    </div>

                    <div className="col-span-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">
                        Rs.{(item.quantity * item.costPrice).toFixed(2)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveLine(index)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add More Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddLine}
                className="w-full border-dashed"
              >
                <Plus className="w-4 h-4 mr-1" /> Add Another Item
              </Button>

              {/* Summary */}
              <div className="border-t border-slate-200 pt-3 mt-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Items:</span>
                    <span className="font-medium">{purchaseItems.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Quantity:</span>
                    <span className="font-medium">{totalQuantity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Cost:</span>
                    <span className="font-semibold text-slate-900">Rs.{totalCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Potential Value:</span>
                    <span className="font-semibold text-green-700">Rs.{totalSelling.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between col-span-2 pt-2 border-t">
                    <span className="text-slate-600">Potential Profit:</span>
                    <span className="font-bold text-green-700">
                      Rs.{potentialProfit.toFixed(2)}
                      {totalCost > 0 && (
                        <span className="text-xs ml-1">
                          ({((potentialProfit / totalSelling) * 100).toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || purchaseItems.length === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Package className="w-4 h-4 mr-2" />
                Add Purchase ({purchaseItems.length} items)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

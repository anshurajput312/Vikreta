import React, { useState, useMemo } from 'react';
import { 
  X, 
  Printer, 
  Barcode, 
  CheckSquare, 
  Square, 
  Trash2, 
  Layers, 
  Search, 
  SlidersHorizontal
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { productsApi } from '../api/client';
import { BarcodeLabel } from './BarcodeLabel';

export interface BarcodeProduct {
  id?: string;
  name: string;
  sku: string;
  barcode?: string;
  defaultPrice?: number;
}

export interface MultiProductItem {
  product: BarcodeProduct;
  count: number;
}

interface BarcodeGeneratorModalProps {
  isOpen?: boolean;
  onClose: () => void;
  product?: BarcodeProduct | null;
  productsList?: BarcodeProduct[];
  initialMode?: 'single' | 'multi';
}

export const BarcodeGeneratorModal: React.FC<BarcodeGeneratorModalProps> = ({
  isOpen = true,
  onClose,
  product,
  productsList = [],
  initialMode,
}) => {
  // Mode: Single product vs Multiple products combined sheet
  const [mode, setMode] = useState<'single' | 'multi'>(
    initialMode || (product ? 'single' : 'multi')
  );

  // Single mode state
  const [selectedProduct, setSelectedProduct] = useState<BarcodeProduct | null>(
    product || productsList[0] || null
  );
  const [copies, setCopies] = useState<number>(24);

  // Layout format
  const [layout, setLayout] = useState<'a4-24' | 'a4-30' | 'a4-40' | 'thermal'>('a4-24');

  // Sticker content toggles
  const [showStoreName, setShowStoreName] = useState(true);
  const [showProductName, setShowProductName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showBarcodeText, setShowBarcodeText] = useState(true);

  // Multi-product sheet state
  const [multiItems, setMultiItems] = useState<MultiProductItem[]>(() => {
    if (product) {
      return [{ product, count: 6 }];
    }
    if (productsList.length > 0) {
      return productsList.slice(0, 4).map((p) => ({ product: p, count: 6 }));
    }
    return [];
  });
  const [productSearch, setProductSearch] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Fetch full products list for the search dropdown
  const { data: catalogData } = useQuery({
    queryKey: ['products', 'barcode-modal-catalog'],
    queryFn: () => productsApi.list({ pageSize: 250 }),
  });

  const availableCatalog: BarcodeProduct[] = useMemo(() => {
    const apiItems = catalogData?.data?.items ?? [];
    if (apiItems.length > 0) return apiItems;
    return productsList;
  }, [catalogData, productsList]);

  const sheetSizes = {
    'a4-24': { name: 'A4 Sheet (24-Up · 3×8)', count: 24, grid: 'grid-cols-3', w: '70mm', h: '37mm' },
    'a4-30': { name: 'A4 Sheet (30-Up · 3×10)', count: 30, grid: 'grid-cols-3', w: '70mm', h: '29.7mm' },
    'a4-40': { name: 'A4 Sheet (40-Up · 4×10)', count: 40, grid: 'grid-cols-4', w: '52.5mm', h: '29.7mm' },
    'thermal': { name: 'Thermal Roll (50×25mm Single)', count: 1, grid: 'grid-cols-1 max-w-[240px]', w: '50mm', h: '25mm' },
  };

  const storeName = localStorage.getItem('store_upi_name') || 'Vikreta Retail';
  const sheetCapacity = sheetSizes[layout].count;

  // Add a product to the multi-product queue
  const handleAddProduct = (prod: BarcodeProduct) => {
    setMultiItems((prev) => {
      const existing = prev.find(
        (item) => (item.product.id && item.product.id === prod.id) || item.product.sku === prod.sku
      );
      if (existing) {
        return prev.map((item) =>
          item === existing ? { ...item, count: item.count + 1 } : item
        );
      }
      // Calculate remaining slots on current sheet
      const currentTotal = prev.reduce((s, i) => s + i.count, 0);
      const remainingSlots = Math.max(1, sheetCapacity - (currentTotal % sheetCapacity));
      const defaultCount = layout === 'thermal' ? 1 : Math.min(6, remainingSlots);

      return [...prev, { product: prod, count: defaultCount }];
    });
    setProductSearch('');
    setIsSearchFocused(false);
  };

  // Update quantity of stickers for an item in multi-product queue
  const updateItemCount = (index: number, newCount: number) => {
    setMultiItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, count: Math.max(1, newCount) } : item))
    );
  };

  // Remove an item from the multi-product queue
  const removeItem = (index: number) => {
    setMultiItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Set 1 copy each for all items
  const handleSetOneEach = () => {
    setMultiItems((prev) => prev.map((item) => ({ ...item, count: 1 })));
  };

  // Distribute counts evenly across 1 full sheet
  const handleDistributeEvenly = () => {
    if (multiItems.length === 0) return;
    const base = Math.floor(sheetCapacity / multiItems.length);
    const remainder = sheetCapacity % multiItems.length;

    setMultiItems((prev) =>
      prev.map((item, idx) => ({
        ...item,
        count: Math.max(1, base + (idx < remainder ? 1 : 0)),
      }))
    );
  };

  // Add all products from current catalog or list
  const handleAddAllCatalog = () => {
    const source = productsList.length > 0 ? productsList : availableCatalog;
    if (source.length === 0) return;
    const countPerItem = Math.max(1, Math.floor(sheetCapacity / source.length)) || 1;
    setMultiItems(source.map((p) => ({ product: p, count: countPerItem })));
  };

  // Compute total labels count
  const totalLabelsCount = useMemo(() => {
    if (mode === 'single') return copies;
    return multiItems.reduce((acc, item) => acc + item.count, 0);
  }, [mode, copies, multiItems]);

  const totalSheets = Math.ceil(totalLabelsCount / (layout === 'thermal' ? 1 : sheetCapacity)) || 1;

  // Generate flattened array of sticker items
  const flattenedStickers: BarcodeProduct[] = useMemo(() => {
    if (mode === 'single') {
      const prod = selectedProduct || product;
      if (!prod) return [];
      return Array.from({ length: copies }, () => prod);
    } else {
      const list: BarcodeProduct[] = [];
      multiItems.forEach((item) => {
        for (let i = 0; i < item.count; i++) {
          list.push(item.product);
        }
      });
      return list;
    }
  }, [mode, selectedProduct, product, copies, multiItems]);

  // Chunk stickers into sheets
  const sheets: BarcodeProduct[][] = useMemo(() => {
    if (layout === 'thermal' || sheetCapacity === 1) {
      return [flattenedStickers];
    }
    const chunks: BarcodeProduct[][] = [];
    for (let i = 0; i < flattenedStickers.length; i += sheetCapacity) {
      chunks.push(flattenedStickers.slice(i, i + sheetCapacity));
    }
    return chunks.length > 0 ? chunks : [[]];
  }, [flattenedStickers, sheetCapacity, layout]);

  // Filtered catalog for search dropdown
  const filteredCatalogForSearch = useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    if (!q) return availableCatalog.slice(0, 8);
    return availableCatalog
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [availableCatalog, productSearch]);

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border-2 border-ink rounded-2xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-line bg-paper-alt">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-marigold-light rounded-xl text-ink border border-marigold/30">
              <Barcode size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <span>Barcode Label Generator & Sheet Printing</span>
                <span className="hidden sm:inline-flex text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-teal text-white">
                  Multi-Product Ready
                </span>
              </h2>
              <p className="text-xs text-ink-soft">
                Print single or combined multi-product sticker sheets for A4 adhesive labels & thermal rolls
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-soft hover:text-ink p-1 rounded-lg hover:bg-paper transition-colors"
            id="barcode-modal-close-btn"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Controls & Live Preview */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left: Configuration Panel */}
          <div className="w-full md:w-[360px] lg:w-[400px] p-4 sm:p-5 border-r border-line bg-paper overflow-y-auto space-y-4 flex-shrink-0">
            
            {/* Mode Switcher Tabs */}
            <div>
              <label className="block text-xs font-bold text-ink mb-1.5 flex items-center gap-1.5">
                <SlidersHorizontal size={13} className="text-teal-dark" /> Printing Mode
              </label>
              <div className="grid grid-cols-2 p-1 bg-paper-alt rounded-xl border border-line">
                <button
                  type="button"
                  onClick={() => setMode('single')}
                  className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    mode === 'single'
                      ? 'bg-ink text-white shadow-xs'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                  id="barcode-mode-single"
                >
                  <Barcode size={14} />
                  <span>Single Product</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('multi')}
                  className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    mode === 'multi'
                      ? 'bg-teal text-white shadow-xs'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                  id="barcode-mode-multi"
                >
                  <Layers size={14} />
                  <span>Multi-Product Sheet</span>
                </button>
              </div>
            </div>

            {/* Layout Picker */}
            <div>
              <label className="block text-xs font-bold text-ink mb-1">Sheet Format / Printer Type</label>
              <select
                value={layout}
                onChange={(e) => {
                  const newLayout = e.target.value as any;
                  setLayout(newLayout);
                  if (newLayout !== 'thermal' && mode === 'single') {
                    setCopies(sheetSizes[newLayout as keyof typeof sheetSizes].count);
                  }
                }}
                className="input text-xs w-full font-medium"
                id="barcode-sheet-format"
              >
                <option value="a4-24">A4 Sheet — 24 Labels (3 × 8 · 70×37mm)</option>
                <option value="a4-30">A4 Sheet — 30 Labels (3 × 10 · 70×29.7mm)</option>
                <option value="a4-40">A4 Sheet — 40 Labels (4 × 10 · 52.5×29.7mm)</option>
                <option value="thermal">Thermal Roll Label (50 × 25mm / 2"×1")</option>
              </select>
            </div>

            {/* Mode-Specific Settings */}
            {mode === 'single' ? (
              /* Single Product Mode Controls */
              <div className="space-y-4">
                {/* Product Selector */}
                {availableCatalog.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">Select Product</label>
                    <select
                      value={selectedProduct?.id || selectedProduct?.sku}
                      onChange={(e) => {
                        const p = availableCatalog.find(
                          (item) => item.id === e.target.value || item.sku === e.target.value
                        );
                        if (p) setSelectedProduct(p);
                      }}
                      className="input text-xs w-full"
                    >
                      {availableCatalog.map((p) => (
                        <option key={p.id || p.sku} value={p.id || p.sku}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Copies Count */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-ink">Total Labels to Print</label>
                    {layout !== 'thermal' && (
                      <button
                        type="button"
                        onClick={() => setCopies(sheetCapacity)}
                        className="text-[10px] text-teal-dark hover:underline font-bold"
                      >
                        Fill Sheet ({sheetCapacity})
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={copies}
                    onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                    className="input text-xs font-mono w-full"
                  />
                </div>
              </div>
            ) : (
              /* Multi-Product Sheet Mode Controls */
              <div className="space-y-3.5">
                {/* Sheet Fill Capacity Meter */}
                {layout !== 'thermal' && (
                  <div className="bg-paper-alt p-3 rounded-xl border border-line">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-ink">Sheet Capacity</span>
                      <span className="font-mono font-bold text-teal-dark">
                        {totalLabelsCount} / {totalSheets * sheetCapacity} labels ({totalSheets} sheet{totalSheets > 1 ? 's' : ''})
                      </span>
                    </div>

                    <div className="w-full bg-white rounded-full h-2 overflow-hidden border border-line my-1">
                      <div
                        className="bg-teal h-full transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            100,
                            ((totalLabelsCount % sheetCapacity || (totalLabelsCount > 0 ? sheetCapacity : 0)) /
                              sheetCapacity) *
                              100
                          )}%`,
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between mt-1 text-[11px] text-ink-soft">
                      <span>
                        {totalLabelsCount === 0
                          ? 'No items added'
                          : totalLabelsCount % sheetCapacity === 0
                          ? '✓ Sheet completely filled'
                          : `${sheetCapacity - (totalLabelsCount % sheetCapacity)} slots available on Sheet ${totalSheets}`}
                      </span>
                      {totalLabelsCount > 0 && totalLabelsCount % sheetCapacity !== 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (multiItems.length > 0) {
                              const remaining = sheetCapacity - (totalLabelsCount % sheetCapacity);
                              updateItemCount(0, multiItems[0].count + remaining);
                            }
                          }}
                          className="text-teal-dark font-bold hover:underline"
                        >
                          + Auto Fill
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Quick Helper Actions */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleDistributeEvenly}
                    disabled={multiItems.length === 0}
                    className="px-2 py-1 bg-white border border-line rounded-lg text-[10px] font-bold text-ink hover:border-teal disabled:opacity-40 transition-colors"
                    title="Evenly distribute labels across 1 sheet"
                  >
                    Even Fill ({sheetCapacity})
                  </button>
                  <button
                    type="button"
                    onClick={handleSetOneEach}
                    disabled={multiItems.length === 0}
                    className="px-2 py-1 bg-white border border-line rounded-lg text-[10px] font-bold text-ink hover:border-teal disabled:opacity-40 transition-colors"
                  >
                    1 Copy Each
                  </button>
                  {productsList.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAddAllCatalog}
                      className="px-2 py-1 bg-white border border-line rounded-lg text-[10px] font-bold text-ink hover:border-teal transition-colors"
                    >
                      Add All ({productsList.length})
                    </button>
                  )}
                  {multiItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setMultiItems([])}
                      className="px-2 py-1 bg-white border border-line rounded-lg text-[10px] font-bold text-cherry hover:bg-rose-50 ml-auto transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Add Product Search Dropdown */}
                <div className="relative">
                  <label className="block text-xs font-bold text-ink mb-1">Add Product to Sheet</label>
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setIsSearchFocused(true);
                      }}
                      onFocus={() => setIsSearchFocused(true)}
                      placeholder="Search name, SKU or barcode to add…"
                      className="input text-xs pl-8 pr-7 w-full"
                      id="barcode-search-add-product"
                    />
                    {productSearch && (
                      <button
                        type="button"
                        onClick={() => setProductSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-soft hover:text-ink"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Search Results Dropdown */}
                  {isSearchFocused && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border-2 border-line rounded-xl shadow-xl max-h-52 overflow-y-auto z-30 divide-y divide-line">
                      {filteredCatalogForSearch.length === 0 ? (
                        <div className="p-3 text-center text-xs text-ink-soft">
                          No matching products found.
                        </div>
                      ) : (
                        filteredCatalogForSearch.map((p) => {
                          const alreadyInList = multiItems.some(
                            (i) => (i.product.id && i.product.id === p.id) || i.product.sku === p.sku
                          );
                          return (
                            <button
                              key={p.id || p.sku}
                              type="button"
                              onClick={() => handleAddProduct(p)}
                              className="w-full text-left p-2.5 hover:bg-paper flex items-center justify-between text-xs transition-colors"
                            >
                              <div className="min-w-0 pr-2">
                                <p className="font-bold text-ink truncate">{p.name}</p>
                                <p className="text-[10px] text-ink-soft font-mono truncate">
                                  SKU: {p.sku} {p.barcode ? `· Code: ${p.barcode}` : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {p.defaultPrice !== undefined && (
                                  <span className="font-mono font-bold text-ink-soft">
                                    ₹{p.defaultPrice}
                                  </span>
                                )}
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                    alreadyInList
                                      ? 'bg-teal/10 text-teal-dark border border-teal/20'
                                      : 'bg-paper-alt text-ink border border-line'
                                  }`}
                                >
                                  {alreadyInList ? '+ Add More' : '+ Add'}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      )}
                      <button
                        type="button"
                        onClick={() => setIsSearchFocused(false)}
                        className="w-full text-center py-1.5 text-[11px] font-bold text-ink-soft bg-paper hover:text-ink"
                      >
                        Close Dropdown
                      </button>
                    </div>
                  )}
                </div>

                {/* Queue of Products on the Sheet */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-ink">
                    <span>Products on Sheet ({multiItems.length})</span>
                    <span className="text-[11px] text-ink-soft font-mono">
                      Total: {totalLabelsCount} stickers
                    </span>
                  </div>

                  {multiItems.length === 0 ? (
                    <div className="p-4 bg-paper-alt rounded-xl border border-dashed border-line text-center text-xs text-ink-soft">
                      No products added to this sheet yet. Search and click a product above to add stickers.
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                      {multiItems.map((item, idx) => (
                        <div
                          key={`${item.product.id || item.product.sku}-${idx}`}
                          className="bg-white p-2 rounded-xl border border-line flex items-center justify-between gap-2 shadow-2xs"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-ink truncate leading-tight">
                              {item.product.name}
                            </p>
                            <p className="text-[10px] text-ink-soft font-mono truncate">
                              SKU: {item.product.sku}
                              {item.product.defaultPrice !== undefined ? ` · ₹${item.product.defaultPrice}` : ''}
                            </p>
                          </div>

                          {/* Stepper for Copies of this Product */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => updateItemCount(idx, item.count - 1)}
                              className="w-6 h-6 rounded-lg bg-paper-alt hover:bg-paper border border-line flex items-center justify-center font-bold text-xs"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={item.count}
                              onChange={(e) => updateItemCount(idx, parseInt(e.target.value) || 1)}
                              className="w-10 text-center font-mono text-xs font-bold py-0.5 border border-line rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => updateItemCount(idx, item.count + 1)}
                              className="w-6 h-6 rounded-lg bg-paper-alt hover:bg-paper border border-line flex items-center justify-center font-bold text-xs"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="p-1 text-ink-soft hover:text-cherry ml-1 rounded"
                              title="Remove from sheet"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Label Elements Toggles */}
            <div className="space-y-2 pt-3 border-t border-line">
              <label className="block text-xs font-bold text-ink mb-1">Sticker Content Elements</label>
              {[
                { label: 'Store Name Header', val: showStoreName, set: setShowStoreName },
                { label: 'Product Name', val: showProductName, set: setShowProductName },
                { label: 'MRP / Price (₹)', val: showPrice, set: setShowPrice },
                { label: 'Barcode Digits Text', val: showBarcodeText, set: setShowBarcodeText },
              ].map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => item.set(!item.val)}
                  className="flex items-center gap-2 text-xs text-ink hover:text-teal-dark transition-colors w-full text-left"
                >
                  {item.val ? (
                    <CheckSquare size={15} className="text-teal-dark flex-shrink-0" />
                  ) : (
                    <Square size={15} className="text-ink-soft flex-shrink-0" />
                  )}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-line space-y-2">
              <button
                onClick={handlePrint}
                disabled={totalLabelsCount === 0}
                className="btn-primary w-full justify-center py-2.5 shadow-sm text-sm disabled:opacity-50"
                id="barcode-print-action-btn"
              >
                <Printer size={15} />
                <span>
                  Print {totalLabelsCount} Sticker{totalLabelsCount === 1 ? '' : 's'}{' '}
                  {layout !== 'thermal' && `(${totalSheets} Sheet${totalSheets > 1 ? 's' : ''})`}
                </span>
              </button>
              <button onClick={onClose} className="btn-secondary w-full justify-center text-xs">
                Cancel
              </button>
            </div>
          </div>

          {/* Right: Live Sheet Preview */}
          <div className="flex-1 p-4 sm:p-5 bg-paper-alt/60 overflow-y-auto flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-ink-soft uppercase tracking-wider">
                Live Sheet Preview ({totalLabelsCount} Labels · {sheetSizes[layout].name})
              </span>
              <span className="text-[11px] text-ink-soft font-mono">
                {mode === 'single' ? (
                  <>
                    SKU: <strong>{selectedProduct?.sku}</strong>
                  </>
                ) : (
                  <>
                    {multiItems.length} Products Mixed · {totalSheets} Sheet{totalSheets > 1 ? 's' : ''}
                  </>
                )}
              </span>
            </div>

            {/* Printable Sheet Container */}
            <div className="w-full max-w-3xl space-y-6">
              {sheets.map((sheetItems, sheetIdx) => (
                <div
                  key={sheetIdx}
                  className={`bg-white border border-line shadow-md p-4 rounded-xl printable-barcode-sheet ${
                    sheetIdx > 0 ? 'page-break' : ''
                  }`}
                >
                  {/* Sheet Header Divider in On-Screen Preview */}
                  {sheets.length > 1 && (
                    <div className="no-print text-xs font-bold text-ink-soft bg-paper-alt px-3 py-1.5 rounded-lg mb-3 border border-line flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Layers size={13} className="text-teal-dark" />
                        <span>Sheet {sheetIdx + 1} of {sheets.length}</span>
                      </span>
                      <span className="text-[11px] font-mono text-teal-dark font-semibold">
                        {sheetItems.length} / {sheetCapacity} Labels Filled
                      </span>
                    </div>
                  )}

                  {/* Grid of Barcode Stickers */}
                  <div className={`grid ${sheetSizes[layout].grid} gap-2`}>
                    {sheetItems.map((item, stickerIdx) => (
                      <BarcodeLabel
                        key={`${sheetIdx}-${stickerIdx}-${item.sku}`}
                        storeName={storeName}
                        productName={item.name}
                        sku={item.sku}
                        barcode={item.barcode || item.sku}
                        price={item.defaultPrice}
                        layout={layout}
                        showStoreName={showStoreName}
                        showProductName={showProductName}
                        showPrice={showPrice}
                        showBarcodeText={showBarcodeText}
                      />
                    ))}

                    {/* Placeholder Blank Slots to help visually show empty spots on sheet */}
                    {layout !== 'thermal' &&
                      sheetItems.length < sheetCapacity &&
                      Array.from({ length: sheetCapacity - sheetItems.length }).map((_, blankIdx) => (
                        <div
                          key={`blank-${blankIdx}`}
                          className="border border-dashed border-gray-200 bg-gray-50/50 rounded flex items-center justify-center text-[10px] text-gray-300 font-mono no-print min-h-[60px]"
                        >
                          Blank Slot
                        </div>
                      ))}
                  </div>
                </div>
              ))}

              {totalLabelsCount === 0 && (
                <div className="bg-white border border-line shadow-md p-12 rounded-xl text-center space-y-2">
                  <Barcode size={32} className="mx-auto text-ink-soft opacity-40" />
                  <p className="text-sm font-bold text-ink">No Barcode Stickers in Queue</p>
                  <p className="text-xs text-ink-soft">
                    Search and add products from the left panel to build your multi-product sheet.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

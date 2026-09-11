import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export interface BarcodeLabelProps {
  storeName?: string;
  productName: string;
  sku?: string;
  barcode: string;
  price?: number;
  layout?: 'a4-24' | 'a4-30' | 'a4-40' | 'thermal';
  showStoreName?: boolean;
  showProductName?: boolean;
  showPrice?: boolean;
  showBarcodeText?: boolean;
}

export const BarcodeLabel: React.FC<BarcodeLabelProps> = ({
  storeName = 'Vikreta Retail',
  productName,
  sku,
  barcode,
  price,
  layout = 'a4-24',
  showStoreName = true,
  showProductName = true,
  showPrice = true,
  showBarcodeText = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const rawCode = barcode?.trim() || sku?.trim() || '100001';

    try {
      // Auto-detect format: EAN-13 if 13 digits with valid checksum, otherwise CODE128
      let format = 'CODE128';
      if (/^\d{13}$/.test(rawCode)) {
        // Verify EAN-13 checksum
        let sum = 0;
        for (let i = 0; i < 12; i++) {
          sum += parseInt(rawCode[i], 10) * (i % 2 === 0 ? 1 : 3);
        }
        const checksum = (10 - (sum % 10)) % 10;
        if (checksum === parseInt(rawCode[12], 10)) {
          format = 'EAN13';
        }
      } else if (/^\d{12}$/.test(rawCode)) {
        format = 'UPC';
      } else if (/^\d{8}$/.test(rawCode)) {
        format = 'EAN8';
      }

      // Render crisp, high-contrast barcode to canvas with solid white quiet zone
      JsBarcode(canvasRef.current, rawCode, {
        format,
        width: layout === 'thermal' ? 2.0 : 1.8,
        height: layout === 'a4-40' ? 36 : layout === 'thermal' ? 48 : 42,
        displayValue: showBarcodeText,
        fontSize: 12,
        font: 'monospace',
        fontOptions: 'bold',
        textMargin: 3,
        margin: 12, // Critical quiet zone: minimum 10 modules for camera & laser scanners
        background: '#ffffff', // Pure white solid background
        lineColor: '#000000', // Deep black bars
      });
    } catch {
      // Fallback to Code 128 if specific format failed
      try {
        if (canvasRef.current) {
          JsBarcode(canvasRef.current, rawCode, {
            format: 'CODE128',
            width: 1.8,
            height: 38,
            displayValue: showBarcodeText,
            fontSize: 12,
            font: 'monospace',
            margin: 12,
            background: '#ffffff',
            lineColor: '#000000',
          });
        }
      } catch (fallbackErr) {
        console.error('Barcode render error:', fallbackErr);
      }
    }
  }, [barcode, sku, layout, showBarcodeText]);

  return (
    <div
      className={`barcode-sticker barcode-sticker-${layout} border border-dashed border-gray-300 p-2 bg-white flex flex-col items-center justify-between text-center overflow-hidden rounded shadow-2xs`}
      style={{ backgroundColor: '#ffffff' }}
    >
      {showStoreName && (
        <p className="text-[10px] font-bold text-gray-800 uppercase tracking-wider truncate w-full">
          {storeName}
        </p>
      )}
      {showProductName && (
        <p
          className="text-[11px] font-semibold text-gray-900 leading-tight truncate w-full px-0.5"
          title={productName}
        >
          {productName}
        </p>
      )}
      <div className="my-1 flex items-center justify-center max-w-full overflow-hidden bg-white p-0.5 rounded">
        <canvas ref={canvasRef} className="max-w-full h-auto" />
      </div>
      {showPrice && price !== undefined && (
        <p className="text-[11px] font-mono font-extrabold text-gray-900">
          MRP: ₹{price.toFixed(2)}
        </p>
      )}
    </div>
  );
};

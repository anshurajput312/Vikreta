/**
 * Pure client-side OpenXML XLSX generator with zero external npm dependencies.
 * Creates an authentic .xlsx spreadsheet file compatible with Excel, Google Sheets, LibreOffice, etc.
 */

// CRC32 implementation
function crc32(buf: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

interface ZipFile {
  name: string;
  data: Uint8Array;
}

function createZip(files: ZipFile[]): Uint8Array {
  const fileEntries: Array<{
    nameBuf: Uint8Array;
    dataBuf: Uint8Array;
    crc: number;
    size: number;
    offset: number;
    localHeader: Uint8Array;
  }> = [];

  let offset = 0;
  const encoder = new TextEncoder();

  for (const f of files) {
    const dataBuf = f.data;
    const nameBuf = encoder.encode(f.name);
    const crc = crc32(dataBuf);
    const size = dataBuf.length;

    // Local file header (30 bytes + nameLen)
    const localHeader = new Uint8Array(30 + nameBuf.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true); // Local file header signature
    view.setUint16(4, 20, true); // Version needed to extract
    view.setUint16(6, 0, true); // General purpose bit flag
    view.setUint16(8, 0, true); // Compression method (0 = uncompressed / store)
    view.setUint16(10, 0x5000, true); // Mod time
    view.setUint16(12, 0x5400, true); // Mod date
    view.setUint32(14, crc, true); // CRC-32
    view.setUint32(18, size, true); // Compressed size
    view.setUint32(22, size, true); // Uncompressed size
    view.setUint16(26, nameBuf.length, true); // File name length
    view.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBuf, 30);

    fileEntries.push({
      nameBuf,
      dataBuf,
      crc,
      size,
      offset,
      localHeader,
    });

    offset += localHeader.length + dataBuf.length;
  }

  // Central directory
  const cdParts: Uint8Array[] = [];
  const cdOffset = offset;
  let cdSize = 0;

  for (const entry of fileEntries) {
    const cdHeader = new Uint8Array(46 + entry.nameBuf.length);
    const view = new DataView(cdHeader.buffer);
    view.setUint32(0, 0x02014b50, true); // Central directory header signature
    view.setUint16(4, 20, true); // Version made by
    view.setUint16(6, 20, true); // Version needed to extract
    view.setUint16(8, 0, true); // General purpose bit flag
    view.setUint16(10, 0, true); // Compression method
    view.setUint16(12, 0x5000, true); // Mod time
    view.setUint16(14, 0x5400, true); // Mod date
    view.setUint32(16, entry.crc, true); // CRC-32
    view.setUint32(20, entry.size, true); // Compressed size
    view.setUint32(24, entry.size, true); // Uncompressed size
    view.setUint16(28, entry.nameBuf.length, true); // File name length
    view.setUint16(30, 0, true); // Extra field length
    view.setUint16(32, 0, true); // File comment length
    view.setUint16(34, 0, true); // Disk number start
    view.setUint16(36, 0, true); // Internal file attributes
    view.setUint32(38, 0, true); // External file attributes
    view.setUint32(42, entry.offset, true); // Relative offset of local header
    cdHeader.set(entry.nameBuf, 46);

    cdParts.push(cdHeader);
    cdSize += cdHeader.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
  eocdView.setUint16(4, 0, true); // Number of this disk
  eocdView.setUint16(6, 0, true); // Disk where central directory starts
  eocdView.setUint16(8, fileEntries.length, true); // Number of central directory records on this disk
  eocdView.setUint16(10, fileEntries.length, true); // Total number of central directory records
  eocdView.setUint32(12, cdSize, true); // Size of central directory
  eocdView.setUint32(16, cdOffset, true); // Offset of start of central directory
  eocdView.setUint16(20, 0, true); // Comment length

  // Total size
  const totalLength = offset + cdSize + 22;
  const result = new Uint8Array(totalLength);
  let pos = 0;

  for (const entry of fileEntries) {
    result.set(entry.localHeader, pos);
    pos += entry.localHeader.length;
    result.set(entry.dataBuf, pos);
    pos += entry.dataBuf.length;
  }

  for (const cd of cdParts) {
    result.set(cd, pos);
    pos += cd.length;
  }

  result.set(eocd, pos);
  return result;
}

function escapeXml(str: any): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colName(idx: number): string {
  let name = '';
  while (idx >= 0) {
    name = String.fromCharCode((idx % 26) + 65) + name;
    idx = Math.floor(idx / 26) - 1;
  }
  return name;
}

export function generateXlsxBlob(
  sheetName: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): Blob {
  const encoder = new TextEncoder();

  // 1. Build sheet1.xml
  let sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  sheetXml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n';
  sheetXml += '  <sheetData>\n';

  // Header row (row 1)
  sheetXml += '    <row r="1">\n';
  headers.forEach((h, colIdx) => {
    const cellRef = `${colName(colIdx)}1`;
    sheetXml += `      <c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(h)}</t></is></c>\n`;
  });
  sheetXml += '    </row>\n';

  // Data rows
  rows.forEach((row, rowIdx) => {
    const rNum = rowIdx + 2;
    sheetXml += `    <row r="${rNum}">\n`;
    row.forEach((val, colIdx) => {
      const cellRef = `${colName(colIdx)}${rNum}`;
      if (typeof val === 'number' && !isNaN(val)) {
        sheetXml += `      <c r="${cellRef}"><v>${val}</v></c>\n`;
      } else {
        sheetXml += `      <c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(val ?? '')}</t></is></c>\n`;
      }
    });
    sheetXml += '    </row>\n';
  });

  sheetXml += '  </sheetData>\n';
  sheetXml += '</worksheet>';

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheetName || 'Sheet1')}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const files: ZipFile[] = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelsXml) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheetXml) },
  ];

  const zipBytes = createZip(files);
  return new Blob([zipBytes as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Downloads an authentic .xlsx Excel file to the user's browser.
 */
export function exportToExcel(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): void {
  const blob = generateXlsxBlob(sheetName, headers, rows);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Downloads a CSV file to the user's browser.
 */
export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): void {
  const csvRows = [
    headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(','),
    ...rows.map((r) =>
      r.map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',')
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

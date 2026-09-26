// A minimal stored (no compression) ZIP writer. No dependency: publish's package.json is not
// ours to edit, and this keeps tests free of a system `zip`/`unzip` requirement.

export interface ZipEntry {
  name: string; // forward-slash path, e.g. "index.html" or "assets/logo.png"
  data: Uint8Array;
}

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i] as number;
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

// DOS date/time for 2020-01-01 00:00:00, a fixed timestamp so builds are deterministic.
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

// Builds a valid ZIP archive (method 0: stored) from a flat entry list. Directory entries are
// implicit: every name is a file path, forward slashes are directory separators.
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const localChunks: number[][] = [];
  const centralChunks: number[][] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Array.from(Buffer.from(entry.name, "utf8"));
    const data = entry.data;
    const crc = crc32(data);
    const size = data.length;

    const localHeader = [
      ...u32(0x04034b50),
      ...u16(20), // version needed
      ...u16(0), // flags
      ...u16(0), // method: stored
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(size), // compressed size == size (stored)
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0), // extra length
      ...nameBytes,
    ];
    localChunks.push(localHeader, Array.from(data));

    const centralHeader = [
      ...u32(0x02014b50),
      ...u16(20), // version made by
      ...u16(20), // version needed
      ...u16(0), // flags
      ...u16(0), // method
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0), // extra length
      ...u16(0), // comment length
      ...u16(0), // disk number start
      ...u16(0), // internal attrs
      ...u32(0), // external attrs
      ...u32(offset), // local header offset
      ...nameBytes,
    ];
    centralChunks.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralStart = offset;
  const centralBytes = centralChunks.flat();
  const centralSize = centralBytes.length;

  const eocd = [
    ...u32(0x06054b50),
    ...u16(0), // disk number
    ...u16(0), // disk with central dir
    ...u16(entries.length), // entries on this disk
    ...u16(entries.length), // total entries
    ...u32(centralSize),
    ...u32(centralStart),
    ...u16(0), // comment length
  ];

  const all = [...localChunks.flat(), ...centralBytes, ...eocd];
  return Uint8Array.from(all);
}

interface CentralDirEntry {
  name: string;
  size: number;
  crc32: number;
}

// Parses the central directory of a ZIP built by buildZip (method 0 only). Used by tests instead
// of a system `unzip` dependency.
export function listZipEntries(zip: Uint8Array): CentralDirEntry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocdOffset = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("not a zip: no end-of-central-directory record found");
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralStart = view.getUint32(eocdOffset + 16, true);

  const out: CentralDirEntry[] = [];
  let cursor = centralStart;
  for (let i = 0; i < totalEntries; i++) {
    const sig = view.getUint32(cursor, true);
    if (sig !== 0x02014b50) throw new Error(`not a zip: bad central directory signature at ${cursor}`);
    const crc = view.getUint32(cursor + 16, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const nameStart = cursor + 46;
    const name = Buffer.from(zip.slice(nameStart, nameStart + nameLen)).toString("utf8");
    out.push({ name, size, crc32: crc });
    cursor = nameStart + nameLen + extraLen + commentLen;
  }
  return out;
}

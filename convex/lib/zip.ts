/**
 * Minimal ZIP writer, dependency-free and runtime-agnostic.
 *
 * Uses the "stored" (method 0, no compression) format so it works in the
 * Convex isolate runtime without Node's zlib/Buffer. The files are tiny XML
 * documents, so skipping compression is fine.
 */

// CRC32 implementation.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
}

function u32(v: number): Uint8Array {
  return new Uint8Array([
    v & 0xff,
    (v >>> 8) & 0xff,
    (v >>> 16) & 0xff,
    (v >>> 24) & 0xff,
  ]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export interface ZipFile {
  name: string;
  data: string | Uint8Array;
}

export function createZip(files: ZipFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = encoder.encode(f.name);
    const raw =
      typeof f.data === "string" ? encoder.encode(f.data) : f.data;
    const crc = crc32(raw);

    // Local file header (method 0 = stored).
    const local = concat([
      u32(0x04034b50), // signature
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method: stored
      u16(0), // mod time
      u16(0), // mod date
      u32(crc),
      u32(raw.length), // compressed size == raw size
      u32(raw.length), // uncompressed size
      u16(nameBuf.length),
      u16(0), // extra len
    ]);
    localParts.push(local, nameBuf, raw);

    // Central directory header.
    const central = concat([
      u32(0x02014b50),
      u16(20), // version made by
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method
      u16(0), // mod time
      u16(0), // mod date
      u32(crc),
      u32(raw.length),
      u32(raw.length),
      u16(nameBuf.length),
      u16(0), // extra len
      u16(0), // comment len
      u16(0), // disk number
      u16(0), // internal attrs
      u32(0), // external attrs
      u32(offset), // local header offset
    ]);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + raw.length;
  }

  const centralDir = concat(centralParts);
  const localData = concat(localParts);

  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(localData.length),
    u16(0),
  ]);

  return concat([localData, centralDir, end]);
}

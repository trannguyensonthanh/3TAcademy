/**
 * Zero-dependency ISO/IEC 18004 QR Code Matrix Generator (Byte Mode, ECC Level L, Versions 1–6).
 * Encodes UTF-8 strings up to 134 bytes (such as certificate verification URLs) into a scannable boolean[][] matrix.
 */

interface QrVersionSpec {
  version: number;
  size: number;
  alignmentCenters: number[];
  numBlocks: number;
  dataCodewordsPerBlock: number;
  ecCodewordsPerBlock: number;
}

const VERSION_SPECS_L: QrVersionSpec[] = [
  { version: 1, size: 21, alignmentCenters: [], numBlocks: 1, dataCodewordsPerBlock: 19, ecCodewordsPerBlock: 7 },
  { version: 2, size: 25, alignmentCenters: [6, 18], numBlocks: 1, dataCodewordsPerBlock: 34, ecCodewordsPerBlock: 10 },
  { version: 3, size: 29, alignmentCenters: [6, 22], numBlocks: 1, dataCodewordsPerBlock: 55, ecCodewordsPerBlock: 15 },
  { version: 4, size: 33, alignmentCenters: [6, 26], numBlocks: 1, dataCodewordsPerBlock: 80, ecCodewordsPerBlock: 20 },
  { version: 5, size: 37, alignmentCenters: [6, 30], numBlocks: 1, dataCodewordsPerBlock: 108, ecCodewordsPerBlock: 26 },
  { version: 6, size: 41, alignmentCenters: [6, 34], numBlocks: 2, dataCodewordsPerBlock: 68, ecCodewordsPerBlock: 18 },
];

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function buildRsDivisor(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) {
        result[j] ^= result[j + 1];
      }
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function computeRsRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const result = new Uint8Array(divisor.length);
  for (let i = 0; i < data.length; i += 1) {
    const factor = data[i] ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let j = 0; j < divisor.length; j += 1) {
      result[j] ^= gfMultiply(divisor[j], factor);
    }
  }
  return result;
}

function utf8Bytes(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  const arr: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    arr.push(text.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(arr);
}

function appendBits(val: number, len: number, bitBuf: number[]): void {
  for (let i = len - 1; i >= 0; i -= 1) {
    bitBuf.push((val >>> i) & 1);
  }
}

export function encodeQrMatrix(rawText: string): boolean[][] {
  const payload = utf8Bytes(rawText || 'https://3t.edu.vn/verify');
  const spec =
    VERSION_SPECS_L.find(
      (s) => payload.length + 2 <= s.numBlocks * s.dataCodewordsPerBlock
    ) ?? VERSION_SPECS_L[VERSION_SPECS_L.length - 1];

  const maxBytes = spec.numBlocks * spec.dataCodewordsPerBlock - 2;
  const dataBytes = payload.length > maxBytes ? payload.subarray(0, maxBytes) : payload;
  const totalDataCodewords = spec.numBlocks * spec.dataCodewordsPerBlock;

  // 1. Build Byte-mode bit stream (0100 + 8-bit char count + payload + terminator + 0xEC/0x11 pad)
  const bits: number[] = [];
  appendBits(0b0100, 4, bits);
  appendBits(dataBytes.length, 8, bits);
  for (let i = 0; i < dataBytes.length; i += 1) {
    appendBits(dataBytes[i], 8, bits);
  }

  const capacityBits = totalDataCodewords * 8;
  appendBits(0, Math.min(4, capacityBits - bits.length), bits);
  appendBits(0, (8 - (bits.length % 8)) % 8, bits);

  let padToggle = 0;
  while (bits.length < capacityBits) {
    appendBits(padToggle % 2 === 0 ? 0xec : 0x11, 8, bits);
    padToggle += 1;
  }

  const dataCodewords = new Uint8Array(totalDataCodewords);
  for (let i = 0; i < bits.length; i += 1) {
    dataCodewords[i >>> 3] |= bits[i] << (7 - (i & 7));
  }

  // 2. Reed-Solomon ECC & Block Interleaving
  const rsDiv = buildRsDivisor(spec.ecCodewordsPerBlock);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  for (let b = 0; b < spec.numBlocks; b += 1) {
    const start = b * spec.dataCodewordsPerBlock;
    const block = dataCodewords.subarray(start, start + spec.dataCodewordsPerBlock);
    dataBlocks.push(block);
    ecBlocks.push(computeRsRemainder(block, rsDiv));
  }

  const finalCodewords: number[] = [];
  for (let i = 0; i < spec.dataCodewordsPerBlock; i += 1) {
    for (let b = 0; b < spec.numBlocks; b += 1) {
      finalCodewords.push(dataBlocks[b][i]);
    }
  }
  for (let i = 0; i < spec.ecCodewordsPerBlock; i += 1) {
    for (let b = 0; b < spec.numBlocks; b += 1) {
      finalCodewords.push(ecBlocks[b][i]);
    }
  }

  // 3. Initialize Matrix & Function Patterns
  const size = spec.size;
  const modules: boolean[][] = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false)
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false)
  );

  const setFunctionModule = (r: number, c: number, dark: boolean) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    modules[r][c] = dark;
    isFunction[r][c] = true;
  };

  // Finder patterns + 1-module white separators
  const drawFinder = (centerR: number, centerC: number) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFunctionModule(centerR + dy, centerC + dx, dist !== 2 && dist !== 4);
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(3, size - 4);
  drawFinder(size - 4, 3);

  // Timing patterns
  for (let i = 0; i < size; i += 1) {
    if (!isFunction[6][i]) setFunctionModule(6, i, i % 2 === 0);
    if (!isFunction[i][6]) setFunctionModule(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const centers = spec.alignmentCenters;
  for (let i = 0; i < centers.length; i += 1) {
    for (let j = 0; j < centers.length; j += 1) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0)
      ) {
        continue;
      }
      const cr = centers[i];
      const cc = centers[j];
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          setFunctionModule(cr + dy, cc + dx, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve Format Info & Dark Module
  const drawFormatBits = (mask: number) => {
    const data5 = (0b01 << 3) | mask; // ECC Level L = 01
    let rem = data5 << 10;
    for (let i = 14; i >= 10; i -= 1) {
      if ((rem >>> i) & 1) {
        rem ^= 0x537 << (i - 10);
      }
    }
    const formatBits = ((data5 << 10) | rem) ^ 0x5412;

    const getBit = (idx: number) => ((formatBits >>> idx) & 1) !== 0;

    // Copy 1: around top-left finder
    const tlCoords: Array<[number, number, number]> = [
      [8, 0, 14],
      [8, 1, 13],
      [8, 2, 12],
      [8, 3, 11],
      [8, 4, 10],
      [8, 5, 9],
      [8, 7, 8],
      [8, 8, 7],
      [7, 8, 6],
      [5, 8, 5],
      [4, 8, 4],
      [3, 8, 3],
      [2, 8, 2],
      [1, 8, 1],
      [0, 8, 0],
    ];
    for (const [r, c, bitIdx] of tlCoords) {
      setFunctionModule(r, c, getBit(bitIdx));
    }

    // Copy 2: bottom-left vertical + top-right horizontal
    for (let i = 0; i < 7; i += 1) {
      setFunctionModule(size - 1 - i, 8, getBit(14 - i));
    }
    setFunctionModule(size - 8, 8, true); // Dark module
    for (let i = 0; i < 8; i += 1) {
      setFunctionModule(8, size - 8 + i, getBit(7 - i));
    }
  };

  drawFormatBits(0);

  // 4. Zig-zag Data & ECC Codeword Placement
  let bitIdx = 0;
  const totalPayloadBits = finalCodewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (!isFunction[r][c] && bitIdx < totalPayloadBits) {
          const byte = finalCodewords[bitIdx >>> 3];
          modules[r][c] = ((byte >>> (7 - (bitIdx & 7))) & 1) !== 0;
          bitIdx += 1;
        }
      }
    }
  }

  // 5. Apply Mask 0 ((r + c) % 2 === 0) & Finalize Format Info
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!isFunction[r][c] && (r + c) % 2 === 0) {
        modules[r][c] = !modules[r][c];
      }
    }
  }
  drawFormatBits(0);

  return modules;
}

export function buildCertificateVerifyUrl(certificateCode: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://3t.edu.vn';
  return `${origin}/certificates/verify/${encodeURIComponent(certificateCode)}`;
}

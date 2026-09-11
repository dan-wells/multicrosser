// RFC 1321 MD5. Present only because puzzle-nonograms.com identifies a solved
// grid by md5(task + solution) and MD5 is not available through SubtleCrypto.
// Input is treated as Latin-1; the strings hashed here are ASCII.

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296));

const rotateLeft = (value, shift) => (value << shift) | (value >>> (32 - shift));

// Little-endian 32-bit words: the message padded to a multiple of 64 bytes with
// a 0x80 byte, zeroes, and the original bit length in the last two words.
function toWords(input) {
  const byteLength = input.length;
  const wordCount = (((byteLength + 8) >>> 6) + 1) * 16;
  const words = new Array(wordCount).fill(0);
  for (let i = 0; i < byteLength; i += 1) {
    words[i >>> 2] |= (input.charCodeAt(i) & 0xff) << ((i % 4) * 8);
  }
  words[byteLength >>> 2] |= 0x80 << ((byteLength % 4) * 8);
  words[wordCount - 2] = byteLength * 8;
  return words;
}

function toHex(value) {
  let hex = '';
  for (let i = 0; i < 4; i += 1) {
    hex += ((value >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
  }
  return hex;
}

export default function md5(input) {
  const words = toWords(String(input));
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];

  for (let chunk = 0; chunk < words.length; chunk += 16) {
    let [a, b, c, d] = [a0, b0, c0, d0];

    for (let i = 0; i < 64; i += 1) {
      let f;
      let g;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const rotated = rotateLeft((a + f + K[i] + words[chunk + g]) | 0, S[i]);
      [a, d, c, b] = [d, c, b, (b + rotated) | 0];
    }

    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0);
}

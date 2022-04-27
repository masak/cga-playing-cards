/**
* A way to draw CGA images.
*
* @version 1.0
* @author Robert Eisele <robert@xarg.org>
* @copyright Copyright (c) 2010, Robert Eisele
* @link http://www.xarg.org/2010/03/generate-client-side-png-files-using-javascript/
* @license http://www.opensource.org/licenses/bsd-license.php BSD License
*
*/

const SCALE = 3;
const WIDTH = 320 * SCALE;
const HEIGHT = 200 * SCALE;
const DEPTH = 256;

function byte2(w) {
    return String.fromCharCode(
        (w >> 8) & 255,
        w & 255
    );
}

function byte4(w) {
    return String.fromCharCode(
        (w >> 24) & 255,
        (w >> 16) & 255,
        (w >> 8) & 255,
        w & 255
    );
}

function byte2lsb(w) {
    return String.fromCharCode(
        w & 255,
        (w >> 8) & 255
    );
}

// pixel data and row filter identifier size
const pix_size = HEIGHT * (WIDTH + 1);

// deflate header, pix_size, block headers, adler32 checksum
const data_size
    = 2 + pix_size
    + 5 * Math.floor((0xfffe + pix_size) / 0xffff)
    + 4;

// offsets and sizes of Png chunks
const ihdr_offs = 0;
const ihdr_size = 4 + 4 + 13 + 4;
const plte_offs = ihdr_offs + ihdr_size;
const plte_size = 4 + 4 + 3 * DEPTH + 4;
const trns_offs = plte_offs + plte_size;
const trns_size = 4 + 4 + DEPTH + 4;
const idat_offs = trns_offs + trns_size;
const idat_size = 4 + 4 + data_size + 4;
const iend_offs = idat_offs + idat_size;
const iend_size = 4 + 4 + 4;
const buffer_size  = iend_offs + iend_size;

const BASE = 65521; /* largest prime smaller than 65536 */
const NMAX = 5552;  /* NMAX is the largest n such that 255n(n+1)/2 + (n+1)(BASE-1) <= 2^32-1 */

let buffer;

let _crc32 = new Array();

/* Create crc32 lookup table */
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
        if (c & 1) {
            c = -306674912 ^ ((c >> 1) & 0x7fffffff);
        }
        else {
            c = (c >> 1) & 0x7fffffff;
        }
    }
    _crc32[i] = c;
}

function crc32(offset, size) {
    let crc = -1;
    for (let i = 4; i < size-4; i += 1) {
        let index = (crc ^ buffer[offset+i].charCodeAt(0)) & 0xff;
        crc = _crc32[index] ^ ((crc >> 8) & 0x00ffffff);
    }
    write(offset + size - 4, byte4(crc ^ -1));
}

function write(offset, ...args) {
   for (let arg of args) {
        for (let j = 0; j < arg.length; j++) {
            buffer[offset++] = arg.charAt(j);
        }
    }
}

function computeIndex(x, y) {
    let i = y * (WIDTH + 1) + x + 1;
    let j = idat_offs + 8 + 2 + 5 * Math.floor((i / 0xffff) + 1) + i;

    return j;
}

function setPixel(x, y, color) {
    if (typeof color == "undefined") {
        throw new Error("undefined color");
    }

    x |= 0;
    y |= 0;
    if (x < 0 || x > 319 || y < 0 || y > 199) {
        return;
    }

    for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
            let index = computeIndex(
                SCALE * x + dx,
                SCALE * y + dy,
            );
            buffer[index] = color;
        }
    }
}

/* deliberately global variables, leaked from `drawPicture` */
var black;
var cyan;
var magenta;
var white;

function drawPicture(drawFn) {
    let palette = new Object();
    let pindex = 0;

    // initialize buffer with zero bytes
    buffer = new Array();
    for (let i = 0; i < buffer_size; i++) {
        buffer[i] = "\x00";
    }

    // initialize non-zero elements
    write(ihdr_offs, byte4(ihdr_size - 12), 'IHDR',
        byte4(WIDTH), byte4(HEIGHT), "\x08\x03");
    write(plte_offs, byte4(plte_size - 12), 'PLTE');
    write(trns_offs, byte4(trns_size - 12), 'tRNS');
    write(idat_offs, byte4(idat_size - 12), 'IDAT');
    write(iend_offs, byte4(iend_size - 12), 'IEND');

    // initialize deflate header
    let header = ((8 + (7 << 4)) << 8) | (3 << 6);
    header += 31 - (header % 31);

    write(idat_offs + 8, byte2(header));

    // initialize deflate block headers
    for (let i = 0; (i << 16) - 1 < pix_size; i++) {
        let size, bits;
        if (i + 0xffff < pix_size) {
            size = 0xffff;
            bits = "\x00";
        }
        else {
            size = pix_size - (i << 16) - i;
            bits = "\x01";
        }
        write(
            idat_offs + 8 + 2 + (i << 16) + (i << 2),
            bits,
            byte2lsb(size),
            byte2lsb(~size)
        );
    }

    // convert a color and build up the palette
    function color(red, green, blue, alpha) {
        alpha = alpha >= 0
            ? alpha
            : 255;
        let color = (((((alpha << 8) | red) << 8) | green) << 8) | blue;

        if (typeof palette[color] == "undefined") {
            if (pindex == DEPTH)
                return "\x00";

            let ndx = plte_offs + 8 + 3 * pindex;

            buffer[ndx + 0] = String.fromCharCode(red);
            buffer[ndx + 1] = String.fromCharCode(green);
            buffer[ndx + 2] = String.fromCharCode(blue);
            buffer[trns_offs + 8 + pindex] = String.fromCharCode(alpha);

            palette[color] = String.fromCharCode(pindex++);
        }

        return palette[color];
    }

    black = color(0, 0, 0, 0xFF);
    cyan = color(0x55, 0xFF, 0xFF, 0xFF);
    magenta = color(0xFF, 0x55, 0xFF, 0xFF);
    white = color(0xFF, 0xFF, 0xFF, 0xFF);

    drawFn();

    // compute adler32 of output pixels + row filter bytes
    let s1 = 1;
    let s2 = 0;
    let n = NMAX;

    for (let y = 0; y < HEIGHT; y++) {
        for (let x = -1; x < WIDTH; x++) {
            s1 += buffer[computeIndex(x, y)].charCodeAt(0);
            s2 += s1;
            if (--n == 0) {
                s1 %= BASE;
                s2 %= BASE;
                n = NMAX;
            }
        }
    }
    s1 %= BASE;
    s2 %= BASE;
    write(idat_offs + idat_size - 8, byte4((s2 << 16) | s1));

    crc32(ihdr_offs, ihdr_size);
    crc32(plte_offs, plte_size);
    crc32(trns_offs, trns_size);
    crc32(idat_offs, idat_size);
    crc32(iend_offs, iend_size);

    // convert PNG to string
    let content = btoa("\u0089PNG\r\n\u001a\n" + buffer.join(''));

    document.getElementById("canvas").src
        = `data:image/png;base64,${content}`;
}

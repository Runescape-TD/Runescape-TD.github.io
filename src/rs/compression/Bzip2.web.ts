import bzip2 from "bzip2";

export class Bzip2 {
    static bzip2Header = new Uint8Array("BZh1".split("").map((char) => char.charCodeAt(0)));

    static async initWasm(): Promise<void> {
        // Pure JS bzip2 fallback is used directly and safely in browser
    }

    static decompress(compressed: Uint8Array, _actualSize?: number): Int8Array {
        const compressedBzip = new Uint8Array(compressed.length + 4);
        compressedBzip.set(Bzip2.bzip2Header, 0);
        compressedBzip.set(compressed, 4);

        return new Int8Array(bzip2.simple(bzip2.array(compressedBzip)).buffer);
    }
}

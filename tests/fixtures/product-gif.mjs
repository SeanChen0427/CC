// Two 300ms frames with an infinite loop; no customer or third-party assets.
export const productGif = 'R0lGODlhIAAgAIEAAOdbUgAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAHgAAACwAAAAAIAAgAAAINQABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkyhTqlzJUmRAACH5BAEeAAEALAAAAAAgACAAgVKW5wAAAAAAAAAAAAg1AAEIHEiwoMGDCBMqXMiwocOHECNKnEixosWLGDNq3Mixo8ePIEOKHEmypMmTKFOqXMlSZEAAOw==';
export const productGifData = 'data:image/gif;base64,' + productGif;

// Pad with a legal GIF comment extension to exercise real upload-size boundaries.
export function productGifOfSize(size) {
  const source = Buffer.from(productGif, 'base64');
  if (!Number.isInteger(size) || size < source.length + 3) throw new Error('GIF fixture size is too small');
  const bytes = Buffer.alloc(size);
  source.copy(bytes, 0, 0, source.length - 1);
  let offset = source.length - 1;
  bytes[offset++] = 0x21; bytes[offset++] = 0xfe;
  while (size - offset > 2) {
    const remaining = size - offset - 2;
    let count = Math.min(255, remaining - 1);
    if (remaining - count - 1 === 1) count--;
    bytes[offset++] = count; offset += count;
  }
  bytes[offset++] = 0; bytes[offset] = 0x3b;
  return bytes;
}

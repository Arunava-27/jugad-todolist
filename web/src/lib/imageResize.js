// Downscales an image File client-side before upload — the server deliberately
// has no image-processing pipeline (a real dependency + CPU cost not worth it
// on a small droplet, see the attachments-hardening plan), so this is where
// "don't serve full-resolution bytes for a thumbnail" actually gets handled.
// Anything already small, or not a browser-decodable raster format (SVG,
// unusual MIME types canvas can choke on), passes through untouched rather
// than risking a broken/blank re-encode.

const MAX_EDGE = 1920;
const JPEG_QUALITY = 0.85;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export async function resizeImageForUpload(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file; // vector/animated formats: resizing would lose the point of the format
  }

  let img;
  try {
    img = await loadImage(file);
  } catch {
    return file; // couldn't decode — let the server's own validation handle it
  } finally {
    // loadImage's objectURL is revoked once we're done with `img`, below.
  }

  const longestEdge = Math.max(img.naturalWidth, img.naturalHeight);
  if (longestEdge <= MAX_EDGE || !longestEdge) {
    URL.revokeObjectURL(img.src);
    return file; // already small enough (or dimensions unreadable) — leave it alone
  }

  const scale = MAX_EDGE / longestEdge;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) return file; // canvas export failed for some reason — fall back rather than block the upload

  const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
}

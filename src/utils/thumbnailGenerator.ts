/**
 * Generates a lightweight PNG thumbnail from an image blob using an offscreen canvas.
 */
export function generateThumbnailBlob(blob: Blob, maxWidth = 160): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const ratio = img.naturalHeight / img.naturalWidth || 1.375;
      const width = Math.min(maxWidth, img.naturalWidth);
      const height = Math.round(width * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      URL.revokeObjectURL(url);

      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((thumb) => {
        if (thumb) {
          resolve(thumb);
        } else {
          reject(new Error('Failed to convert thumbnail canvas to blob'));
        }
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for thumbnail'));
    };

    img.src = url;
  });
}
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Initialize PDF.js worker using Vite asset URL
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface ProcessedPageItem {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Optimizes an image blob (resizing if exceeds maxDimension)
 */
export async function optimizeImageBlob(
  blob: Blob,
  maxDimension = 1920,
  quality = 0.88
): Promise<ProcessedPageItem> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      // If dimensions are already within limits, keep original blob
      if (width <= maxDimension && height <= maxDimension) {
        resolve({ blob, width, height });
        return;
      }

      // Calculate proportional scale
      if (width > height) {
        if (width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve({ blob, width: img.width, height: img.height });
        return;
      }

      // High quality smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Prefer WebP or high-quality PNG
      canvas.toBlob(
        (resizedBlob) => {
          if (resizedBlob) {
            resolve({ blob: resizedBlob, width, height });
          } else {
            resolve({ blob, width: img.width, height: img.height });
          }
        },
        'image/png',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for optimization'));
    };

    img.src = url;
  });
}

/**
 * Renders all pages of a PDF file to high-resolution PNG Blobs with progress callback
 */
export async function renderPdfToBlobs(
  pdfFile: File,
  options: {
    scale?: number;
    optimize?: boolean;
    maxDimension?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<ProcessedPageItem[]> {
  const scale = options.scale || 1.8; // High-DPI render for sharp vector text
  const arrayBuffer = await pdfFile.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDocument = await loadingTask.promise;
  const totalPages = pdfDocument.numPages;

  const results: ProcessedPageItem[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (options.onProgress) {
      options.onProgress(pageNum, totalPages);
    }

    const page = await pdfDocument.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d', { alpha: false });

    if (!context) {
      continue;
    }

    // White background for documents
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, viewport.width, viewport.height);

    await page.render({
      canvasContext: context,
      canvas: canvas as any,
      viewport,
    } as any).promise;

    const pageBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error(`Failed to render PDF page ${pageNum}`));
      }, 'image/png');
    });

    let finalItem: ProcessedPageItem = {
      blob: pageBlob,
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
    };

    if (options.optimize) {
      finalItem = await optimizeImageBlob(
        finalItem.blob,
        options.maxDimension || 1920
      );
    }

    results.push(finalItem);
  }

  return results;
}

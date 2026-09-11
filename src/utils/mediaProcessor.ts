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
 * Detects the borders of a photographed page/sheet and straightens it via
 * perspective correction, cropping to keep only the area inside the borders.
 *
 * Lightweight pure-canvas implementation. If edges cannot be reliably detected
 * (low contrast, complex background) it returns the original blob unchanged.
 */
export async function detectAndStraightenPage(blob: Blob): Promise<ProcessedPageItem> {
  const img = await loadImage(blob);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  const working = createWorkingCanvas(img);
  const quad = findPageQuadrilateral(working);

  if (!quad) {
    // Fallback: keep original image untouched.
    return { blob, width: origW, height: origH };
  }

  try {
    const result = warpPerspective(img, quad);
    const { canvas, width, height } = result;

    const outBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png', 0.9);
    });

    if (!outBlob) return { blob, width: origW, height: origH };

    return { blob: outBlob, width, height };
  } catch (err) {
    console.warn('Perspective correction failed, using original image:', err);
    return { blob, width: origW, height: origH };
  }
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for edge detection'));
    };
    img.src = url;
  });
}

/**
 * Draws the image into a working canvas (downscaled for speed) and returns
 * both the canvas and its grayscale luminance data.
 */
function createWorkingCanvas(img: HTMLImageElement): {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  lum: Float32Array;
} {
  const maxDim = 1024;
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D not available');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  return { canvas, width: w, height: h, lum };
}

/**
 * Detects the 4 corners (TL, TR, BR, BL) of the dominant bright page region.
 * Returns null when detection is unreliable.
 */
function findPageQuadrilateral(work: {
  width: number;
  height: number;
  lum: Float32Array;
}): { x: number; y: number }[] | null {
  const { width: W, height: H, lum } = work;
  const area = W * H;

  // Binarize using an Otsu threshold (page is brighter than its background).
  const threshold = otsuThreshold(lum, W * H);
  const page = new Uint8Array(W * H); // 1 = candidate page pixel

  for (let i = 0; i < W * H; i++) {
    page[i] = lum[i] >= threshold ? 1 : 0;
  }

  // Remove the background connected to the image borders via flood fill.
  const mask = page.slice();
  const queue: number[] = [];
  const visit = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const idx = y * W + x;
    if (mask[idx] === 1) {
      mask[idx] = 2; // background
      queue.push(idx);
    }
  };
  for (let x = 0; x < W; x++) {
    visit(x, 0);
    visit(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    visit(0, y);
    visit(W - 1, y);
  }
  while (queue.length) {
    const idx = queue.pop()!;
    const x = idx % W;
    const y = (idx / W) | 0;
    visit(x + 1, y);
    visit(x - 1, y);
    visit(x, y + 1);
    visit(x, y - 1);
  }

  // Candidate page pixels are those marked 1 (not swallowed by background).
  const candidate = new Uint8Array(W * H);
  let count = 0;
  for (let i = 0; i < W * H; i++) {
    if (mask[i] === 1) {
      candidate[i] = 1;
      count++;
    }
  }

  // Need a sizeable region to consider it a page.
  if (count < area * 0.2) {
    // Retry with a looser mask (page may touch the borders).
    for (let i = 0; i < W * H; i++) {
      candidate[i] = page[i];
      count = page[i] ? count + 1 : count;
    }
    if (count < area * 0.2) return null;
  }

  // Collect boundary points of the largest connected component.
  const points = largestComponentBoundary(candidate, W, H);
  if (points.length < 4) return null;

  // Convex hull.
  const hull = convexHull(points);

  // Simplify the hull to 4 corners (Ramer-Douglas-Peucker).
  const corners = simplifyToQuad(hull);
  if (!corners || corners.length !== 4) return null;

  const sorted = orderCorners(corners);

  // Sanity: bounding area of the quad must be a meaningful share of the image.
  const quadArea = Math.abs(polygonArea(sorted));
  if (quadArea < area * 0.15) return null;

  return sorted;
}

function otsuThreshold(lum: Float32Array, count: number): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < count; i++) {
    const v = Math.max(0, Math.min(255, lum[i] | 0));
    hist[v]++;
  }

  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let best = 0;
  let maxVariance = -1;

  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = count - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > maxVariance) {
      maxVariance = variance;
      best = i;
    }
  }
  return best;
}

function largestComponentBoundary(
  candidate: Uint8Array,
  W: number,
  H: number
): { x: number; y: number }[] {
  const visited = new Uint8Array(W * H);
  let bestCount = 0;
  let bestPoints: { x: number; y: number }[] = [];

  const flood = (sx: number, sy: number) => {
    const start = sy * W + sx;
    if (!candidate[start] || visited[start]) return;
    const stack = [start];
    visited[start] = 1;
    const boundary: { x: number; y: number }[] = [];
    let cnt = 0;

    while (stack.length) {
      const idx = stack.pop()!;
      cnt++;
      const x = idx % W;
      const y = (idx / W) | 0;
      // Boundary pixel if a 4-neighbour is background or out of range.
      const isBoundary =
        !candidate[idx - 1] || !candidate[idx + 1] || !candidate[idx - W] || !candidate[idx + W] ||
        idx % W === 0 || idx % W === W - 1 || y === 0 || y === H - 1;
      if (isBoundary) boundary.push({ x, y });

      const neighbors = [idx - 1, idx + 1, idx - W, idx + W];
      for (const n of neighbors) {
        if (n < 0 || n >= W * H) continue;
        const nx = n % W;
        const ny = (n / W) | 0;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (candidate[n] && !visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }

    if (cnt > bestCount) {
      bestCount = cnt;
      bestPoints = boundary;
    }
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      flood(x, y);
    }
  }

  return bestPoints;
}

function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  // Andrew's monotone chain.
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (pts.length <= 1) return pts;

  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: { x: number; y: number }[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: { x: number; y: number }[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function simplifyToQuad(hull: { x: number; y: number }[]): { x: number; y: number }[] | null {
  if (hull.length < 4) return null;

  // Perimeter for epsilon scaling.
  let perimeter = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    perimeter += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const epsilon = perimeter * 0.02;
  const simplified = rdp(hull, epsilon);
  return simplified.length === 4 ? simplified : null;
}

function rdp(points: { x: number; y: number }[], epsilon: number): { x: number; y: number }[] {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointToSegmentDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function pointToSegmentDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function orderCorners(corners: { x: number; y: number }[]): { x: number; y: number }[] {
  // Sort by y to split top/bottom, then by x within each group.
  const sortedY = corners.slice().sort((a, b) => a.y - b.y);
  const top = sortedY.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sortedY.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bottom[1], bottom[0]]; // TL, TR, BR, BL
}

function polygonArea(points: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/**
 * Warps the source image so that the given source quadrilateral becomes a
 * rectangle, cropping to the region inside the detected borders.
 */
function warpPerspective(
  img: HTMLImageElement,
  src: { x: number; y: number }[]
): { canvas: HTMLCanvasElement; width: number; height: number } {
  const [tl, tr, br, bl] = src;

  // Destination rectangle based on the average of opposite sides.
  const widthTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const widthBottom = Math.hypot(br.x - bl.x, br.y - bl.y);
  const heightLeft = Math.hypot(bl.y - tl.y, bl.x - tl.x);
  const heightRight = Math.hypot(br.y - tr.y, br.x - tr.x);

  // Map working-space coords back to original resolution (working canvas was
  // downscaled so its max dimension is min(origMax, 1024)).
  const origMax = Math.max(img.naturalWidth, img.naturalHeight);
  const workMax = Math.min(origMax, 1024);
  const s = origMax / Math.max(1, workMax);
  const srcPx = src.map((p) => ({ x: p.x * s, y: p.y * s }));

  const dstW = Math.max(1, Math.round(((widthTop + widthBottom) / 2) * s));
  const dstH = Math.max(1, Math.round(((heightLeft + heightRight) / 2) * s));

  const dst: { x: number; y: number }[] = [
    { x: 0, y: 0 },
    { x: dstW, y: 0 },
    { x: dstW, y: dstH },
    { x: 0, y: dstH },
  ];

  // Homography mapping destination -> source.
  const H = solveHomography(dst, srcPx);
  if (!H) throw new Error('Could not solve homography');

  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');

  // Draw source into an offscreen buffer for sampling.
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.naturalWidth;
  srcCanvas.height = img.naturalHeight;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) throw new Error('Canvas 2D not available');
  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const sD = srcData.data;
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;

  const out = ctx.createImageData(dstW, dstH);
  const oD = out.data;

  const H00 = H[0], H01 = H[1], H02 = H[2];
  const H10 = H[3], H11 = H[4], H12 = H[5];
  const H20 = H[6], H21 = H[7], H22 = H[8];

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const w = H20 * x + H21 * y + H22;
      const sx = (H00 * x + H01 * y + H02) / w;
      const sy = (H10 * x + H11 * y + H12) / w;

      // Bilinear sampling (clamped).
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;

      const i00 = samplePixel(sD, sw, sh, x0, y0);
      const i10 = samplePixel(sD, sw, sh, x0 + 1, y0);
      const i01 = samplePixel(sD, sw, sh, x0, y0 + 1);
      const i11 = samplePixel(sD, sw, sh, x0 + 1, y0 + 1);

      const oi = (y * dstW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = i00[c] * (1 - fx) + i10[c] * fx;
        const bottom = i01[c] * (1 - fx) + i11[c] * fx;
        oD[oi + c] = top * (1 - fy) + bottom * fy;
      }
      oD[oi + 3] = 255;
    }
  }

  ctx.putImageData(out, 0, 0);
  return { canvas, width: dstW, height: dstH };
}

function samplePixel(data: Uint8ClampedArray, w: number, h: number, x: number, y: number): number[] {
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x >= w) x = w - 1;
  if (y >= h) y = h - 1;
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

/**
 * Solves a 3x3 homography (flattened row-major) mapping the src points to dst
 * points using the Direct Linear Transform. Returns null if degenerate.
 */
function solveHomography(
  dst: { x: number; y: number }[],
  src: { x: number; y: number }[]
): number[] | null {
  // Build 8x8 system: each correspondence yields 2 rows.
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const u = src[i].x;
    const v = src[i].y;
    const x = dst[i].x;
    const y = dst[i].y;
    // u = (h0*x + h1*y + h2) / (h6*x + h7*y + 1)
    // v = (h3*x + h4*y + h5) / (h6*x + h7*y + 1)
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const sol = gaussSolve(A, b);
  if (!sol) return null;

  // Normalize so h8 = 1.
  return [sol[0], sol[1], sol[2], sol[3], sol[4], sol[5], sol[6], sol[7], 1];
}

function gaussSolve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => row.concat([b[i]]));

  for (let col = 0; col < n; col++) {
    // Partial pivot.
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) {
        M[r][c] -= factor * M[col][c];
      }
    }
  }

  const x: number[] = [];
  for (let i = 0; i < n; i++) {
    x.push(M[i][n] / M[i][i]);
  }
  return x;
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

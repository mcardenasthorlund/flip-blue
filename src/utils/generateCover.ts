export interface GenerateCoverOptions {
  title: string;
  description: string;
  brandName?: string;
  primaryColor: string;
  width?: number;
  height?: number;
}

export interface GeneratedCover {
  blob: Blob;
  width: number;
  height: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function shade(hex: string, percent: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  const amt = Math.round(2.55 * percent);
  const r = clamp((num >> 16) + amt);
  const g = clamp(((num >> 8) & 0xff) + amt);
  const b = clamp((num & 0xff) + amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Generates a generic PNG cover (title + description) using an offscreen canvas.
 */
export function generateCoverBlob(opts: GenerateCoverOptions): Promise<GeneratedCover> {
  const width = opts.width || 800;
  const height = opts.height || 1100;

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }

    const base = opts.primaryColor || '#2563EB';
    const lighter = shade(base, 18);
    const darker = shade(base, -22);

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, lighter);
    grad.addColorStop(0.5, base);
    grad.addColorStop(1, darker);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Decorative geometric frame
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 3;
    const margin = Math.round(width * 0.075);
    ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 2);

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // Brand name at top
    if (opts.brandName) {
      ctx.font = `600 ${Math.round(width * 0.032)}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillText(opts.brandName.toUpperCase(), width / 2, height * 0.14);
    }

    // Title (wrapped, centered vertically)
    ctx.fillStyle = '#FFFFFF';
    const titleSize = Math.round(width * 0.075);
    ctx.font = `bold ${titleSize}px system-ui, sans-serif`;
    const titleLines = wrapText(ctx, opts.title || 'Sin título', width * 0.8);
    const lineHeight = titleSize * 1.25;
    let currentY = height * 0.38 - ((titleLines.length - 1) * lineHeight) / 2;

    for (const line of titleLines) {
      ctx.fillText(line, width / 2, currentY);
      currentY += lineHeight;
    }

    // Divider accent
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    const dividerW = Math.round(width * 0.2);
    ctx.fillRect(width / 2 - dividerW / 2, currentY + lineHeight * 0.5, dividerW, Math.max(3, Math.round(width * 0.006)));

    // Description (wrapped)
    if (opts.description) {
      ctx.font = `500 ${Math.round(width * 0.04)}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      const descLines = wrapText(ctx, opts.description, width * 0.78);
      const descLineHeight = Math.round(width * 0.056);
      let descY = currentY + lineHeight * 1.6;

      for (const line of descLines) {
        ctx.fillText(line, width / 2, descY);
        descY += descLineHeight;
      }
    }

    // Footer
    ctx.font = `${Math.round(width * 0.028)}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText('FLIPBLUE • PUBLICACIÓN INTERACTIVA', width / 2, height - height * 0.08);

    canvas.toBlob((blob) => {
      if (blob) {
        resolve({ blob, width, height });
      } else {
        reject(new Error('Failed to convert cover canvas to blob'));
      }
    }, 'image/png');
  });
}
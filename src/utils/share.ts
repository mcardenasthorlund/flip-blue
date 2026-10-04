import { exportBookAsShareZip } from '../db/db';

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/** Whether the browser supports the native Web Share API with files (Option A). */
export function canNativeShare(): boolean {
  if (typeof navigator === 'undefined') return false;
  return typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
}

/**
 * Builds a single-book ZIP and shares it via the native share sheet (WhatsApp,
 * Telegram, email, ...). Falls back to a direct download when native file
 * sharing is unavailable or rejected.
 */
export async function shareBookFile(bookId: number, title: string): Promise<ShareOutcome> {
  const blob = await exportBookAsShareZip(bookId);

  const safeTitle = (title || 'libro')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'libro';
  const fileName = `${safeTitle}.flipblue`;
  const file = new File([blob], fileName, { type: 'application/zip' });

  const nav = navigator;
  if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await nav.share({
        files: [file],
        title,
        text: `Libro compartido desde FlipBlue: ${title}`,
      });
      return 'shared';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled';
      // Any other error → fall through to download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  return 'downloaded';
}
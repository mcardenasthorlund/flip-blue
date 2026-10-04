import { restoreFullBackup } from '../db/db';

interface LaunchParams {
  files: FileSystemFileHandle[];
}

interface LaunchQueue {
  setConsumer(consumer: (launchParams: LaunchParams) => void): void;
}

interface WindowWithLaunchQueue extends Window {
  launchQueue?: LaunchQueue;
}

export interface BookImportResult {
  booksRestored: number;
  pagesRestored: number;
}

/**
 * Registers the File Handling API consumer so an installed PWA can receive a
 * `.flipblue.zip` directly from the system's "Abrir con FlipBlue" (Option C).
 * The file is restored and the callback is invoked once the import finishes.
 */
export function registerIncomingBookHandler(
  onBookImported: (result: BookImportResult) => void
): void {
  const w = window as WindowWithLaunchQueue;
  if (w.launchQueue && typeof w.launchQueue.setConsumer === 'function') {
    w.launchQueue.setConsumer(async (launchParams) => {
      try {
        const handle = launchParams.files?.[0];
        if (!handle) return;
        const file = await handle.getFile();
        const result = await restoreFullBackup(file);
        onBookImported(result);
      } catch (err) {
        console.error('Import from file handler failed:', err);
      }
    });
  }
}
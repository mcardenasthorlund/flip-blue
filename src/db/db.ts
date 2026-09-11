import Dexie, { type EntityTable } from 'dexie';
import JSZip from 'jszip';
import type { BookRecord, FolderRecord, PageRecord } from '../types';

export class FlipBlueDB extends Dexie {
  books!: EntityTable<BookRecord, 'id'>;
  pages!: EntityTable<PageRecord, 'id'>;
  folders!: EntityTable<FolderRecord, 'id'>;

  constructor() {
    super('FlipBlueDB');
    this.version(1).stores({
      books: '++id, title, createdAt, updatedAt',
      pages: '++id, bookId, pageNumber',
    });
    this.version(2).stores({
      books: '++id, title, createdAt, updatedAt, folderId',
      pages: '++id, bookId, pageNumber',
      folders: '++id, name, parentId, createdAt, updatedAt',
    });
  }
}

export const db = new FlipBlueDB();

/** Format page number to 3-digit padded filename: 1 -> 001.png */
export function formatPageFileName(pageNumber: number): string {
  return `${pageNumber.toString().padStart(3, '0')}.png`;
}

/** Get all books ordered by updated date descending */
export async function getAllBooks(): Promise<BookRecord[]> {
  return await db.books.orderBy('updatedAt').reverse().toArray();
}

/** Get a single book by id */
export async function getBook(id: number): Promise<BookRecord | undefined> {
  return await db.books.get(id);
}

/** Get all pages of a book ordered by pageNumber */
export async function getBookPages(bookId: number): Promise<PageRecord[]> {
  return await db.pages.where('bookId').equals(bookId).sortBy('pageNumber');
}

// ---------------------------------------------------------------------------
// Folder management
// ---------------------------------------------------------------------------

/** Get all folders (for building trees/breadcrumbs) */
export async function getAllFolders(): Promise<FolderRecord[]> {
  return await db.folders.toArray();
}

/** Get a single folder by id */
export async function getFolder(id: number): Promise<FolderRecord | undefined> {
  return await db.folders.get(id);
}

/** Get child folders of a given parent (null = root level) */
export async function getChildFolders(parentId?: number | null): Promise<FolderRecord[]> {
  const all = await getAllFolders();
  return all
    .filter((f) => (f.parentId == null ? parentId == null : f.parentId === parentId))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Create a new folder and return its id */
export async function addFolder(name: string, parentId?: number | null): Promise<number> {
  const now = Date.now();
  return await db.folders.add({
    name: name.trim() || 'Nueva carpeta',
    parentId: parentId ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

/** Rename a folder */
export async function renameFolder(id: number, name: string): Promise<void> {
  await db.folders.update(id, {
    name: name.trim() || 'Nueva carpeta',
    updatedAt: Date.now(),
  });
}

/** Get all descendant folder ids of a folder (for cycle protection / cascade) */
export async function getAllFolderIdsUnder(folderId: number): Promise<number[]> {
  const all = await getAllFolders();
  const ids: number[] = [];
  const collect = (pid: number) => {
    all
      .filter((f) => f.parentId === pid)
      .forEach((f) => {
        if (f.id) {
          ids.push(f.id);
          collect(f.id);
        }
      });
  };
  collect(folderId);
  return ids;
}

/**
 * Delete a folder and all its descendant folders.
 * Books inside the deleted tree are moved up to the deleted folder's parent (or root).
 */
export async function deleteFolder(folderId: number): Promise<void> {
  const folder = await getFolder(folderId);
  const parentId = folder?.parentId ?? null;
  const ids = [folderId, ...(await getAllFolderIdsUnder(folderId))];

  await db.transaction('rw', [db.folders, db.books], async () => {
    await db.books.where('folderId').anyOf(ids).modify({ folderId: parentId });
    await db.folders.bulkDelete(ids);
  });
}

/** Move a folder to a new parent (newParentId null = root) */
export async function moveFolder(folderId: number, newParentId?: number | null): Promise<void> {
  await db.folders.update(folderId, {
    parentId: newParentId ?? null,
    updatedAt: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Folder-aware book queries & movement
// ---------------------------------------------------------------------------

/** Get all books at a given level (folderId null = loose books at that level) */
export async function getBooksByFolder(folderId?: number | null): Promise<BookRecord[]> {
  if (folderId == null) {
    return await db.books
      .filter((b) => b.folderId == null)
      .toArray()
      .then((arr) => arr.sort((a, b) => b.updatedAt - a.updatedAt));
  }
  return await db.books
    .where('folderId')
    .equals(folderId)
    .toArray()
    .then((arr) => arr.sort((a, b) => b.updatedAt - a.updatedAt));
}

/** Move a book to a folder (folderId null = root level) */
export async function moveBook(bookId: number, folderId?: number | null): Promise<void> {
  await db.books.update(bookId, { folderId: folderId ?? null });
}

/**
 * Save a new book or update existing book and its pages.
 * Renames all pages sequentially to 001.png, 002.png inside the DB.
 */
export async function saveBook(
  bookData: {
    id?: number;
    title: string;
    description: string;
    primaryColor?: string;
    brandName?: string;
    hardCover?: boolean;
    singlePageMode?: boolean;
    folderId?: number | null;
  },
  pageItems: {
    blob: Blob;
    width?: number;
    height?: number;
  }[]
): Promise<number> {
  return await db.transaction('rw', [db.books, db.pages], async () => {
    const now = Date.now();
    const coverBlob = pageItems.length > 0 ? pageItems[0].blob : undefined;

    let bookId = bookData.id;
    if (bookId) {
      // Update existing book metadata
      await db.books.update(bookId, {
        title: bookData.title.trim() || 'Untitled Book',
        description: bookData.description.trim() || '',
        primaryColor: bookData.primaryColor || '#2563EB',
        brandName: bookData.brandName?.trim() || '',
        hardCover: bookData.hardCover ?? true,
        singlePageMode: bookData.singlePageMode ?? false,
        pageCount: pageItems.length,
        updatedAt: now,
        coverBlob,
      });

      // Clear existing pages for this book to ensure complete fresh sequence
      await db.pages.where('bookId').equals(bookId).delete();
    } else {
      // Create new book
      bookId = await db.books.add({
        title: bookData.title.trim() || 'Untitled Book',
        description: bookData.description.trim() || '',
        primaryColor: bookData.primaryColor || '#2563EB',
        brandName: bookData.brandName?.trim() || '',
        hardCover: bookData.hardCover ?? true,
        singlePageMode: bookData.singlePageMode ?? false,
        pageCount: pageItems.length,
        folderId: bookData.folderId ?? null,
        createdAt: now,
        updatedAt: now,
        coverBlob,
      });
    }

    // Insert pages sequentially renamed to 001.png, 002.png...
    const pageRecords: PageRecord[] = pageItems.map((item, index) => {
      const pageNumber = index + 1;
      return {
        bookId: bookId!,
        pageNumber,
        fileName: formatPageFileName(pageNumber),
        blob: item.blob,
        width: item.width,
        height: item.height,
      };
    });

    if (pageRecords.length > 0) {
      await db.pages.bulkAdd(pageRecords);
    }

    return bookId!;
  });
}

/**
 * Clone an existing book and duplicate all its pages
 */
export async function cloneBook(bookId: number): Promise<number> {
  const original = await getBook(bookId);
  if (!original) {
    throw new Error('Publicación no encontrada');
  }

  const originalPages = await getBookPages(bookId);

  return await saveBook(
    {
      title: `${original.title} (Copia)`,
      description: original.description,
      primaryColor: original.primaryColor,
      brandName: original.brandName,
      hardCover: original.hardCover,
      singlePageMode: original.singlePageMode,
      folderId: original.folderId ?? null,
    },
    originalPages.map((p) => ({
      blob: p.blob,
      width: p.width,
      height: p.height,
    }))
  );
}

/**
 * Delete a book and trigger full cleanup of all associated Image Blobs in IndexedDB.
 */
export async function deleteBook(bookId: number): Promise<void> {
  await db.transaction('rw', [db.books, db.pages], async () => {
    // Delete all associated page image blobs
    await db.pages.where('bookId').equals(bookId).delete();
    // Delete book record
    await db.books.delete(bookId);
  });
}

/**
 * Exports a full database backup as a single ZIP file containing JSON metadata and image assets
 */
export async function exportFullBackup(): Promise<Blob> {
  const books = await getAllBooks();
  const folders = await getAllFolders();
  const zip = new JSZip();

  const manifestData: {
    version: number;
    exportedAt: string;
    folders: Array<Omit<FolderRecord, 'id'> & { id: number }>;
    books: Array<Omit<BookRecord, 'coverBlob'> & { tempKey: string; pages: Array<Omit<PageRecord, 'blob'>> }>;
  } = {
    version: 2,
    exportedAt: new Date().toISOString(),
    folders: [],
    books: [],
  };

  manifestData.folders = folders.map((f) => ({
    id: f.id!,
    name: f.name,
    parentId: f.parentId ?? null,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }));

  for (let bIdx = 0; bIdx < books.length; bIdx++) {
    const book = books[bIdx];
    if (!book.id) continue;

    const pages = await getBookPages(book.id);
    const bookKey = `book_${book.id}_${Date.now()}`;
    const bookFolder = zip.folder(`books/${bookKey}`);

    const pagesMeta: Array<Omit<PageRecord, 'blob'>> = [];

    for (const page of pages) {
      const pageFileName = page.fileName || formatPageFileName(page.pageNumber);
      if (bookFolder) {
        bookFolder.file(pageFileName, page.blob);
      }
      pagesMeta.push({
        id: page.id,
        bookId: page.bookId,
        pageNumber: page.pageNumber,
        fileName: pageFileName,
        width: page.width,
        height: page.height,
      });
    }

    manifestData.books.push({
      id: book.id,
      title: book.title,
      description: book.description,
      pageCount: book.pageCount,
      primaryColor: book.primaryColor,
      brandName: book.brandName,
      hardCover: book.hardCover,
      singlePageMode: book.singlePageMode,
      folderId: book.folderId ?? null,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
      tempKey: bookKey,
      pages: pagesMeta,
    });
  }

  zip.file('backup-manifest.json', JSON.stringify(manifestData, null, 2));

  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * Restores all books and pages from a backup ZIP file
 */
export async function restoreFullBackup(
  backupZipBlob: Blob
): Promise<{ booksRestored: number; pagesRestored: number }> {
  const zip = await JSZip.loadAsync(backupZipBlob);
  const manifestFile = zip.file('backup-manifest.json');

  if (!manifestFile) {
    throw new Error('El archivo seleccionado no es una copia de seguridad válida de FlipBlue (falta manifest).');
  }

  const manifestJson = await manifestFile.async('string');
  const manifest = JSON.parse(manifestJson);

  let booksRestored = 0;
  let pagesRestored = 0;

  // Restore folders first (mapping backup ids -> new ids)
  const folderIdMap = new Map<number, number>();
  const backupFolders: Array<{ id: number; name: string; parentId?: number | null; createdAt: number; updatedAt: number }> =
    manifest.folders || [];
  // Ensure parents are created before children
  backupFolders.sort((a, b) => {
    const depth = (f: { id: number; parentId?: number | null }) => {
      let d = 0;
      let cur = f;
      const seen = new Set<number>();
      while (cur.parentId != null && !seen.has(cur.id)) {
        seen.add(cur.id);
        d++;
        const p = backupFolders.find((x) => x.id === cur.parentId);
        if (!p) break;
        cur = p;
      }
      return d;
    };
    return depth(a) - depth(b);
  });
  for (const f of backupFolders) {
    const newParentId = f.parentId != null ? folderIdMap.get(f.parentId) : null;
    const newId = await addFolder(f.name, newParentId);
    folderIdMap.set(f.id, newId);
  }

  for (const bookMeta of manifest.books) {
    const pageItems: { blob: Blob; width?: number; height?: number }[] = [];

    for (const pageMeta of bookMeta.pages) {
      const filePath = `books/${bookMeta.tempKey}/${pageMeta.fileName}`;
      const fileInZip = zip.file(filePath);

      if (fileInZip) {
        const pageBlob = await fileInZip.async('blob');
        pageItems.push({
          blob: pageBlob,
          width: pageMeta.width,
          height: pageMeta.height,
        });
      }
    }

    if (pageItems.length > 0) {
      await saveBook(
        {
          title: bookMeta.title,
          description: bookMeta.description,
          primaryColor: bookMeta.primaryColor,
          brandName: bookMeta.brandName,
          hardCover: bookMeta.hardCover,
          singlePageMode: bookMeta.singlePageMode,
          folderId: bookMeta.folderId != null ? folderIdMap.get(bookMeta.folderId) ?? null : null,
        },
        pageItems
      );
      booksRestored++;
      pagesRestored += pageItems.length;
    }
  }

  return { booksRestored, pagesRestored };
}


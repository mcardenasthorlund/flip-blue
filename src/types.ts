export interface BookRecord {
  id?: number;
  title: string;
  description: string;
  pageCount: number;
  createdAt: number;
  updatedAt: number;
  coverBlob?: Blob;
  primaryColor?: string; // Hex color (e.g. #2563EB)
  brandName?: string;    // Custom author / company brand
  hardCover?: boolean;   // Rigid covers for first & last pages
  singlePageMode?: boolean; // Default single page vs double spread
}

export interface PageRecord {
  id?: number;
  bookId: number;
  pageNumber: number; // 1, 2, 3...
  fileName: string;   // 001.png, 002.png...
  blob: Blob;
  width?: number;
  height?: number;
}

export type AppView = 'dashboard' | 'editor' | 'reader';

export interface EditorPageState {
  id?: number;
  tempId: string;
  pageNumber: number;
  fileName: string;
  blob: Blob;
  previewUrl: string;
  width?: number;
  height?: number;
  isNew?: boolean;
}

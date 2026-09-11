import {
  addFolder,
  cloneBook,
  deleteBook,
  deleteFolder,
  exportFullBackup,
  getAllBooks,
  getAllFolders,
  getBookPages,
  moveBook,
  moveFolder,
  renameFolder,
  restoreFullBackup,
} from '../db/db';
import { exportBookAsZip } from '../utils/exportGenerator';
import { showToast } from '../components/Toast';
import { showWelcome } from '../components/WelcomeModal';
import type { BookRecord, FolderRecord } from '../types';

export interface DashboardCallbacks {
  onNewBook: (folderId?: number | null) => void;
  onEditBook: (bookId: number) => void;
  onReadBook: (bookId: number) => void;
}

interface FolderOption {
  id: number | null;
  name: string;
  depth: number;
}

export class DashboardView {
  private container: HTMLElement;
  private callbacks: DashboardCallbacks;
  private books: BookRecord[] = [];
  private allFolders: FolderRecord[] = [];
  private currentFolderId: number | null = null;
  private searchQuery = '';
  private coverUrlMap = new Map<number, string>();
  private isLoading = true;
  private viewMode: 'grid' | 'list' = 'grid';
  private static STORAGE_KEY = 'flipblue-dashboard-view-mode';

  constructor(callbacks: DashboardCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.className = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full';
    const saved = localStorage.getItem(DashboardView.STORAGE_KEY);
    this.viewMode = saved === 'list' ? 'list' : 'grid';
  }

  getElement(): HTMLElement {
    return this.container;
  }

  /** Trigger the restore file picker (used from the mobile hamburger menu) */
  public triggerRestore() {
    const input = this.container.querySelector<HTMLInputElement>('#dash-restore-input');
    if (input) {
      input.click();
    }
  }

  private get currentFolders(): FolderRecord[] {
    return this.allFolders
      .filter((f) => (f.parentId == null ? this.currentFolderId == null : f.parentId === this.currentFolderId))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  private get currentBooks(): BookRecord[] {
    return this.books
      .filter((b) => (b.folderId == null ? this.currentFolderId == null : b.folderId === this.currentFolderId))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private get breadcrumbPath(): FolderRecord[] {
    const path: FolderRecord[] = [];
    let cur = this.allFolders.find((f) => f.id === this.currentFolderId);
    while (cur) {
      path.unshift(cur);
      cur = cur.parentId != null ? this.allFolders.find((f) => f.id === cur!.parentId) : undefined;
    }
    return path;
  }

  async load() {
    this.isLoading = true;
    this.render();
    try {
      this.allFolders = await getAllFolders();
      this.books = await getAllBooks();

      // Verify current folder still exists (may have been deleted elsewhere)
      if (this.currentFolderId != null && !this.allFolders.some((f) => f.id === this.currentFolderId)) {
        this.currentFolderId = null;
      }

      // Revoke previously generated object URLs to prevent memory leaks
      this.coverUrlMap.forEach((url) => URL.revokeObjectURL(url));
      this.coverUrlMap.clear();

      this.currentBooks.forEach((book) => {
        if (book.coverBlob && book.id) {
          const url = URL.createObjectURL(book.coverBlob);
          this.coverUrlMap.set(book.id, url);
        }
      });
    } catch (err) {
      console.error('Failed to load books:', err);
      showToast({ message: 'Failed to load library from IndexedDB', type: 'error' });
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  destroy() {
    this.coverUrlMap.forEach((url) => URL.revokeObjectURL(url));
    this.coverUrlMap.clear();
  }

  private render() {
    if (this.isLoading) {
      this.container.innerHTML = `
        <div class="flex flex-col items-center justify-center min-h-[400px] text-slate-400">
          <div class="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p class="text-sm font-medium">Accessing local IndexedDB storage...</p>
        </div>
      `;
      return;
    }

    const currentFolders = this.currentFolders;
    const currentBooks = this.currentBooks;
    const filteredFolders = currentFolders.filter((f) =>
      f.name.toLowerCase().includes(this.searchQuery.toLowerCase())
    );
    const filteredBooks = currentBooks.filter(
      (b) =>
        b.title.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        b.description.toLowerCase().includes(this.searchQuery.toLowerCase())
    );

    const folderBookCount = (folderId: number | undefined) => this.countBooksInTree(folderId);

    const totalPagesHere = currentBooks.reduce((sum, b) => sum + (b.pageCount || 0), 0);
    const currentFolder = this.currentFolderId != null
      ? this.allFolders.find((f) => f.id === this.currentFolderId)
      : undefined;

    this.container.innerHTML = `
      <!-- Dashboard Top Header -->
      <div class="mb-6">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
              <span>${currentFolder ? escapeHtml(currentFolder.name) : 'Publicaciones locales'}</span>
            </h1>
            <p class="mt-1 text-sm text-slate-500">
              Gestiona flipbooks interactivos en carpetas locales de IndexedDB. Exporta paquetes web autónomos sin servidores.
            </p>
          </div>

          <!-- Backup & Restore Global Actions -->
          <div class="hidden sm:flex items-center gap-2">
            <button id="dash-backup-btn" class="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer" title="Descargar copia de seguridad con todos los libros, carpetas e imágenes">
              <svg class="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Copia de seguridad</span>
            </button>

            <label for="dash-restore-input" class="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer" title="Restaurar libros desde un archivo de copia previa">
              <svg class="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <span>Restaurar copia</span>
            </label>
            <input type="file" id="dash-restore-input" accept=".zip,.flipbackup" class="hidden" />
          </div>
        </div>

        <!-- Navigation & Toolbar Strip -->
        <div class="mt-5 bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col gap-3">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-3">
              <button id="dash-new-folder-btn" class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold shadow-sm shadow-blue-200 transition cursor-pointer" title="Crear una carpeta aquí">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  <line x1="12" y1="11" x2="12" y2="17"></line>
                  <line x1="9" y1="14" x2="15" y2="14"></line>
                </svg>
                <span>Nueva carpeta</span>
              </button>
              <button id="dash-new-book-btn" class="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#2563EB] text-xs font-semibold shadow-2xs transition cursor-pointer" title="Crear un libro dentro de esta carpeta">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path>
                  <line x1="12" y1="8" x2="12" y2="16"></line>
                  <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
                <span>Nuevo libro aquí</span>
              </button>
            </div>

            <div class="hidden sm:flex items-center gap-4 text-xs font-medium text-slate-500 px-2 shrink-0">
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-[#2563EB]"></span>
                <span><strong class="text-slate-800 font-semibold">${totalPagesHere}</strong> Páginas</span>
              </div>
              <div class="h-4 w-px bg-slate-200"></div>
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>IndexedDB activo</span>
              </div>
            </div>
          </div>

          <!-- Breadcrumb + Search + View toggle -->
          <div class="flex flex-col sm:flex-row sm:items-center gap-2">
            <!-- Breadcrumb -->
            <div class="flex items-center gap-1 text-xs font-semibold text-slate-500 min-w-0 flex-wrap">
              ${
                this.currentFolderId != null
                  ? `<button data-nav="root" class="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-100 hover:text-[#2563EB] transition cursor-pointer" title="Volver a la raíz">
                      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                      </svg>
                      <span>Biblioteca</span>
                    </button>
                    <button id="dash-up-btn" class="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer" title="Subir un nivel">
                      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="19" y1="12" x2="5" y2="12"></line>
                        <polyline points="12 19 5 12 12 5"></polyline>
                      </svg>
                    </button>`
                  : ''
              }
              ${this.breadcrumbPath
                .map((f) => {
                  const isLast = f.id === this.currentFolderId;
                  return `
                    <div class="flex items-center gap-1 min-w-0">
                      <span class="text-slate-300">/</span>
                      <button
                        data-nav="${f.id}"
                        class="flex items-center gap-1 px-1.5 py-1 rounded-md truncate max-w-[140px] transition cursor-pointer ${
                          isLast ? 'text-[#2563EB] bg-blue-50 font-bold' : 'hover:bg-slate-100 hover:text-slate-900'
                        }"
                        title="${escapeHtml(f.name)}"
                      >
                        <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span class="truncate">${escapeHtml(f.name)}</span>
                      </button>
                    </div>
                  `;
                })
                .join('')}
            </div>

            <!-- Search -->
            <div class="relative flex-1 min-w-0">
              <svg class="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                id="dash-search"
                type="text"
                placeholder="Buscar en esta carpeta..."
                value="${escapeHtml(this.searchQuery)}"
                class="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 hover:bg-slate-100/80 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB] rounded-lg border border-slate-200 transition-all"
              />
            </div>

            <!-- View Mode Toggle -->
            <div class="flex items-center gap-1 bg-slate-100 rounded-lg p-1 shrink-0">
              <button
                id="dash-view-grid"
                class="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${this.viewMode === 'grid' ? 'bg-white text-[#2563EB] shadow-sm' : 'text-slate-500 hover:text-slate-700'}"
                title="Vista en cuadrícula"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect width="7" height="7" x="3" y="3" rx="1"></rect>
                  <rect width="7" height="7" x="14" y="3" rx="1"></rect>
                  <rect width="7" height="7" x="14" y="14" rx="1"></rect>
                  <rect width="7" height="7" x="3" y="14" rx="1"></rect>
                </svg>
              </button>
              <button
                id="dash-view-list"
                class="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${this.viewMode === 'list' ? 'bg-white text-[#2563EB] shadow-sm' : 'text-slate-500 hover:text-slate-700'}"
                title="Vista horizontal (lista)"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <line x1="3" y1="6" x2="3.01" y2="6"></line>
                  <line x1="3" y1="12" x2="3.01" y2="12"></line>
                  <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Folder Grid -->
      ${
        filteredFolders.length > 0
          ? `
        <div class="mb-8">
          <div class="flex items-center gap-2 mb-3">
            <h2 class="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              Carpetas
            </h2>
            <span class="text-[10px] font-semibold text-slate-400">${filteredFolders.length}</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            ${filteredFolders.map((f) => this.renderFolderCard(f, folderBookCount(f.id))).join('')}
          </div>
        </div>
      `
          : ''
      }

      <!-- Book Grid or Empty State -->
      ${
        filteredBooks.length === 0
          ? `
        <div class="text-center py-16 px-4 bg-white rounded-2xl border border-dashed border-slate-200 shadow-xs">
          <div class="w-14 h-14 mx-auto rounded-xl bg-blue-50 flex items-center justify-center text-[#2563EB] mb-4">
            <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path>
              <path d="M6 6h10"></path>
              <path d="M6 10h10"></path>
            </svg>
          </div>
          <h2 class="text-lg font-bold text-slate-900">${this.searchQuery ? 'No se encontraron publicaciones' : 'Esta carpeta está vacía'}</h2>
          <p class="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            ${
              this.searchQuery
                ? 'Prueba con otra palabra clave o limpia el campo de búsqueda.'
                : currentFolder
                  ? 'Crea una subcarpeta o un nuevo libro dentro de esta carpeta.'
                  : 'Haz clic en "Nuevo libro aquí" o "Nueva carpeta" para empezar.'
            }
          </p>
        </div>
      `
          : this.viewMode === 'list'
            ? `
        <div class="flex flex-col gap-4">
          ${filteredBooks.map((book) => this.renderBookRow(book)).join('')}
        </div>
      `
            : `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          ${filteredBooks.map((book) => this.renderBookCard(book)).join('')}
        </div>
      `
      }

      <!-- Footer -->
      <footer class="mt-12 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div class="flex items-center gap-2 text-xs text-slate-500">
          <span class="w-5 h-5 bg-[#2563EB] rounded flex items-center justify-center shrink-0">
            <div class="w-2.5 h-3 border-2 border-white rounded-xs transform -skew-x-6"></div>
          </span>
          <span>
            Proyecto creado por
            <a href="https://nuevasideas.es" target="_blank" rel="noopener noreferrer" class="font-semibold text-[#2563EB] hover:text-blue-700 hover:underline transition-colors">Manuel Cárdenas Thorlund</a>
          </span>
        </div>
        <div class="flex items-center gap-1.5 text-xs text-slate-500">
          <span class="text-[10px] font-mono text-slate-400">v0.5-beta</span>
          <span class="w-1 h-1 rounded-full bg-slate-300"></span>
          <span>
            Licencia
            <a href="/LICENSE" target="_blank" rel="noopener noreferrer" class="font-semibold text-slate-600 hover:text-slate-900 hover:underline transition-colors">MIT</a>
          </span>
          <span class="w-1 h-1 rounded-full bg-slate-300"></span>
          <button id="dash-welcome-btn" class="font-semibold text-slate-600 hover:text-[#2563EB] hover:underline transition-colors cursor-pointer" title="Volver a ver el tutorial de bienvenida">
            Guía de inicio
          </button>
        </div>
      </footer>
    `;

    // Bind event listeners
    this.elementEvents();
  }

  private renderFolderCard(folder: FolderRecord, bookCount: number): string {
    return `
      <div class="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-200 flex flex-col" data-folder-id="${folder.id}">
        <div class="relative aspect-[4/3] bg-gradient-to-br from-blue-50 to-indigo-50/60 overflow-hidden cursor-pointer border-b border-slate-100 w-full text-left group-folder-open" role="button" tabindex="0" data-folder-action="open">
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[#2563EB] pointer-events-none">
            <svg class="w-14 h-14 drop-shadow-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="text-[11px] font-bold text-slate-600 bg-white/80 px-2 py-0.5 rounded-full shadow-xs">
              ${bookCount} ${bookCount === 1 ? 'libro' : 'libros'}
            </span>
          </div>
          <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <button data-folder-action="rename" title="Renombrar carpeta" class="p-1.5 rounded-md bg-white/95 hover:bg-white text-slate-600 hover:text-[#2563EB] shadow-xs transition cursor-pointer">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
              </svg>
            </button>
            <button data-folder-action="move" title="Mover carpeta" class="p-1.5 rounded-md bg-white/95 hover:bg-white text-slate-600 hover:text-[#2563EB] shadow-xs transition cursor-pointer">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
            </button>
            <button data-folder-action="delete" title="Eliminar carpeta" class="p-1.5 rounded-md bg-white/95 hover:bg-white text-slate-600 hover:text-red-600 shadow-xs transition cursor-pointer">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="p-3">
          <h3 class="font-bold text-sm text-slate-900 line-clamp-1 group-hover:text-[#2563EB] transition-colors" title="${escapeHtml(folder.name)}">
            ${escapeHtml(folder.name)}
          </h3>
          <p class="text-[11px] text-slate-400 mt-0.5">
            ${bookCount} ${bookCount === 1 ? 'publicación' : 'publicaciones'} &bull; ${this.subFolderCount(folder.id)} subcarpetas
          </p>
        </div>
      </div>
    `;
  }

  private subFolderCount(folderId: number | undefined): number {
    return this.allFolders.filter((f) => f.parentId === folderId).length;
  }

  private countFolderTree(folderId: number | undefined): number {
    let count = 0;
    const collect = (pid: number | undefined) => {
      this.allFolders
        .filter((f) => f.parentId === pid)
        .forEach((f) => {
          count++;
          collect(f.id);
        });
    };
    collect(folderId);
    return count;
  }

  private countBooksInTree(folderId: number | undefined): number {
    const ids = new Set<number>();
    if (folderId != null) ids.add(folderId);
    const collect = (pid: number | undefined) => {
      this.allFolders
        .filter((f) => f.parentId === pid)
        .forEach((f) => {
          if (f.id != null) {
            ids.add(f.id);
            collect(f.id);
          }
        });
    };
    collect(folderId);
    return this.books.filter((b) => (b.folderId != null ? ids.has(b.folderId) : false)).length;
  }

  private renderBookCard(book: BookRecord): string {
    const coverUrl = book.id ? this.coverUrlMap.get(book.id) : undefined;
    const dateFormatted = new Date(book.updatedAt).toLocaleDateString('es-ES', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return `
      <div class="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-200 flex flex-col justify-between" data-book-id="${book.id}">
        <!-- Cover Thumbnail & Aspect Container -->
        <div class="relative aspect-3/4 bg-slate-100 overflow-hidden cursor-pointer border-b border-slate-100" data-action="read">
          ${
            coverUrl
              ? `<img src="${coverUrl}" alt="${escapeHtml(book.title)}" class="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300" />`
              : `<div class="w-full h-full flex flex-col items-center justify-center p-6 text-slate-400 bg-slate-50">
                  <svg class="w-12 h-12 mb-2 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path>
                  </svg>
                  <span class="text-xs font-medium">Sin imagen de portada</span>
                </div>`
          }

          <!-- Floating Cover Badges -->
          <div class="absolute top-3 left-3 flex items-center gap-1.5">
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/95 text-slate-700 shadow-xs border border-slate-200/60">
              ${book.pageCount} ${book.pageCount === 1 ? 'Página' : 'Páginas'}
            </span>
          </div>

          <!-- Hover Overlay Quick Action -->
          <div class="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button class="px-4 py-2 rounded-md bg-white text-slate-900 text-xs font-bold shadow-md flex items-center gap-1.5 transform translate-y-1 group-hover:translate-y-0 transition-all">
              <svg class="w-4 h-4 text-[#2563EB]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span>Abrir lector</span>
            </button>
          </div>
        </div>

        <!-- Book Metadata Content -->
        <div class="p-4 flex-1 flex flex-col justify-between">
          <div>
            <h3 class="font-bold text-base text-slate-900 line-clamp-1 group-hover:text-[#2563EB] transition-colors" title="${escapeHtml(book.title)}">
              ${escapeHtml(book.title)}
            </h3>
            <div class="flex items-center gap-1.5 mt-1">
              ${
                book.primaryColor
                  ? `<span class="w-2.5 h-2.5 rounded-full border border-white shadow-2xs inline-block" style="background-color: ${book.primaryColor}" title="Color de marca: ${book.primaryColor}"></span>`
                  : ''
              }
              ${
                book.brandName
                  ? `<span class="text-[10px] font-semibold text-slate-500 truncate max-w-[140px]">${escapeHtml(book.brandName)}</span>`
                  : ''
              }
              <span class="text-[9px] font-medium px-1.5 py-0.2 rounded ${book.hardCover !== false ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-400'}">
                ${book.hardCover !== false ? 'Tapa dura' : 'Tapa blanda'}
              </span>
            </div>
            <p class="mt-1.5 text-xs text-slate-500 line-clamp-2 min-h-8 leading-relaxed">
              ${escapeHtml(book.description || 'Sin descripción definida.')}
            </p>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span class="font-mono text-[11px] text-slate-400">${dateFormatted}</span>

            <!-- Actions row -->
            <div class="flex items-center gap-1">
              <button data-action="clone" title="Duplicar publicación y todas sus páginas" class="p-1.5 rounded text-slate-400 hover:text-[#2563EB] hover:bg-blue-50 transition-colors cursor-pointer">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect width="13" height="13" x="9" y="9" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>

              <button data-action="move" title="Mover a otra carpeta" class="p-1.5 rounded text-slate-400 hover:text-[#2563EB] hover:bg-blue-50 transition-colors cursor-pointer">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </button>

              <button data-action="export" title="Exportar como paquete web ZIP autónomo" class="p-1.5 rounded text-slate-500 hover:text-[#2563EB] hover:bg-blue-50 transition-colors cursor-pointer">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>

              <button data-action="edit" title="Editar metadatos y reordenar páginas" class="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                </svg>
              </button>

              <button data-action="delete" title="Eliminar publicación y liberar espacio en IndexedDB" class="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderBookRow(book: BookRecord): string {
    const coverUrl = book.id ? this.coverUrlMap.get(book.id) : undefined;
    const dateFormatted = new Date(book.updatedAt).toLocaleDateString('es-ES', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return `
      <div class="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-200" data-book-id="${book.id}">
        <div class="flex flex-row">
          <!-- Cover Thumbnail -->
          <div class="relative w-28 sm:w-32 shrink-0 aspect-3/4 sm:aspect-auto sm:h-40 bg-slate-100 overflow-hidden cursor-pointer border-r border-slate-100" data-action="read">
            ${
              coverUrl
                ? `<img src="${coverUrl}" alt="${escapeHtml(book.title)}" class="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300" />`
                : `<div class="w-full h-full flex flex-col items-center justify-center p-4 text-slate-400 bg-slate-50">
                    <svg class="w-8 h-8 mb-1 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path>
                    </svg>
                    <span class="text-[10px] font-medium">Sin portada</span>
                  </div>`
            }
            <div class="absolute top-2 left-2 flex items-center gap-1">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-[#2563EB] text-white shadow-xs">Portada</span>
            </div>
          </div>

          <!-- Book Metadata -->
          <div class="p-4 flex-1 flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
            <div class="flex-1 min-w-0">
              <h3 class="font-bold text-base text-slate-900 line-clamp-1 group-hover:text-[#2563EB] transition-colors" title="${escapeHtml(book.title)}">
                ${escapeHtml(book.title)}
              </h3>
              <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1">
                ${
                  book.primaryColor
                    ? `<span class="w-2.5 h-2.5 rounded-full border border-white shadow-2xs inline-block" style="background-color: ${book.primaryColor}" title="Color de marca: ${book.primaryColor}"></span>`
                    : ''
                }
                ${
                  book.brandName
                    ? `<span class="text-[10px] font-semibold text-slate-500 truncate max-w-[140px]">${escapeHtml(book.brandName)}</span>`
                    : ''
                }
                <span class="text-[9px] font-medium px-1.5 py-0.2 rounded ${book.hardCover !== false ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-400'}">
                  ${book.hardCover !== false ? 'Tapa dura' : 'Tapa blanda'}
                </span>
                <span class="text-[10px] font-semibold text-slate-500">${book.pageCount} ${book.pageCount === 1 ? 'Página' : 'Páginas'}</span>
              </div>
              <p class="mt-1.5 text-xs text-slate-500 line-clamp-2 leading-relaxed max-w-2xl">
                ${escapeHtml(book.description || 'Sin descripción definida.')}
              </p>
              <div class="mt-2 flex items-center gap-2 text-xs text-slate-400">
                <span class="font-mono text-[11px]">${dateFormatted}</span>
              </div>
            </div>

            <!-- Actions row -->
            <div class="flex items-center gap-1 sm:shrink-0 sm:border-l sm:border-slate-100 sm:pl-4">
              <button data-action="read" class="px-3 py-1.5 rounded-md bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition cursor-pointer">
                Abrir lector
              </button>
              <button data-action="clone" title="Duplicar publicación y todas sus páginas" class="p-2 rounded-lg text-slate-400 hover:text-[#2563EB] hover:bg-blue-50 transition-colors cursor-pointer">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect width="13" height="13" x="9" y="9" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
              <button data-action="move" title="Mover a otra carpeta" class="p-2 rounded-lg text-slate-400 hover:text-[#2563EB] hover:bg-blue-50 transition-colors cursor-pointer">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </button>
              <button data-action="export" title="Exportar como paquete web ZIP autónomo" class="p-2 rounded-lg text-slate-500 hover:text-[#2563EB] hover:bg-blue-50 transition-colors cursor-pointer">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>
              <button data-action="edit" title="Editar metadatos y reordenar páginas" class="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                </svg>
              </button>
              <button data-action="delete" title="Eliminar publicación y liberar espacio en IndexedDB" class="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private elementEvents() {
    // Welcome tutorial re-open (footer)
    this.container.querySelector('#dash-welcome-btn')?.addEventListener('click', () => {
      showWelcome();
    });

    // New folder button
    this.container.querySelector('#dash-new-folder-btn')?.addEventListener('click', () => {
      this.openNewFolderModal();
    });

    // New book button (creates inside current folder)
    this.container.querySelector('#dash-new-book-btn')?.addEventListener('click', () => {
      this.callbacks.onNewBook(this.currentFolderId);
    });

    // Up one level
    this.container.querySelector('#dash-up-btn')?.addEventListener('click', () => {
      const parentId =
        this.currentFolderId != null
          ? this.allFolders.find((f) => f.id === this.currentFolderId)?.parentId ?? null
          : null;
      this.currentFolderId = parentId;
      this.load();
    });

    // Breadcrumb navigation (root + folders)
    this.container.querySelectorAll<HTMLElement>('[data-nav]').forEach((el) => {
      const val = el.getAttribute('data-nav');
      el.addEventListener('click', () => {
        this.currentFolderId = val === 'root' ? null : Number(val);
        this.load();
      });
    });

    // Search input
    const searchInput = this.container.querySelector<HTMLInputElement>('#dash-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = (e.target as HTMLInputElement).value;
        this.render();
        const updatedInput = this.container.querySelector<HTMLInputElement>('#dash-search');
        if (updatedInput) {
          updatedInput.focus();
          updatedInput.setSelectionRange(updatedInput.value.length, updatedInput.value.length);
        }
      });
    }

    // View mode toggles
    const gridBtn = this.container.querySelector<HTMLButtonElement>('#dash-view-grid');
    const listBtn = this.container.querySelector<HTMLButtonElement>('#dash-view-list');
    if (gridBtn) {
      gridBtn.addEventListener('click', () => this.setViewMode('grid'));
    }
    if (listBtn) {
      listBtn.addEventListener('click', () => this.setViewMode('list'));
    }

    // Backup download button
    this.container.querySelector<HTMLButtonElement>('#dash-backup-btn')?.addEventListener('click', () =>
      this.handleBackup()
    );

    // Restore input
    const restoreInput = this.container.querySelector<HTMLInputElement>('#dash-restore-input');
    if (restoreInput) {
      restoreInput.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          this.handleRestore(file);
          restoreInput.value = '';
        }
      });
    }

    // Folder card delegated events
    this.container.querySelectorAll<HTMLElement>('[data-folder-id]').forEach((card) => {
      const folderId = Number(card.getAttribute('data-folder-id'));
      if (!folderId) return;

      card.querySelectorAll<HTMLElement>('[data-folder-action]').forEach((el) => {
        const action = el.getAttribute('data-folder-action');
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const folder = this.allFolders.find((f) => f.id === folderId);
          if (!folder) return;
          if (action === 'open') {
            this.currentFolderId = folderId;
            this.load();
          } else if (action === 'rename') {
            this.openRenameFolderModal(folder);
          } else if (action === 'move') {
            this.openMoveModal({
              type: 'folder',
              id: folderId,
              label: folder.name,
            });
          } else if (action === 'delete') {
            this.handleDeleteFolder(folder);
          }
        });
      });
    });

    // Book card delegated events
    this.container.querySelectorAll<HTMLElement>('[data-book-id]').forEach((card) => {
      const bookId = Number(card.getAttribute('data-book-id'));
      if (!bookId) return;

      card.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
        const action = el.getAttribute('data-action');
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (action === 'read') {
            this.callbacks.onReadBook(bookId);
          } else if (action === 'edit') {
            this.callbacks.onEditBook(bookId);
          } else if (action === 'clone') {
            this.handleClone(bookId);
          } else if (action === 'move') {
            const book = this.books.find((b) => b.id === bookId);
            this.openMoveModal({
              type: 'book',
              id: bookId,
              label: book ? book.title : 'Libro',
            });
          } else if (action === 'export') {
            this.handleExport(bookId);
          } else if (action === 'delete') {
            this.handleDelete(bookId);
          }
        });
      });
    });
  }

  private setViewMode(mode: 'grid' | 'list') {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    localStorage.setItem(DashboardView.STORAGE_KEY, mode);
    this.render();
  }

  private openNewFolderModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4';
    modal.innerHTML = `
      <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
        <div class="flex items-center gap-3 mb-4 text-[#2563EB]">
          <div class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              <line x1="12" y1="11" x2="12" y2="17"></line>
              <line x1="9" y1="14" x2="15" y2="14"></line>
            </svg>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">Nueva carpeta</h3>
            <p class="text-xs text-slate-500">Se creará en: ${this.currentFolderLabel()}</p>
          </div>
        </div>
        <input
          id="folder-name-input"
          type="text"
          placeholder="Nombre de la carpeta..."
          class="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB] transition"
        />
        <div class="mt-6 flex items-center justify-end gap-2.5">
          <button id="folder-cancel-btn" class="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition cursor-pointer">
            Cancelar
          </button>
          <button id="folder-confirm-btn" class="px-4 py-2 text-xs font-semibold rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white transition shadow-sm shadow-blue-600/20 cursor-pointer">
            Crear carpeta
          </button>
        </div>
      </div>
    `;

    const input = modal.querySelector<HTMLInputElement>('#folder-name-input')!;
    input.focus();

    modal.querySelector('#folder-cancel-btn')?.addEventListener('click', () => document.body.removeChild(modal));
    modal.querySelector('#folder-confirm-btn')?.addEventListener('click', async () => {
      const name = input.value.trim();
      if (!name) {
        showToast({ message: 'Introduce un nombre para la carpeta.', type: 'warning' });
        return;
      }
      document.body.removeChild(modal);
      try {
        await addFolder(name, this.currentFolderId);
        showToast({ message: `Carpeta "${name}" creada.`, type: 'success' });
        await this.load();
      } catch (err) {
        console.error('Create folder failed:', err);
        showToast({ message: 'Error al crear la carpeta', type: 'error' });
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') modal.querySelector<HTMLElement>('#folder-confirm-btn')?.click();
    });

    document.body.appendChild(modal);
  }

  private currentFolderLabel(): string {
    if (this.currentFolderId == null) return 'Biblioteca (raíz)';
    const f = this.allFolders.find((x) => x.id === this.currentFolderId);
    return f ? escapeHtml(f.name) : 'Biblioteca (raíz)';
  }

  private openRenameFolderModal(folder: FolderRecord) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4';
    modal.innerHTML = `
      <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
        <div class="flex items-center gap-3 mb-4 text-[#2563EB]">
          <div class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
            </svg>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">Renombrar carpeta</h3>
          </div>
        </div>
        <input
          id="folder-rename-input"
          type="text"
          value="${escapeHtml(folder.name)}"
          class="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB] transition"
        />
        <div class="mt-6 flex items-center justify-end gap-2.5">
          <button id="folder-rename-cancel" class="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition cursor-pointer">Cancelar</button>
          <button id="folder-rename-confirm" class="px-4 py-2 text-xs font-semibold rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white transition shadow-sm shadow-blue-600/20 cursor-pointer">Guardar</button>
        </div>
      </div>
    `;

    const input = modal.querySelector<HTMLInputElement>('#folder-rename-input')!;
    input.focus();
    input.select();

    modal.querySelector('#folder-rename-cancel')?.addEventListener('click', () => document.body.removeChild(modal));
    modal.querySelector('#folder-rename-confirm')?.addEventListener('click', async () => {
      const name = input.value.trim();
      if (!name) {
        showToast({ message: 'Introduce un nombre válido.', type: 'warning' });
        return;
      }
      document.body.removeChild(modal);
      try {
        await renameFolder(folder.id!, name);
        showToast({ message: 'Carpeta renombrada.', type: 'success' });
        await this.load();
      } catch (err) {
        console.error('Rename folder failed:', err);
        showToast({ message: 'Error al renombrar la carpeta', type: 'error' });
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') modal.querySelector<HTMLElement>('#folder-rename-confirm')?.click();
    });

    document.body.appendChild(modal);
  }

  private handleDeleteFolder(folder: FolderRecord) {
    const descendantCount = this.countFolderTree(folder.id);
    const booksInside = this.countBooksInTree(folder.id);

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4';
    modal.innerHTML = `
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
        <div class="flex items-center gap-3 mb-3 text-red-600">
          <div class="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">Eliminar carpeta</h3>
            <p class="text-xs text-slate-500">${escapeHtml(folder.name)}</p>
          </div>
        </div>
        <p class="text-sm text-slate-600 mt-2">
          ¿Eliminar permanentemente la carpeta <strong>"${escapeHtml(folder.name)}"</strong>?
        </p>
        <p class="text-xs text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200 mt-3">
          <strong>Regla de integridad:</strong> Esta carpeta y sus ${descendantCount} subcarpetas se eliminarán. Los ${
            booksInside
          } libros que contiene se moverán a ${
            folder.parentId != null ? 'la carpeta superior' : 'la raíz'
          } (no se eliminan).
        </p>
        <div class="mt-6 flex items-center justify-end gap-2.5">
          <button id="foldel-cancel-btn" class="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition cursor-pointer">Cancelar</button>
          <button id="foldel-confirm-btn" class="px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white transition shadow-sm shadow-red-600/20 cursor-pointer">Eliminar carpeta</button>
        </div>
      </div>
    `;

    modal.querySelector('#foldel-cancel-btn')?.addEventListener('click', () => document.body.removeChild(modal));
    modal.querySelector('#foldel-confirm-btn')?.addEventListener('click', async () => {
      document.body.removeChild(modal);
      try {
        await deleteFolder(folder.id!);
        showToast({ message: `Carpeta "${folder.name}" eliminada.`, type: 'info' });
        await this.load();
      } catch (err) {
        console.error('Delete folder failed:', err);
        showToast({ message: 'Error al eliminar la carpeta', type: 'error' });
      }
    });

    document.body.appendChild(modal);
  }

  private openMoveModal(target: { type: 'book' | 'folder'; id: number; label: string }) {
    // For a folder, exclude itself and all its descendants (cycle protection)
    const excluded = new Set<number>();
    if (target.type === 'folder') {
      const collect = (pid: number) => {
        this.allFolders
          .filter((f) => f.parentId === pid)
          .forEach((f) => {
            if (f.id) {
              excluded.add(f.id);
              collect(f.id);
            }
          });
      };
      excluded.add(target.id);
      collect(target.id);
    }

    const options = buildFolderOptions(this.allFolders, excluded);
    const verb = target.type === 'book' ? 'Mover libro' : 'Mover carpeta';
    const currentDestId = this.currentPositionId(target);

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4';
    modal.innerHTML = `
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col">
        <div class="flex items-center gap-3 mb-3 text-[#2563EB]">
          <div class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">${verb}</h3>
            <p class="text-xs text-slate-500 truncate">"${escapeHtml(target.label)}"</p>
          </div>
        </div>

        <p class="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Destino</p>
        <div class="flex-1 overflow-y-auto pr-1 -mr-1">
          ${options
            .map(
              (opt) => `
            <button data-dest="${opt.id ?? 'root'}" data-is-current="${opt.id === currentDestId}" class="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition cursor-pointer ${
              opt.id === currentDestId
                ? 'bg-blue-50 text-[#2563EB] font-semibold'
                : 'text-slate-700 hover:bg-blue-50 hover:text-[#2563EB]'
            }">
              <span class="flex items-center gap-2 min-w-0" style="padding-left: ${opt.depth * 16}px">
                <svg class="w-4 h-4 shrink-0 ${opt.id === null ? 'text-slate-400' : 'text-[#2563EB]'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span class="truncate ${opt.depth > 0 ? 'font-medium' : 'font-semibold'}">${escapeHtml(opt.name)}</span>
              </span>
              ${
                opt.id === currentDestId
                  ? '<span class="ml-auto text-[10px] font-bold text-[#2563EB] bg-blue-100 px-1.5 py-0.5 rounded shrink-0">Actual</span>'
                  : ''
              }
            </button>
          `
            )
            .join('')}
        </div>

        <div class="mt-4 flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
          <button id="move-cancel-btn" class="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition cursor-pointer">Cancelar</button>
        </div>
      </div>
    `;

    modal.querySelector('#move-cancel-btn')?.addEventListener('click', () => document.body.removeChild(modal));

    modal.querySelectorAll<HTMLElement>('[data-dest]').forEach((el) => {
      el.addEventListener('click', async () => {
        const isCurrent = el.getAttribute('data-is-current') === 'true';
        const destVal = el.getAttribute('data-dest');
        const destId = destVal === 'root' ? null : Number(destVal);
        if (isCurrent) {
          document.body.removeChild(modal);
          showToast({ message: 'Ya está en esa ubicación.', type: 'info' });
          return;
        }
        document.body.removeChild(modal);
        try {
          if (target.type === 'book') {
            await moveBook(target.id, destId);
          } else {
            await moveFolder(target.id, destId);
          }
          showToast({
            message: `Se movió a "${destId == null ? 'la raíz' : (this.allFolders.find((f) => f.id === destId)?.name ?? 'carpeta')}".`,
            type: 'success',
          });
          await this.load();
        } catch (err) {
          console.error('Move failed:', err);
          showToast({ message: 'Error al mover el elemento', type: 'error' });
        }
      });
    });

    document.body.appendChild(modal);
  }

  private currentPositionId(target: { type: 'book' | 'folder'; id: number }): number | null {
    if (target.type === 'book') {
      return this.books.find((b) => b.id === target.id)?.folderId ?? null;
    } else {
      return this.allFolders.find((f) => f.id === target.id)?.parentId ?? null;
    }
  }

  public async handleBackup() {
    if (this.books.length === 0) {
      showToast({ message: 'No hay libros en la biblioteca para respaldar.', type: 'warning' });
      return;
    }

    const toastDismiss = showToast({
      message: 'Generando archivo de copia de seguridad con carpetas e imágenes...',
      type: 'info',
      duration: 0,
    });

    try {
      const backupBlob = await exportFullBackup();
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `flipblue-backup-${dateStr}.flipbackup`;

      const url = URL.createObjectURL(backupBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toastDismiss();
      showToast({
        message: `Copia de seguridad "${fileName}" descargada correctamente.`,
        type: 'success',
      });
    } catch (err) {
      toastDismiss();
      console.error('Backup failed:', err);
      showToast({ message: 'Error al generar la copia de seguridad', type: 'error' });
    }
  }

  private async handleRestore(file: File) {
    const toastDismiss = showToast({
      message: `Restaurando publicaciones desde "${file.name}"...`,
      type: 'info',
      duration: 0,
    });

    try {
      const result = await restoreFullBackup(file);
      toastDismiss();
      showToast({
        message: `Restauración completa: ${result.booksRestored} libros y ${result.pagesRestored} páginas importadas.`,
        type: 'success',
      });
      await this.load();
    } catch (err: any) {
      toastDismiss();
      console.error('Restore failed:', err);
      showToast({
        message: err.message || 'Error al restaurar la copia de seguridad',
        type: 'error',
      });
    }
  }

  private async handleClone(bookId: number) {
    const toastDismiss = showToast({
      message: 'Duplicando publicación y páginas...',
      type: 'info',
      duration: 0,
    });

    try {
      const newBookId = await cloneBook(bookId);
      toastDismiss();
      showToast({
        message: '¡Publicación clonada con éxito!',
        type: 'success',
      });
      await this.load();
    } catch (err) {
      toastDismiss();
      console.error('Clone failed:', err);
      showToast({ message: 'Error al clonar la publicación', type: 'error' });
    }
  }

  private async handleExport(bookId: number) {
    const book = this.books.find((b) => b.id === bookId);
    if (!book) return;

    const toastDismiss = showToast({
      message: `Empaquetando "${book.title}" en un archivo ZIP autónomo...`,
      type: 'info',
      duration: 0,
    });

    try {
      const pages = await getBookPages(bookId);
      if (pages.length === 0) {
        toastDismiss();
        showToast({ message: 'No se puede exportar un libro vacío sin páginas.', type: 'warning' });
        return;
      }

      await exportBookAsZip(book, pages, (pct, status) => {
        console.log(`[Export] ${pct}% - ${status}`);
      });

      toastDismiss();
      showToast({
        message: `¡"${book.title}" exportado con éxito en ZIP! Listo para abrir en cualquier navegador.`,
        type: 'success',
      });
    } catch (err) {
      toastDismiss();
      console.error('Export failed:', err);
      showToast({ message: 'Error al exportar el paquete del libro', type: 'error' });
    }
  }

  private handleDelete(bookId: number) {
    const book = this.books.find((b) => b.id === bookId);
    if (!book) return;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4';
    modal.innerHTML = `
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
        <div class="flex items-center gap-3 mb-3 text-red-600">
          <div class="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">Eliminar publicación</h3>
            <p class="text-xs text-slate-500">Limpieza de imágenes en IndexedDB</p>
          </div>
        </div>

        <p class="text-sm text-slate-600 mt-2">
          ¿Estás seguro de que deseas eliminar permanentemente <strong>"${escapeHtml(book.title)}"</strong>?
        </p>
        <p class="text-xs text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200 mt-3">
          <strong>Regla de integridad:</strong> Las ${book.pageCount} imágenes asociadas almacenadas en IndexedDB se eliminarán de forma inmediata y definitiva.
        </p>

        <div class="mt-6 flex items-center justify-end gap-2.5">
          <button id="del-cancel-btn" class="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition cursor-pointer">
            Cancelar
          </button>
          <button id="del-confirm-btn" class="px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white transition shadow-sm shadow-red-600/20 cursor-pointer">
            Eliminar definitivamente
          </button>
        </div>
      </div>
    `;

    modal.querySelector('#del-cancel-btn')?.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    modal.querySelector('#del-confirm-btn')?.addEventListener('click', async () => {
      document.body.removeChild(modal);
      try {
        await deleteBook(bookId);
        showToast({ message: `"${book.title}" eliminado y espacio liberado.`, type: 'info' });
        await this.load();
      } catch (err) {
        console.error('Delete failed:', err);
        showToast({ message: 'Error al eliminar la publicación', type: 'error' });
      }
    });

    document.body.appendChild(modal);
  }
}

function buildFolderOptions(allFolders: FolderRecord[], excluded: Set<number>): FolderOption[] {
  const opts: FolderOption[] = [{ id: null, name: 'Biblioteca (raíz)', depth: 0 }];
  const children = (pid: number | null | undefined) => allFolders.filter((f) => f.parentId === pid);
  const walk = (pid: number | null | undefined, depth: number) => {
    for (const f of children(pid)) {
      if (f.id && excluded.has(f.id)) continue;
      opts.push({ id: f.id ?? null, name: f.name, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 1);
  return opts;
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
import { cloneBook, deleteBook, exportFullBackup, getAllBooks, getBookPages, restoreFullBackup } from '../db/db';
import { exportBookAsZip } from '../utils/exportGenerator';
import { showToast } from '../components/Toast';
import type { BookRecord } from '../types';

export interface DashboardCallbacks {
  onNewBook: () => void;
  onEditBook: (bookId: number) => void;
  onReadBook: (bookId: number) => void;
}

export class DashboardView {
  private container: HTMLElement;
  private callbacks: DashboardCallbacks;
  private books: BookRecord[] = [];
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

  async load() {
    this.isLoading = true;
    this.render();
    try {
      this.books = await getAllBooks();
      // Revoke any previously generated object URLs to prevent memory leaks
      this.coverUrlMap.forEach((url) => URL.revokeObjectURL(url));
      this.coverUrlMap.clear();

      this.books.forEach((book) => {
        if (book.coverBlob && book.id) {
          const url = URL.createObjectURL(book.coverBlob);
          this.coverUrlMap.set(book.id, url);
        }
      });
    } catch (err) {
      console.error('Failed to load books:', err);
      showToast({ message: 'Failed to load books from IndexedDB', type: 'error' });
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

    const filteredBooks = this.books.filter((b) =>
      b.title.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
      b.description.toLowerCase().includes(this.searchQuery.toLowerCase())
    );

    const totalPagesCount = this.books.reduce((sum, b) => sum + (b.pageCount || 0), 0);

    this.container.innerHTML = `
      <!-- Dashboard Top Header -->
      <div class="mb-8">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
              <span>Publicaciones locales</span>
              <span class="text-xs font-semibold text-[#2563EB] bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-100/80">
                ${this.books.length} ${this.books.length === 1 ? 'Libro' : 'Libros'}
              </span>
            </h1>
            <p class="mt-1 text-sm text-slate-500">
              Gestiona flipbooks interactivos localmente en IndexedDB. Exporta paquetes web autónomos sin servidores.
            </p>
          </div>

          <!-- Backup & Restore Global Actions -->
          <div class="flex items-center gap-2">
            <button id="dash-backup-btn" class="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer" title="Descargar copia de seguridad con todos los libros e imágenes">
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

        <!-- Metric & Search Strip -->
        <div class="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <!-- Search Bar -->
          <div class="relative flex-1">
            <svg class="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              id="dash-search"
              type="text"
              placeholder="Buscar publicaciones por título o descripción..."
              value="${escapeHtml(this.searchQuery)}"
              class="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 hover:bg-slate-100/80 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB] rounded-lg border border-slate-200 transition-all"
            />
          </div>

          <!-- Quick Stats Pill -->
          <div class="flex items-center gap-4 text-xs font-medium text-slate-500 px-2 shrink-0">
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-[#2563EB]"></span>
              <span><strong class="text-slate-800 font-semibold">${totalPagesCount}</strong> Páginas en total</span>
            </div>
            <div class="h-4 w-px bg-slate-200"></div>
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>IndexedDB activo</span>
            </div>
            <div class="h-4 w-px bg-slate-200"></div>

            <!-- View Mode Toggle -->
            <div class="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
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
                <span class="hidden sm:inline">Cuadrícula</span>
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
                <span class="hidden sm:inline">Horizontal</span>
              </button>
            </div>
          </div>
        </div>
      </div>

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
          <h2 class="text-lg font-bold text-slate-900">${this.searchQuery ? 'No se encontraron publicaciones' : 'Aún no hay libros en tu biblioteca local'}</h2>
          <p class="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            ${
              this.searchQuery
                ? 'Prueba con otra palabra clave o limpia el campo de búsqueda.'
                : 'Haz clic en "Crear nuevo libro" o "Libro demo" en la cabecera para empezar.'
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
          <span class="text-[10px] font-mono text-slate-400">v0.3-beta</span>
          <span class="w-1 h-1 rounded-full bg-slate-300"></span>
          <span>
            Licencia
            <a href="/LICENSE" target="_blank" rel="noopener noreferrer" class="font-semibold text-slate-600 hover:text-slate-900 hover:underline transition-colors">MIT</a>
          </span>
        </div>
      </footer>
    `;

    // Bind event listeners
    this.elementEvents();
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
            <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#2563EB] text-white shadow-xs">
              001.png
            </span>
            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#2563EB] text-white shadow-xs">
              Portada
            </span>
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
    // Search input
    const searchInput = this.container.querySelector<HTMLInputElement>('#dash-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = (e.target as HTMLInputElement).value;
        this.render();
        // keep focus in input
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
      gridBtn.addEventListener('click', () => {
        this.setViewMode('grid');
      });
    }
    if (listBtn) {
      listBtn.addEventListener('click', () => {
        this.setViewMode('list');
      });
    }

    // Backup download button
    const backupBtn = this.container.querySelector<HTMLButtonElement>('#dash-backup-btn');
    if (backupBtn) {
      backupBtn.addEventListener('click', () => this.handleBackup());
    }

    // Restore input
    const restoreInput = this.container.querySelector<HTMLInputElement>('#dash-restore-input');
    if (restoreInput) {
      restoreInput.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          this.handleRestore(file);
          // reset input
          restoreInput.value = '';
        }
      });
    }

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

  private async handleBackup() {
    if (this.books.length === 0) {
      showToast({ message: 'No hay libros en la biblioteca para respaldar.', type: 'warning' });
      return;
    }

    const toastDismiss = showToast({
      message: 'Generando archivo de copia de seguridad con imágenes...',
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

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

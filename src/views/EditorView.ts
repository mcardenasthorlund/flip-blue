import Sortable from 'sortablejs';
import { formatPageFileName, getBook, getBookPages, saveBook } from '../db/db';
import { exportBookAsZip } from '../utils/exportGenerator';
import { showToast } from '../components/Toast';
import { optimizeImageBlob, renderPdfToBlobs } from '../utils/mediaProcessor';
import type { EditorPageState } from '../types';

export interface EditorCallbacks {
  onBack: () => void;
  onPreview: (bookId: number) => void;
}

export class EditorView {
  private container: HTMLElement;
  private callbacks: EditorCallbacks;
  private bookId?: number;
  private folderId?: number | null;
  private title = '';
  private description = '';
  private primaryColor = '#2563EB';
  private brandName = '';
  private hardCover = true;
  private singlePageMode = false;
  private autoOptimize = true;
  private isProcessingPdf = false;
  private pdfStatusText = '';

  private pages: EditorPageState[] = [];
  private sortableInstance: Sortable | null = null;
  private isSaving = false;
  private detectedAspectRatio = '';

  constructor(callbacks: EditorCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.className = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full';
  }

  getElement(): HTMLElement {
    return this.container;
  }

  async load(bookId?: number, folderId?: number | null) {
    this.bookId = bookId;
    this.folderId = folderId ?? null;
    this.cleanPageUrls();
    this.pages = [];

    if (bookId) {
      try {
        const book = await getBook(bookId);
        if (book) {
          this.title = book.title;
          this.description = book.description;
          this.primaryColor = book.primaryColor || '#2563EB';
          this.brandName = book.brandName || '';
          this.hardCover = book.hardCover ?? true;
          this.singlePageMode = book.singlePageMode ?? false;
        }

        const pageRecords = await getBookPages(bookId);
        this.pages = pageRecords.map((p, idx) => ({
          id: p.id,
          tempId: `p-${idx}-${Date.now()}`,
          pageNumber: p.pageNumber,
          fileName: p.fileName,
          blob: p.blob,
          previewUrl: URL.createObjectURL(p.blob),
          width: p.width,
          height: p.height,
        }));
      } catch (err) {
        console.error('Failed to load book in editor:', err);
        showToast({ message: 'Error al cargar los datos del libro', type: 'error' });
      }
    } else {
      this.title = 'Nueva publicación FlipBlue';
      this.description = 'Publicación interactiva con efecto de paso de página.';
      this.primaryColor = '#2563EB';
      this.brandName = '';
      this.hardCover = true;
      this.singlePageMode = false;
    }

    this.calculateAspectRatio();
    this.render();
  }

  destroy() {
    if (this.sortableInstance) {
      this.sortableInstance.destroy();
      this.sortableInstance = null;
    }
    this.cleanPageUrls();
  }

  private cleanPageUrls() {
    this.pages.forEach((p) => {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    });
  }

  private calculateAspectRatio() {
    if (this.pages.length === 0) {
      this.detectedAspectRatio = '';
      return;
    }
    const first = this.pages[0];
    if (first.width && first.height) {
      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
      const g = gcd(first.width, first.height);
      const aspectW = Math.round(first.width / g);
      const aspectH = Math.round(first.height / g);
      if (aspectW < 20 && aspectH < 20) {
        this.detectedAspectRatio = `${aspectW}:${aspectH} (${first.width}×${first.height})`;
      } else {
        const ratio = (first.height / first.width).toFixed(2);
        this.detectedAspectRatio = `1:${ratio} (${first.width}×${first.height})`;
      }
    }
  }

  private render() {
    const colorPresets = [
      { name: 'Azul FlipBlue', color: '#2563EB' },
      { name: 'Turquesa', color: '#0D9488' },
      { name: 'Esmeralda', color: '#059669' },
      { name: 'Violeta Real', color: '#7C3AED' },
      { name: 'Carmesí', color: '#DC2626' },
      { name: 'Ámbar Intenso', color: '#D97706' },
      { name: 'Grafito', color: '#334155' },
    ];

    this.container.innerHTML = `
      <!-- Editor Top Bar -->
      <div class="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200">
        <div class="flex items-center gap-3">
          <button id="ed-back-btn" class="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition cursor-pointer" title="Volver a la biblioteca">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
          <div>
            <div class="flex items-center gap-2.5">
              <h1 class="text-2xl font-bold text-slate-900">
                ${this.bookId ? 'Editar publicación' : 'Crear nuevo libro'}
              </h1>
              <span class="text-xs font-semibold px-2.5 py-0.5 rounded-md ${this.pages.length > 0 ? 'bg-blue-50 text-[#2563EB] border border-blue-100/80' : 'bg-slate-100 text-slate-600'}">
                ${this.pages.length} ${this.pages.length === 1 ? 'Página' : 'Páginas'}
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">
              Relación de aspecto: ${this.detectedAspectRatio || 'Detectando al subir páginas...'} &bull; Almacenamiento local en IndexedDB
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          ${
            this.bookId && this.pages.length > 0
              ? `
            <button id="ed-preview-btn" class="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition cursor-pointer">
              <svg class="w-4 h-4 text-[#2563EB]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span>Abrir lector</span>
            </button>

            <button id="ed-export-btn" class="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#2563EB] text-sm font-semibold transition cursor-pointer">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Exportar ZIP</span>
            </button>
            `
              : ''
          }

          <button id="ed-save-btn" class="bg-[#2563EB] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50" ${this.isSaving ? 'disabled' : ''}>
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            <span>${this.isSaving ? 'Guardando...' : 'Guardar libro'}</span>
          </button>
        </div>
      </div>

      <!-- Metadata & Branding Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <!-- Metadata Settings Form (Col span 2) -->
        <div class="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
          <h2 class="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
            <svg class="w-3.5 h-3.5 text-[#2563EB]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span>Metadatos de la publicación</span>
          </h2>

          <div class="space-y-4">
            <!-- Book Title -->
            <div>
              <label for="ed-title-input" class="block text-xs font-semibold text-slate-700 mb-1.5">
                Título del libro <span class="text-red-500">*</span>
              </label>
              <input
                id="ed-title-input"
                type="text"
                placeholder="Ej. Catálogo Oficial Temporada 2026"
                value="${escapeHtml(this.title)}"
                class="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB] transition"
              />
            </div>

            <!-- Description -->
            <div>
              <label for="ed-desc-input" class="block text-xs font-semibold text-slate-700 mb-1.5">
                Descripción / Subtítulo
              </label>
              <input
                id="ed-desc-input"
                type="text"
                placeholder="Ej. Publicación interactiva con ilustraciones de alta resolución"
                value="${escapeHtml(this.description)}"
                class="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB] transition"
              />
            </div>
          </div>
        </div>

        <!-- Branding & Reading Options (Col span 1) -->
        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
          <h2 class="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
            <svg class="w-3.5 h-3.5 text-[#2563EB]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <circle cx="12" cy="12" r="4"></circle>
              <line x1="4.93" y1="4.93" x2="9.17" y2="9.17"></line>
              <line x1="14.83" y1="14.83" x2="19.07" y2="19.07"></line>
              <line x1="14.83" y1="9.17" x2="19.07" y2="4.93"></line>
              <line x1="4.93" y1="19.07" x2="9.17" y2="14.83"></line>
            </svg>
            <span>Branding y estilo</span>
          </h2>

          <div class="space-y-4">
            <!-- Brand / Author Name -->
            <div>
              <label for="ed-brand-input" class="block text-xs font-semibold text-slate-700 mb-1">
                Sello / Nombre de marca
              </label>
              <input
                id="ed-brand-input"
                type="text"
                placeholder="Ej. Editorial Nova"
                value="${escapeHtml(this.brandName)}"
                class="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB] transition"
              />
            </div>

            <!-- Primary Accent Color -->
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1.5">
                Color de marca (acento)
              </label>
              <div class="flex items-center gap-1.5 flex-wrap mb-2">
                ${colorPresets
                  .map(
                    (p) => `
                  <button
                    type="button"
                    data-color="${p.color}"
                    class="color-preset-btn w-6 h-6 rounded-full border-2 transition transform hover:scale-110 cursor-pointer ${
                      this.primaryColor.toLowerCase() === p.color.toLowerCase()
                        ? 'border-slate-800 scale-110 shadow-sm'
                        : 'border-white'
                    }"
                    style="background-color: ${p.color};"
                    title="${p.name} (${p.color})"
                  ></button>
                `
                  )
                  .join('')}
                <input
                  id="ed-custom-color"
                  type="color"
                  value="${this.primaryColor}"
                  class="w-6 h-6 rounded border border-slate-300 cursor-pointer p-0 bg-transparent"
                  title="Elegir color personalizado"
                />
              </div>
            </div>

            <!-- Hard Cover & Single Page Options -->
            <div class="pt-3 border-t border-slate-100 space-y-2.5">
              <label class="flex items-center gap-2 cursor-pointer select-none">
                <input
                  id="ed-hardcover-check"
                  type="checkbox"
                  ${this.hardCover ? 'checked' : ''}
                  class="rounded text-[#2563EB] focus:ring-[#2563EB] h-4 w-4 border-slate-300"
                />
                <span class="text-xs font-medium text-slate-700">Cubiertas rígidas (Hard Cover)</span>
              </label>

              <label class="flex items-center gap-2 cursor-pointer select-none">
                <input
                  id="ed-singlepage-check"
                  type="checkbox"
                  ${this.singlePageMode ? 'checked' : ''}
                  class="rounded text-[#2563EB] focus:ring-[#2563EB] h-4 w-4 border-slate-300"
                />
                <span class="text-xs font-medium text-slate-700">Modo 1 página por defecto</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Mass Import & Optimization Strip -->
      <div class="bg-gradient-to-r from-blue-50/60 to-indigo-50/40 p-4 rounded-xl border border-blue-100 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="12" y1="18" x2="12" y2="12"></line>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
          </div>
          <div>
            <div class="text-xs font-bold text-slate-800">Carga Masiva e Importación Rápida</div>
            <p class="text-[11px] text-slate-500">
              Sube tus páginas en lote o importa directamente un archivo PDF completo sin salir del navegador.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3 flex-wrap">
          <!-- Auto Optimize Toggle -->
          <label class="flex items-center gap-1.5 text-xs text-slate-700 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 cursor-pointer shadow-2xs">
            <input
              id="ed-optimize-toggle"
              type="checkbox"
              ${this.autoOptimize ? 'checked' : ''}
              class="rounded text-blue-600 h-3.5 w-3.5"
            />
            <span class="font-medium text-[11px]">⚡ Optimizar (máx. 1920px)</span>
          </label>

          <!-- PDF Import Button -->
          <button
            id="ed-import-pdf-btn"
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer"
          >
            <svg class="w-3.5 h-3.5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span>Importar PDF</span>
          </button>
          <input type="file" id="ed-pdf-input" accept="application/pdf,.pdf" class="hidden" />
        </div>
      </div>

      <!-- Processing PDF Overlay Banner -->
      ${
        this.isProcessingPdf
          ? `
        <div class="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-4 text-blue-900 animate-pulse">
          <div class="w-7 h-7 rounded-full border-2 border-blue-600 border-t-transparent animate-spin shrink-0"></div>
          <div class="flex-1">
            <h4 class="text-xs font-bold uppercase tracking-wider text-blue-700">Extrayendo y renderizando páginas del PDF...</h4>
            <p class="text-xs text-blue-600 mt-0.5">${this.pdfStatusText || 'Por favor espera unos segundos...'}</p>
          </div>
        </div>
      `
          : ''
      }

      <!-- Upload Zone & File Dropper -->
      <div id="ed-dropzone" class="mb-6 py-6 px-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-[#2563EB] hover:text-[#2563EB] bg-white transition-all text-center cursor-pointer">
        <input
          id="ed-file-input"
          type="file"
          accept="image/png, image/jpeg, image/webp, application/pdf,.pdf"
          multiple
          class="hidden"
        />
        <div class="flex flex-col items-center justify-center gap-2">
          <div class="w-10 h-10 rounded-lg bg-blue-50 text-[#2563EB] flex items-center justify-center">
            <span class="text-xl font-bold leading-none">+</span>
          </div>
          <div class="text-sm font-semibold text-slate-800">Arrastra archivos aquí o haz clic para explorar</div>
          <p class="text-xs text-slate-400 max-w-md">
            Admite imágenes <strong class="text-slate-600">PNG, JPG, WEBP</strong> o un archivo <strong class="text-slate-600">PDF</strong> completo. Se renombrarán automáticamente a <strong class="font-mono text-slate-600">001.png, 002.png...</strong> en secuencia.
          </p>
          ${
            this.detectedAspectRatio
              ? `<div class="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-slate-50 text-slate-600 border border-slate-200">
                  <span class="w-2 h-2 rounded-full" style="background-color: ${this.primaryColor};"></span>
                  <span>Relación de aspecto detectada: ${this.detectedAspectRatio}</span>
                 </div>`
              : ''
          }
        </div>
      </div>

      <!-- Drag-and-Drop Sortable Page Grid Section -->
      <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-xs mb-6">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h2 class="text-xs font-bold uppercase tracking-widest text-slate-400">
              Páginas del proyecto
            </h2>
          </div>
          <div class="text-xs text-slate-400 flex items-center gap-3">
            <span class="font-mono font-semibold text-slate-700">${this.pages.length} Páginas</span>
            <div class="h-3 w-px bg-slate-200"></div>
            <span class="text-slate-500 font-medium">
              ${this.hardCover ? '1.ª y última: Tapa dura' : 'Todas: Tapa blanda'}
            </span>
          </div>
        </div>

        <div id="ed-pages-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          ${this.pages.map((p, idx) => this.renderPageCard(p, idx)).join('')}

          <!-- Add Page Tile -->
          <div id="ed-add-tile" class="aspect-[3/4] rounded-lg border-2 border-dashed border-slate-200 hover:border-[#2563EB] hover:text-[#2563EB] bg-slate-50/50 hover:bg-blue-50/30 flex flex-col items-center justify-center p-3 text-center text-slate-400 transition cursor-pointer">
            <span class="text-2xl font-bold mb-1">+</span>
            <span class="text-xs font-semibold">Añadir páginas</span>
          </div>
        </div>

        <div class="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center items-start justify-between gap-2 text-xs text-slate-400">
          <p class="text-[11px] text-slate-400 leading-relaxed italic">
            Todos los elementos se guardan en IndexedDB localmente. Tu biblioteca persiste al recargar la página.
          </p>
          <div class="flex items-center gap-2 shrink-0">
            <div class="w-2 h-2 rounded-full animate-pulse" style="background-color: ${this.primaryColor}"></div>
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">FlipBlue Core Listo</span>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    this.initSortable();
  }

  private renderPageCard(page: EditorPageState, index: number): string {
    const isFirst = index === 0;
    const isLast = index === this.pages.length - 1;
    const isHardCover = this.hardCover && (isFirst || isLast);
    const formattedName = formatPageFileName(index + 1);

    return `
      <div class="group relative bg-white rounded-lg ${isHardCover ? 'border-2' : 'border border-slate-200 hover:border-slate-300'} transition-colors overflow-hidden flex flex-col shadow-xs" style="${isHardCover ? `border-color: ${this.primaryColor};` : ''}" data-temp-id="${page.tempId}">
        <!-- Drag Handle & Image Container -->
        <div class="relative aspect-[3/4] bg-slate-100 overflow-hidden cursor-grab active:cursor-grabbing handle p-1">
          <div class="w-full h-full bg-white rounded overflow-hidden flex items-center justify-center relative">
            <img src="${page.previewUrl}" alt="${formattedName}" class="w-full h-full object-cover pointer-events-none" />

            <!-- Rule Badges -->
            ${
              isHardCover && isFirst
                ? `<div class="absolute top-1.5 right-1.5 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-xs pointer-events-none" style="background-color: ${this.primaryColor};">
                    Portada
                   </div>`
                : isHardCover && isLast
                ? `<div class="absolute top-1.5 right-1.5 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-xs pointer-events-none" style="background-color: ${this.primaryColor};">
                    Contraportada
                   </div>`
                : ''
            }

            <!-- Delete Page Action -->
            <button
              data-delete-id="${page.tempId}"
              class="absolute top-1.5 left-1.5 p-1 rounded bg-white/90 hover:bg-red-500 hover:text-white text-slate-400 sm:opacity-0 sm:group-hover:opacity-100 transition shadow-xs cursor-pointer"
              title="Eliminar esta página"
            >
              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <!-- Tile Footer Info -->
        <div class="px-2 py-1.5 bg-white border-t border-slate-100 flex items-center justify-between text-xs">
          <span class="text-[10px] font-mono font-bold" style="${isHardCover ? `color: ${this.primaryColor};` : 'color: #64748B;'}">
            ${formattedName}
          </span>
          <span class="text-[9px] font-mono text-slate-400">
            P.${index + 1}
          </span>
        </div>
      </div>
    `;
  }

  private initSortable() {
    const grid = this.container.querySelector<HTMLElement>('#ed-pages-grid');
    if (!grid) return;

    if (this.sortableInstance) {
      this.sortableInstance.destroy();
    }

    this.sortableInstance = new Sortable(grid, {
      animation: 180,
      handle: '.handle',
      filter: '#ed-add-tile',
      draggable: '[data-temp-id]',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      onEnd: (evt) => {
        const { oldIndex, newIndex } = evt;
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) {
          return;
        }

        // Reorder array
        const [movedItem] = this.pages.splice(oldIndex, 1);
        this.pages.splice(newIndex, 0, movedItem);

        // Update page sequence numbers
        this.pages.forEach((p, idx) => {
          p.pageNumber = idx + 1;
          p.fileName = formatPageFileName(idx + 1);
        });

        // Re-render to refresh badges
        this.render();
      },
    });
  }

  private bindEvents() {
    // Back button
    this.container.querySelector('#ed-back-btn')?.addEventListener('click', () => {
      this.callbacks.onBack();
    });

    // Inputs
    const titleInput = this.container.querySelector<HTMLInputElement>('#ed-title-input');
    if (titleInput) {
      titleInput.addEventListener('input', (e) => {
        this.title = (e.target as HTMLInputElement).value;
      });
    }

    const descInput = this.container.querySelector<HTMLInputElement>('#ed-desc-input');
    if (descInput) {
      descInput.addEventListener('input', (e) => {
        this.description = (e.target as HTMLInputElement).value;
      });
    }

    const brandInput = this.container.querySelector<HTMLInputElement>('#ed-brand-input');
    if (brandInput) {
      brandInput.addEventListener('input', (e) => {
        this.brandName = (e.target as HTMLInputElement).value;
      });
    }

    // Color preset buttons
    this.container.querySelectorAll<HTMLButtonElement>('.color-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = btn.getAttribute('data-color');
        if (c) {
          this.primaryColor = c;
          this.render();
        }
      });
    });

    const customColorInput = this.container.querySelector<HTMLInputElement>('#ed-custom-color');
    if (customColorInput) {
      customColorInput.addEventListener('input', (e) => {
        this.primaryColor = (e.target as HTMLInputElement).value;
        this.render();
      });
    }

    // Hard cover checkbox
    const hardCoverCheck = this.container.querySelector<HTMLInputElement>('#ed-hardcover-check');
    if (hardCoverCheck) {
      hardCoverCheck.addEventListener('change', (e) => {
        this.hardCover = (e.target as HTMLInputElement).checked;
        this.render();
      });
    }

    // Single page mode checkbox
    const singlePageCheck = this.container.querySelector<HTMLInputElement>('#ed-singlepage-check');
    if (singlePageCheck) {
      singlePageCheck.addEventListener('change', (e) => {
        this.singlePageMode = (e.target as HTMLInputElement).checked;
      });
    }

    // Auto optimize toggle
    const optimizeToggle = this.container.querySelector<HTMLInputElement>('#ed-optimize-toggle');
    if (optimizeToggle) {
      optimizeToggle.addEventListener('change', (e) => {
        this.autoOptimize = (e.target as HTMLInputElement).checked;
      });
    }

    // PDF button & input
    const pdfBtn = this.container.querySelector<HTMLButtonElement>('#ed-import-pdf-btn');
    const pdfInput = this.container.querySelector<HTMLInputElement>('#ed-pdf-input');
    if (pdfBtn && pdfInput) {
      pdfBtn.addEventListener('click', () => pdfInput.click());
      pdfInput.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          this.handlePdfFile(file);
          pdfInput.value = '';
        }
      });
    }

    // Save button
    this.container.querySelector('#ed-save-btn')?.addEventListener('click', () => {
      this.handleSave();
    });

    // Preview button
    this.container.querySelector('#ed-preview-btn')?.addEventListener('click', () => {
      if (this.bookId) {
        this.callbacks.onPreview(this.bookId);
      }
    });

    // Export button
    this.container.querySelector('#ed-export-btn')?.addEventListener('click', () => {
      this.handleExport();
    });

    // File input & Drag drop
    const fileInput = this.container.querySelector<HTMLInputElement>('#ed-file-input');
    const dropzone = this.container.querySelector<HTMLElement>('#ed-dropzone');
    const addTile = this.container.querySelector<HTMLElement>('#ed-add-tile');

    const triggerUpload = () => fileInput?.click();

    dropzone?.addEventListener('click', (e) => {
      if (e.target !== fileInput) triggerUpload();
    });

    addTile?.addEventListener('click', triggerUpload);

    fileInput?.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        this.handleFiles(Array.from(files));
        fileInput.value = '';
      }
    });

    // Drag & drop on dropzone
    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('border-blue-600', 'bg-blue-50/50');
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('border-blue-600', 'bg-blue-50/50');
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-blue-600', 'bg-blue-50/50');
        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
          this.handleFiles(Array.from(e.dataTransfer.files));
        }
      });
    }

    // Delete buttons
    this.container.querySelectorAll<HTMLElement>('[data-delete-id]').forEach((btn) => {
      const tempId = btn.getAttribute('data-delete-id');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deletePage(tempId!);
      });
    });
  }

  private async handlePdfFile(file: File) {
    this.isProcessingPdf = true;
    this.pdfStatusText = 'Cargando documento PDF...';
    this.render();

    try {
      const items = await renderPdfToBlobs(file, {
        scale: 1.8,
        optimize: this.autoOptimize,
        maxDimension: 1920,
        onProgress: (cur, tot) => {
          this.pdfStatusText = `Extrayendo página ${cur} de ${tot}...`;
          const statusEl = this.container.querySelector('h4 + p');
          if (statusEl) statusEl.textContent = this.pdfStatusText;
        },
      });

      if (items.length === 0) {
        showToast({ message: 'No se encontraron páginas en el PDF', type: 'warning' });
        return;
      }

      for (const item of items) {
        const nextNumber = this.pages.length + 1;
        this.pages.push({
          tempId: `p-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          pageNumber: nextNumber,
          fileName: formatPageFileName(nextNumber),
          blob: item.blob,
          previewUrl: URL.createObjectURL(item.blob),
          width: item.width,
          height: item.height,
          isNew: true,
        });
      }

      this.calculateAspectRatio();
      showToast({
        message: `¡${items.length} páginas importadas del PDF "${file.name}"!`,
        type: 'success',
      });
    } catch (err: any) {
      console.error('PDF extraction failed:', err);
      showToast({
        message: 'Error al procesar el archivo PDF: ' + (err.message || 'Formato no soportado'),
        type: 'error',
      });
    } finally {
      this.isProcessingPdf = false;
      this.pdfStatusText = '';
      this.render();
    }
  }

  private async handleFiles(files: File[]) {
    // Separate PDFs from images
    const pdfFiles = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    const imageFiles = files.filter((f) => !pdfFiles.includes(f));

    if (pdfFiles.length > 0) {
      for (const pdf of pdfFiles) {
        await this.handlePdfFile(pdf);
      }
    }

    if (imageFiles.length === 0) return;

    // Sort files naturally by filename (e.g. 1.png, 2.png, 10.png or page-01, page-02)
    imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    showToast({ message: `Procesando ${imageFiles.length} imágenes...`, type: 'info' });

    for (const file of imageFiles) {
      try {
        let finalBlob: Blob = file;
        let width: number;
        let height: number;

        if (this.autoOptimize) {
          const optimized = await optimizeImageBlob(file, 1920);
          finalBlob = optimized.blob;
          width = optimized.width;
          height = optimized.height;
        } else {
          const dims = await this.readImageDimensions(file);
          width = dims.width;
          height = dims.height;
        }

        const nextNumber = this.pages.length + 1;
        const pageItem: EditorPageState = {
          tempId: `p-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          pageNumber: nextNumber,
          fileName: formatPageFileName(nextNumber),
          blob: finalBlob,
          previewUrl: URL.createObjectURL(finalBlob),
          width,
          height,
          isNew: true,
        };
        this.pages.push(pageItem);
      } catch (err) {
        console.warn('Failed reading image:', file.name, err);
      }
    }

    this.calculateAspectRatio();
    this.render();
    showToast({ message: `Se añadieron ${imageFiles.length} páginas en secuencia.`, type: 'success' });
  }

  private deletePage(tempId: string) {
    const idx = this.pages.findIndex((p) => p.tempId === tempId);
    if (idx !== -1) {
      const [removed] = this.pages.splice(idx, 1);
      if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);

      // Re-sequence page numbers & filenames
      this.pages.forEach((p, i) => {
        p.pageNumber = i + 1;
        p.fileName = formatPageFileName(i + 1);
      });

      this.calculateAspectRatio();
      this.render();
      showToast({ message: 'Página eliminada', type: 'info' });
    }
  }

  private readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const res = { width: img.naturalWidth, height: img.naturalHeight };
        URL.revokeObjectURL(url);
        resolve(res);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ width: 800, height: 1100 });
      };
      img.src = url;
    });
  }

  private async handleSave(): Promise<boolean> {
    if (!this.title.trim()) {
      showToast({ message: 'Por favor, introduce un título para el libro.', type: 'warning' });
      return false;
    }

    if (this.pages.length === 0) {
      showToast({ message: 'Por favor, añade al menos una página antes de guardar.', type: 'warning' });
      return false;
    }

    this.isSaving = true;
    this.render();

    try {
      const pageItems = this.pages.map((p) => ({
        blob: p.blob,
        width: p.width,
        height: p.height,
      }));

      const savedBookId = await saveBook(
        {
          id: this.bookId,
          title: this.title,
          description: this.description,
          primaryColor: this.primaryColor,
          brandName: this.brandName,
          hardCover: this.hardCover,
          singlePageMode: this.singlePageMode,
          folderId: this.bookId ? undefined : (this.folderId ?? null),
        },
        pageItems
      );

      this.bookId = savedBookId;
      showToast({
        message: `¡"${this.title}" guardado con éxito con ${this.pages.length} páginas en IndexedDB!`,
        type: 'success',
      });
      return true;
    } catch (err) {
      console.error('Save failed:', err);
      showToast({ message: 'Error al guardar el libro en IndexedDB', type: 'error' });
      return false;
    } finally {
      this.isSaving = false;
      this.render();
    }
  }

  private async handleExport() {
    // Save first to ensure state is committed
    const saved = await this.handleSave();
    if (!saved || !this.bookId) return;

    try {
      const book = await getBook(this.bookId);
      const pages = await getBookPages(this.bookId);
      if (!book || pages.length === 0) return;

      showToast({ message: `Exportando paquete de "${book.title}"...`, type: 'info' });
      await exportBookAsZip(book, pages);
      showToast({ message: `¡Exportación de "${book.title}" lista!`, type: 'success' });
    } catch (err) {
      console.error('Export failed:', err);
      showToast({ message: 'Error al exportar', type: 'error' });
    }
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

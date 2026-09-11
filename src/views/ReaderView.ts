import { PageFlip } from 'page-flip';
import Panzoom, { type PanzoomObject } from '@panzoom/panzoom';
import { getBook, getBookPages } from '../db/db';
import { exportBookAsZip } from '../utils/exportGenerator';
import { showToast } from '../components/Toast';
import type { BookRecord, PageRecord } from '../types';

export interface ReaderCallbacks {
  onBack: () => void;
  onEdit: (bookId: number) => void;
}

export class ReaderView {
  private container: HTMLElement;
  private callbacks: ReaderCallbacks;
  private bookId?: number;
  private book?: BookRecord;
  private pages: PageRecord[] = [];
  private pageUrls: string[] = [];
  private detectedRatio = 1.414;

  private isSinglePageMode = false;
  private showThumbnailsDrawer = false;
  private currentPageIndex = 0;

  private pageFlipInstance: PageFlip | null = null;
  private panzoomInstance: PanzoomObject | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private wheelHandler: ((e: WheelEvent) => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(callbacks: ReaderCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.className =
      'fixed inset-0 z-50 bg-[#F8FAFC] flex flex-col overflow-hidden select-none';
  }

  getElement(): HTMLElement {
    return this.container;
  }

  async load(bookId: number) {
    this.bookId = bookId;
    this.destroy();

    try {
      this.book = await getBook(bookId);
      this.pages = await getBookPages(bookId);

      if (!this.book || this.pages.length === 0) {
        showToast({ message: 'No se encontraron páginas en esta publicación.', type: 'warning' });
        this.callbacks.onBack();
        return;
      }

      this.isSinglePageMode = this.book.singlePageMode ?? false;
      this.showThumbnailsDrawer = false;
      this.currentPageIndex = 0;

      this.pageUrls = this.pages.map((p) => URL.createObjectURL(p.blob));
      this.render();
      await this.startPreloaderAndInit();
    } catch (err) {
      console.error('Failed loading reader view:', err);
      showToast({ message: 'Error al abrir el visor de lectura', type: 'error' });
      this.callbacks.onBack();
    }
  }

  destroy() {
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }

    if (this.wheelHandler) {
      const viewport = this.container.querySelector<HTMLElement>('#reader-viewport');
      if (viewport) {
        viewport.removeEventListener('wheel', this.wheelHandler);
      }
      this.wheelHandler = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.panzoomInstance) {
      this.panzoomInstance.destroy();
      this.panzoomInstance = null;
    }

    if (this.pageFlipInstance) {
      try {
        this.pageFlipInstance.destroy();
      } catch (err) {
        console.warn('StPageFlip destroy error:', err);
      }
      this.pageFlipInstance = null;
    }

    this.pageUrls.forEach((url) => URL.revokeObjectURL(url));
    this.pageUrls = [];
    this.container.innerHTML = '';
  }

  private render() {
    const total = this.pages.length;
    const bookTitle = this.book?.title || 'Vista Previa';
    const primaryColor = this.book?.primaryColor || '#2563EB';
    const brandName = this.book?.brandName || 'FLIPBLUE';

    this.container.innerHTML = `
      <!-- Blue Pre-loader Screen -->
      <div id="reader-preloader" class="fixed inset-0 z-60 bg-[#F8FAFC] flex items-center justify-center p-6 transition-opacity duration-400">
        <div class="w-full max-w-md bg-white p-8 rounded-xl border border-slate-200 shadow-sm text-center">
          <div class="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md text-xs font-semibold mb-4 border" style="background-color: ${primaryColor}15; color: ${primaryColor}; border-color: ${primaryColor}30;">
            <span class="w-2 h-2 rounded-full animate-pulse" style="background-color: ${primaryColor};"></span>
            <span>${escapeHtml(brandName.toUpperCase())}</span>
          </div>

          <h2 class="text-xl font-bold text-slate-900 line-clamp-1 mb-1" title="${escapeHtml(bookTitle)}">
            ${escapeHtml(bookTitle)}
          </h2>
          <p class="text-xs text-slate-500 mb-6">
            Precargando páginas en la memoria del navegador...
          </p>

          <!-- Progress Bar Container -->
          <div class="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mb-3.5 border border-slate-200">
            <div id="reader-progress-fill" class="h-full rounded-full transition-all duration-200 ease-out" style="width: 0%; background-color: ${primaryColor};"></div>
          </div>

          <div class="flex items-center justify-between text-xs font-medium text-slate-500">
            <span id="reader-progress-status">Iniciando caché...</span>
            <span id="reader-progress-ratio" class="font-bold text-slate-700">0 / ${total} (0%)</span>
          </div>
        </div>
      </div>

      <!-- Top Header Controls Bar -->
      <div class="absolute top-3 left-3 sm:top-4 sm:left-4 z-40 flex items-center gap-1.5 sm:gap-2">
        <button id="reader-close-btn" class="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-md bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-xs text-xs font-medium transition cursor-pointer shrink-0 whitespace-nowrap" title="Volver a la biblioteca (Esc)">
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span class="hidden sm:inline">Biblioteca</span>
        </button>

        <button id="reader-edit-btn" class="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-md bg-white border border-slate-200 text-slate-700 hover:text-blue-600 hover:bg-slate-50 shadow-xs text-xs font-medium transition cursor-pointer shrink-0 whitespace-nowrap" title="Editar publicación">
          <svg class="w-3.5 h-3.5 shrink-0" style="color: ${primaryColor};" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
          </svg>
          <span class="hidden sm:inline">Editar</span>
        </button>

        ${
          brandName && brandName !== 'FLIPBLUE'
            ? `<div class="hidden md:flex items-center px-2.5 py-1 rounded-md bg-white/90 border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs">
                ${escapeHtml(brandName)}
               </div>`
            : ''
        }
      </div>

      <div class="absolute top-3 right-3 sm:top-4 sm:right-4 z-40 flex items-center gap-1.5 sm:gap-2">
        <button id="reader-export-btn" class="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-white shadow-xs text-xs font-semibold transition cursor-pointer shrink-0 whitespace-nowrap hover:opacity-90" style="background-color: ${primaryColor};" title="Exportar paquete ZIP autónomo">
          <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span class="hidden sm:inline">Exportar ZIP</span>
          <span class="sm:hidden">Exportar</span>
        </button>
      </div>

      <!-- Viewport for Panzoom & Flipbook -->
      <div id="reader-viewport" class="flex-1 w-full relative overflow-hidden flex items-center justify-center p-2 sm:p-4">
        <div id="reader-book-wrapper" class="relative flex items-center justify-center origin-center select-none" style="touch-action: none;">
          <div id="reader-flipbook" class="relative"></div>
        </div>
      </div>

      <!-- Filmstrip / Thumbnails Drawer Overlay -->
      <div
        id="reader-thumbnails-drawer"
        class="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-[95vw] max-w-4xl bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-2xl p-3 transition-all duration-300 ${
          this.showThumbnailsDrawer ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none hidden'
        }"
      >
        <div class="flex items-center justify-between mb-2 px-2">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-slate-800">Navegación por miniaturas</span>
            <span class="text-[10px] font-mono text-slate-500">${total} páginas</span>
          </div>
          <button id="close-thumbnails-btn" class="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer" title="Cerrar miniaturas">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div id="thumbnails-track" class="flex items-center gap-3 overflow-x-auto py-2 px-1">
          ${this.pages
            .map(
              (p, i) => `
            <button
              data-thumb-page="${i}"
              class="thumb-btn flex-shrink-0 flex flex-col items-center gap-1 group cursor-pointer transition transform hover:scale-105"
            >
              <div class="w-16 h-22 rounded-md overflow-hidden bg-slate-100 border-2 transition-all ${
                i === this.currentPageIndex
                  ? 'ring-2 ring-offset-1 shadow-sm'
                  : 'border-slate-200 group-hover:border-slate-400'
              }" style="${i === this.currentPageIndex ? `border-color: ${primaryColor}; ring-color: ${primaryColor};` : ''}">
                <img src="${this.pageUrls[i]}" alt="Pág ${i + 1}" class="w-full h-full object-cover pointer-events-none" />
              </div>
              <span class="text-[10px] font-mono ${i === this.currentPageIndex ? 'font-bold text-slate-900' : 'text-slate-500'}">
                ${i + 1}
              </span>
            </button>
          `
            )
            .join('')}
        </div>
      </div>

      <!-- Floating Bottom Navigation UI -->
      <div id="reader-bottom-controls" class="floating-controls fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[95vw]">
        <div class="flex items-center gap-1 sm:gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-lg overflow-x-auto">
          <!-- Jump to First Cover -->
          <button id="ctrl-first-btn" class="hidden sm:flex w-8 h-8 shrink-0 rounded-md items-center justify-center text-slate-600 hover:bg-slate-100 transition cursor-pointer" title="Ir a la portada">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="11 17 6 12 11 7"></polyline>
              <polyline points="18 17 13 12 18 7"></polyline>
            </svg>
          </button>

          <!-- Prev Page Arrow -->
          <button id="ctrl-prev-btn" class="w-8 h-8 shrink-0 rounded-md flex items-center justify-center text-slate-700 hover:text-white transition cursor-pointer" style="--btn-color: ${primaryColor}" title="Página anterior (flecha izquierda)">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>

          <!-- Page Indicator -->
          <div class="px-2 shrink-0 text-xs sm:text-sm font-semibold text-slate-800 whitespace-nowrap">
            <span id="ctrl-curr-page">1</span>
            <span class="text-slate-400 font-normal mx-0.5">/</span>
            <span class="text-slate-500 font-medium">${total}</span>
          </div>

          <!-- Next Page Arrow -->
          <button id="ctrl-next-btn" class="w-8 h-8 shrink-0 rounded-md flex items-center justify-center text-slate-700 hover:text-white transition cursor-pointer" style="--btn-color: ${primaryColor}" title="Página siguiente (flecha derecha)">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>

          <!-- Jump to Last Cover -->
          <button id="ctrl-last-btn" class="hidden sm:flex w-8 h-8 shrink-0 rounded-md items-center justify-center text-slate-600 hover:bg-slate-100 transition cursor-pointer" title="Ir a la contraportada">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="13 17 18 12 13 7"></polyline>
              <polyline points="6 17 11 12 6 7"></polyline>
            </svg>
          </button>

          <div class="w-px h-5 bg-slate-200 mx-1 shrink-0"></div>

          <!-- Thumbnails Drawer Toggle -->
          <button
            id="ctrl-thumbnails-btn"
            class="w-8 h-8 shrink-0 rounded-md flex items-center justify-center text-slate-600 hover:bg-slate-100 transition cursor-pointer ${
              this.showThumbnailsDrawer ? 'bg-slate-100 text-blue-600' : ''
            }"
            title="Mostrar / ocultar miniaturas de páginas"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </button>

          <!-- Single vs Spread View Toggle -->
          <button
            id="ctrl-viewmode-btn"
            class="w-8 h-8 shrink-0 rounded-md flex items-center justify-center text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            title="${this.isSinglePageMode ? 'Cambiar a 2 páginas (Spread)' : 'Cambiar a 1 página centrada'}"
          >
            ${
              this.isSinglePageMode
                ? `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" title="Modo 1 página activo">
                    <rect x="6" y="3" width="12" height="18" rx="2"></rect>
                    <line x1="9" y1="7" x2="15" y2="7"></line>
                    <line x1="9" y1="11" x2="15" y2="11"></line>
                   </svg>`
                : `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" title="Modo 2 páginas activo">
                    <rect x="2" y="3" width="9" height="18" rx="1.5"></rect>
                    <rect x="13" y="3" width="9" height="18" rx="1.5"></rect>
                   </svg>`
            }
          </button>

          <div class="w-px h-5 bg-slate-200 mx-1 shrink-0"></div>

          <!-- Zoom Controls & Panzoom Slider -->
          <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button id="ctrl-zoom-out" class="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-100 transition cursor-pointer" title="Reducir zoom (-)">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>

            <input
              id="ctrl-zoom-slider"
              type="range"
              min="0.5"
              max="3"
              step="0.05"
              value="1"
              class="hidden sm:block w-20 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              style="accent-color: ${primaryColor};"
              title="Control deslizante de zoom"
            />

            <button id="ctrl-zoom-in" class="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-100 transition cursor-pointer" title="Aumentar zoom (+)">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>

            <button
              id="ctrl-zoom-reset-btn"
              class="h-7 px-2 rounded-md flex items-center gap-1.5 text-[11px] font-mono font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 transition cursor-pointer"
              title="Restablecer zoom al 100%"
            >
              <svg class="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                <polyline points="3 3 3 8 8 8"></polyline>
              </svg>
              <span id="ctrl-zoom-label" class="hidden sm:inline">100%</span>
            </button>
          </div>

          <div class="w-px h-5 bg-slate-200 mx-1 hidden sm:block"></div>

          <!-- Fullscreen Toggle -->
          <button id="ctrl-fullscreen-btn" class="w-8 h-8 rounded-md hidden sm:flex items-center justify-center text-slate-600 hover:bg-slate-100 transition cursor-pointer" title="Pantalla completa">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
            </svg>
          </button>
        </div>
      </div>
    `;

    this.bindHeaderAndControlEvents();
  }

  private async startPreloaderAndInit() {
    const preloader = this.container.querySelector<HTMLElement>('#reader-preloader');
    const fill = this.container.querySelector<HTMLElement>('#reader-progress-fill');
    const ratio = this.container.querySelector<HTMLElement>('#reader-progress-ratio');
    const status = this.container.querySelector<HTMLElement>('#reader-progress-status');

    let loadedCount = 0;
    const total = this.pageUrls.length;

    for (let i = 0; i < total; i++) {
      const url = this.pageUrls[i];
      await new Promise<void>((resolve) => {
        const img = new Image();
        const finish = () => {
          loadedCount++;
          if (img.naturalWidth > 0 && img.naturalHeight > 0 && this.detectedRatio === 1.414) {
            this.detectedRatio = img.naturalHeight / img.naturalWidth;
          }
          const pct = Math.round((loadedCount / total) * 100);
          if (fill) fill.style.width = `${pct}%`;
          if (ratio) ratio.textContent = `${loadedCount} / ${total} (${pct}%)`;
          if (status) status.textContent = `Precargando página ${loadedCount} de ${total}...`;
          resolve();
        };
        img.onload = finish;
        img.onerror = finish;
        img.src = url;
      });
    }

    if (status) status.textContent = '¡Páginas cargadas! Inicializando libro...';
    await new Promise((r) => setTimeout(r, 200));

    if (preloader) {
      preloader.classList.add('opacity-0', 'pointer-events-none');
      setTimeout(() => {
        preloader.style.display = 'none';
      }, 400);
    }

    this.initStPageFlip();
    this.initPanzoom();
    this.bindKeyboardShortcuts();
  }

  private initStPageFlip(targetPage = this.currentPageIndex) {
    const viewport = this.container.querySelector<HTMLElement>('#reader-viewport');
    const wrapper = this.container.querySelector<HTMLElement>('#reader-book-wrapper');
    if (!viewport || !wrapper) return;

    if (this.pageFlipInstance) {
      try {
        this.pageFlipInstance.destroy();
      } catch (e) {
        console.warn('Error destroying old PageFlip:', e);
      }
      this.pageFlipInstance = null;
    }

    // destroy() removes the flipbook node from the DOM, so rebuild it fresh.
    const oldFlipbook = this.container.querySelector<HTMLElement>('#reader-flipbook');
    const flipbookEl = document.createElement('div');
    flipbookEl.id = 'reader-flipbook';
    flipbookEl.className = 'relative';
    if (oldFlipbook) {
      oldFlipbook.remove();
    }
    wrapper.appendChild(flipbookEl);

    const useHardCover = this.book?.hardCover !== false;

    // Create page elements
    this.pages.forEach((_, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === this.pages.length - 1;
      const isHard = useHardCover && (isFirst || isLast);

      const pageDiv = document.createElement('div');
      pageDiv.className = 'flip-page';
      pageDiv.setAttribute('data-density', isHard ? 'hard' : 'soft');
      pageDiv.style.width = '100%';
      pageDiv.style.height = '100%';
      pageDiv.style.backgroundColor = isHard ? '#1e293b' : '#ffffff';
      pageDiv.style.overflow = 'hidden';

      const img = document.createElement('img');
      img.src = this.pageUrls[idx];
      img.alt = isFirst ? 'Portada' : isLast ? 'Contraportada' : `Página ${idx + 1}`;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      img.style.pointerEvents = 'none';

      pageDiv.appendChild(img);
      flipbookEl.appendChild(pageDiv);
    });

    const vpW = viewport.clientWidth || window.innerWidth;
    const vpH = viewport.clientHeight || window.innerHeight;
    const isMobile = vpW < 768;

    const availH = Math.max(vpH - 150, 300);
    const availW = Math.max(vpW - 48, 280);
    const ratio = this.detectedRatio > 0.2 && this.detectedRatio < 5 ? this.detectedRatio : 1.414;

    const forceSingle = this.isSinglePageMode || isMobile;

    let pageWidth: number;
    let pageHeight: number;

    if (forceSingle) {
      pageWidth = Math.min(availW, 600);
      pageHeight = pageWidth * ratio;
      if (pageHeight > availH) {
        pageHeight = availH;
        pageWidth = pageHeight / ratio;
      }
    } else {
      pageHeight = Math.min(availH, 780);
      pageWidth = pageHeight / ratio;
      if (pageWidth * 2 > availW) {
        pageWidth = availW / 2;
        pageHeight = pageWidth * ratio;
      }
    }

    pageWidth = Math.round(pageWidth);
    pageHeight = Math.round(pageHeight);

    const totalBookWidth = forceSingle ? pageWidth : pageWidth * 2;
    const totalBookHeight = pageHeight;

    wrapper.style.width = `${totalBookWidth}px`;
    wrapper.style.height = `${totalBookHeight}px`;
    flipbookEl.style.width = `${totalBookWidth}px`;
    flipbookEl.style.height = `${totalBookHeight}px`;

    try {
      this.pageFlipInstance = new PageFlip(flipbookEl, {
        width: pageWidth,
        height: pageHeight,
        size: 'fixed',
        minWidth: pageWidth,
        maxWidth: pageWidth,
        minHeight: pageHeight,
        maxHeight: pageHeight,
        drawShadow: true,
        flippingTime: 600,
        usePortrait: forceSingle,
        startPage: targetPage,
        showCover: true,
        autoSize: true,
        maxShadowOpacity: 0.4,
        mobileScrollSupport: false,
        useTouchEvents: !isMobile,
      });

      const items = flipbookEl.querySelectorAll<HTMLElement>('.flip-page');
      this.pageFlipInstance.loadFromHTML(items);

      this.pageFlipInstance.on('flip', (e) => {
        this.updatePageCounter(Number(e.data));
      });

      this.pageFlipInstance.on('init', (e) => {
        this.updatePageCounter(Number(e.data.page));
      });
    } catch (err) {
      console.error('Error initializing StPageFlip:', err);
    }
  }

  private updatePageCounter(pageIndex: number) {
    this.currentPageIndex = pageIndex;
    const pageLabel = this.container.querySelector<HTMLElement>('#ctrl-curr-page');
    if (pageLabel) {
      pageLabel.textContent = (pageIndex + 1).toString();
    }

    // Update thumbnail border and indicator
    const primaryColor = this.book?.primaryColor || '#2563EB';
    const track = this.container.querySelector<HTMLElement>('#thumbnails-track');
    if (track) {
      track.querySelectorAll('.thumb-btn').forEach((btn, idx) => {
        const borderBox = btn.querySelector('div');
        const numLabel = btn.querySelector('span');
        if (idx === pageIndex) {
          if (borderBox) {
            borderBox.style.borderColor = primaryColor;
            borderBox.classList.add('ring-2', 'ring-offset-1', 'shadow-sm');
          }
          if (numLabel) {
            numLabel.classList.add('font-bold', 'text-slate-900');
            numLabel.classList.remove('text-slate-500');
          }
          // Scroll active thumbnail smoothly into view
          (btn as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } else {
          if (borderBox) {
            borderBox.style.borderColor = '#E2E8F0';
            borderBox.classList.remove('ring-2', 'ring-offset-1', 'shadow-sm');
          }
          if (numLabel) {
            numLabel.classList.remove('font-bold', 'text-slate-900');
            numLabel.classList.add('text-slate-500');
          }
        }
      });
    }
  }

  private initPanzoom() {
    const wrapper = this.container.querySelector<HTMLElement>('#reader-book-wrapper');
    const viewport = this.container.querySelector<HTMLElement>('#reader-viewport');
    const slider = this.container.querySelector<HTMLInputElement>('#ctrl-zoom-slider');
    const label = this.container.querySelector<HTMLElement>('#ctrl-zoom-label');
    if (!wrapper || !viewport) return;

    this.panzoomInstance = Panzoom(wrapper, {
      startScale: 1,
      minScale: 0.5,
      maxScale: 3,
      step: 0.15,
      panOnlyWhenZoomed: true,
      cursor: 'default',
      handleStartEvent: (event: Event) => {
        if (this.panzoomInstance && this.panzoomInstance.getScale() > 1.05) {
          event.preventDefault();
        }
      },
    });

    if (slider) slider.value = '1';
    if (label) label.textContent = '100%';

    wrapper.addEventListener('panzoomchange', (e: Event) => {
      const customEvent = e as CustomEvent<{ scale: number }>;
      const scale = customEvent.detail.scale;
      if (slider) slider.value = scale.toFixed(2);
      if (label) label.textContent = `${Math.round(scale * 100)}%`;
      if (viewport) {
        viewport.style.cursor = scale > 1.05 ? 'grab' : 'default';
      }
    });

    this.wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      this.panzoomInstance?.zoomWithWheel(e, { step: 0.1 });
    };
    viewport.addEventListener('wheel', this.wheelHandler, { passive: false });

    if (slider) {
      slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        this.panzoomInstance?.zoom(val, { animate: false });
      });
    }

    viewport.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('button, input, a, #reader-bottom-controls, #reader-thumbnails-drawer')) return;
      if (!this.panzoomInstance) return;
      if (this.panzoomInstance.getScale() > 1.05) {
        this.panzoomInstance.reset({ animate: true });
      } else {
        this.panzoomInstance.zoomToPoint(1.6, { clientX: e.clientX, clientY: e.clientY }, { animate: true });
      }
    });
  }

  private bindKeyboardShortcuts() {
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        this.pageFlipInstance?.flipPrev();
      } else if (e.key === 'ArrowRight') {
        this.pageFlipInstance?.flipNext();
      } else if (e.key === 'Home') {
        this.pageFlipInstance?.turnToPage(0);
      } else if (e.key === 'End') {
        this.pageFlipInstance?.turnToPage(this.pages.length - 1);
      } else if (e.key === 'Escape') {
        if (this.showThumbnailsDrawer) {
          this.toggleThumbnails(false);
        } else if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          this.callbacks.onBack();
        }
      } else if (e.key === '+' || e.key === '=') {
        this.panzoomInstance?.zoomIn({ step: 0.25 });
      } else if (e.key === '-' || e.key === '_') {
        this.panzoomInstance?.zoomOut({ step: 0.25 });
      } else if (e.key === '0') {
        this.panzoomInstance?.reset({ animate: true });
      }
    };
    window.addEventListener('keydown', this.keydownHandler);
  }

  private toggleThumbnails(show?: boolean) {
    this.showThumbnailsDrawer = show !== undefined ? show : !this.showThumbnailsDrawer;
    const drawer = this.container.querySelector<HTMLElement>('#reader-thumbnails-drawer');
    const btn = this.container.querySelector<HTMLElement>('#ctrl-thumbnails-btn');
    if (!drawer) return;

    if (this.showThumbnailsDrawer) {
      drawer.style.display = 'block';
      setTimeout(() => {
        drawer.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none', 'hidden');
        drawer.classList.add('opacity-100', 'translate-y-0', 'pointer-events-auto');
      }, 10);
      btn?.classList.add('bg-slate-100', 'text-blue-600');
    } else {
      drawer.classList.remove('opacity-100', 'translate-y-0', 'pointer-events-auto');
      drawer.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
      setTimeout(() => {
        drawer.style.display = 'none';
      }, 300);
      btn?.classList.remove('bg-slate-100', 'text-blue-600');
    }
  }

  private bindHeaderAndControlEvents() {
    this.container.querySelector('#reader-close-btn')?.addEventListener('click', () => {
      this.callbacks.onBack();
    });

    this.container.querySelector('#reader-edit-btn')?.addEventListener('click', () => {
      if (this.bookId) this.callbacks.onEdit(this.bookId);
    });

    this.container.querySelector('#reader-export-btn')?.addEventListener('click', () => {
      this.handleExport();
    });

    this.container.querySelector('#ctrl-prev-btn')?.addEventListener('click', () => {
      this.pageFlipInstance?.flipPrev();
    });

    this.container.querySelector('#ctrl-next-btn')?.addEventListener('click', () => {
      this.pageFlipInstance?.flipNext();
    });

    this.container.querySelector('#ctrl-first-btn')?.addEventListener('click', () => {
      this.pageFlipInstance?.turnToPage(0);
    });

    this.container.querySelector('#ctrl-last-btn')?.addEventListener('click', () => {
      this.pageFlipInstance?.turnToPage(this.pages.length - 1);
    });

    // Thumbnails toggle & close
    this.container.querySelector('#ctrl-thumbnails-btn')?.addEventListener('click', () => {
      this.toggleThumbnails();
    });

    this.container.querySelector('#close-thumbnails-btn')?.addEventListener('click', () => {
      this.toggleThumbnails(false);
    });

    // Thumbnails click navigation
    this.container.querySelectorAll<HTMLElement>('[data-thumb-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = Number(btn.getAttribute('data-thumb-page'));
        if (!isNaN(page)) {
          this.pageFlipInstance?.flip(page);
        }
      });
    });

    // View mode toggle (1 page vs 2 pages)
    this.container.querySelector('#ctrl-viewmode-btn')?.addEventListener('click', () => {
      this.isSinglePageMode = !this.isSinglePageMode;
      showToast({
        message: this.isSinglePageMode ? 'Modo 1 página centrada activado' : 'Modo 2 páginas (Spread) activado',
        type: 'info',
      });
      this.initStPageFlip(this.currentPageIndex);

      // Update button icon/title
      const btn = this.container.querySelector<HTMLElement>('#ctrl-viewmode-btn');
      if (btn) {
        btn.title = this.isSinglePageMode ? 'Cambiar a 2 páginas (Spread)' : 'Cambiar a 1 página centrada';
        btn.innerHTML = this.isSinglePageMode
          ? `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="6" y="3" width="12" height="18" rx="2"></rect>
              <line x1="9" y1="7" x2="15" y2="7"></line>
              <line x1="9" y1="11" x2="15" y2="11"></line>
             </svg>`
          : `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="9" height="18" rx="1.5"></rect>
              <rect x="13" y="3" width="9" height="18" rx="1.5"></rect>
             </svg>`;
      }
    });

    this.container.querySelector('#ctrl-zoom-in')?.addEventListener('click', () => {
      this.panzoomInstance?.zoomIn({ step: 0.2 });
    });

    this.container.querySelector('#ctrl-zoom-out')?.addEventListener('click', () => {
      this.panzoomInstance?.zoomOut({ step: 0.2 });
    });

    const handleResetZoom = () => {
      this.panzoomInstance?.reset({ animate: true });
    };
    this.container.querySelector('#ctrl-zoom-reset-btn')?.addEventListener('click', handleResetZoom);
    this.container.querySelector('#ctrl-zoom-label')?.addEventListener('click', handleResetZoom);

    this.container.querySelector('#ctrl-fullscreen-btn')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  private async handleExport() {
    if (!this.book || this.pages.length === 0) return;
    const toastDismiss = showToast({
      message: `Compilando paquete ZIP autónomo para "${this.book.title}"...`,
      type: 'info',
      duration: 0,
    });

    try {
      await exportBookAsZip(this.book, this.pages);
      toastDismiss();
      showToast({
        message: `¡Paquete exportado con éxito!`,
        type: 'success',
      });
    } catch (err) {
      toastDismiss();
      console.error('Export failed:', err);
      showToast({ message: 'Error al exportar el paquete', type: 'error' });
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

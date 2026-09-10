import JSZip from 'jszip';
import type { BookRecord, PageRecord } from '../types';

/**
 * Fetch vendor script content with fallback
 */
async function fetchVendorScript(path: string): Promise<string> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: HTTP ${response.status}`);
  }
  return await response.text();
}

/**
 * Generate standalone index.html content
 */
function generateStandaloneHtml(book: BookRecord, pages: PageRecord[]): string {
  const primaryColor = book.primaryColor || '#2563EB';
  const brandName = book.brandName || 'EDICIÓN AUTÓNOMA FLIPBLUE';
  const useHard = book.hardCover !== false;

  const pageDivs = pages
    .map((page, idx) => {
      const isHard = useHard && (idx === 0 || idx === pages.length - 1);
      const density = isHard ? 'hard' : 'soft';
      const label = idx === 0 ? 'Portada' : idx === pages.length - 1 ? 'Contraportada' : `Página ${idx + 1}`;
      return `      <div class="flip-page" data-density="${density}">
        <img src="pages/${page.fileName}" alt="${label}" loading="eager" />
      </div>`;
    })
    .join('\n');

  const thumbnailItems = pages
    .map(
      (page, idx) => `
        <button class="thumb-btn" data-page="${idx}">
          <div class="thumb-box">
            <img src="pages/${page.fileName}" alt="Pág ${idx + 1}" />
          </div>
          <span>${idx + 1}</span>
        </button>`
    )
    .join('\n');

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
    <title>${escapeHtml(book.title)}</title>
    <meta name="description" content="${escapeHtml(book.description || book.title)}" />
    <meta name="theme-color" content="${primaryColor}" />
    <link rel="stylesheet" href="css/style.css" />
  </head>
  <body>
    <!-- Mandatory Blue Pre-loader Screen -->
    <div id="preloader" class="preloader-overlay">
      <div class="preloader-content">
        <div class="preloader-badge">${escapeHtml(brandName.toUpperCase())}</div>
        <h1 class="preloader-title">${escapeHtml(book.title)}</h1>
        <p class="preloader-desc">${escapeHtml(book.description || 'Publicación Interactiva con Efecto Flip-Page')}</p>
        
        <div class="progress-bar-container">
          <div id="progress-bar" class="progress-bar-fill"></div>
        </div>

        <div class="progress-stats">
          <span id="progress-text">Precargando páginas en la caché del navegador...</span>
          <span id="progress-counter">0 / ${pages.length}</span>
        </div>
      </div>
    </div>

    <!-- Main Viewport for Panzoom & Reader -->
    <div id="viewport" class="reader-viewport">
      <div id="book-wrapper" class="book-wrapper">
        <div id="flipbook" class="flipbook">
${pageDivs}
        </div>
      </div>
    </div>

    <!-- Filmstrip Thumbnails Drawer -->
    <div id="thumbnails-drawer" class="thumbnails-drawer">
      <div class="thumbnails-header">
        <span class="thumbnails-title">Miniaturas de páginas (${pages.length})</span>
        <button id="btn-close-thumbs" class="btn-close-thumbs">&times;</button>
      </div>
      <div id="thumbnails-track" class="thumbnails-track">
${thumbnailItems}
      </div>
    </div>

    <!-- Floating Navigation Bar -->
    <div id="floating-bar" class="floating-controls">
      <div class="controls-pill">
        <button id="btn-first" class="btn-ctrl" title="Ir a la portada (primera página)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="11 17 6 12 11 7"></polyline>
            <polyline points="18 17 13 12 18 7"></polyline>
          </svg>
        </button>

        <button id="btn-prev" class="btn-ctrl" title="Página anterior (Flecha izquierda)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>

        <div class="page-indicator">
          <span id="curr-page-label">1</span>
          <span class="page-sep">/</span>
          <span>${pages.length}</span>
        </div>

        <button id="btn-next" class="btn-ctrl" title="Página siguiente (Flecha derecha)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>

        <button id="btn-last" class="btn-ctrl" title="Ir a la contraportada (última página)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="13 17 18 12 13 7"></polyline>
            <polyline points="6 17 11 12 6 7"></polyline>
          </svg>
        </button>

        <div class="ctrl-divider"></div>

        <!-- Thumbnails Toggle Button -->
        <button id="btn-thumbs" class="btn-ctrl" title="Ver miniaturas de páginas">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
        </button>

        <!-- Single vs Double Spread Toggle Button -->
        <button id="btn-viewmode" class="btn-ctrl" title="Cambiar modo de visualización">
          <svg id="icon-viewmode" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="9" height="18" rx="1.5"></rect>
            <rect x="13" y="3" width="9" height="18" rx="1.5"></rect>
          </svg>
        </button>

        <div class="ctrl-divider"></div>

        <!-- Zoom Controls with Panzoom Slider -->
        <div class="zoom-controls">
          <button id="btn-zoom-out" class="btn-ctrl btn-small" title="Reducir zoom (-)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          
          <input
            type="range"
            id="zoom-slider"
            min="0.5"
            max="3"
            step="0.05"
            value="1"
            title="Control deslizante de zoom"
          />

          <button id="btn-zoom-in" class="btn-ctrl btn-small" title="Aumentar zoom (+)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>

          <button id="btn-zoom-reset" class="btn-zoom-reset" title="Restablecer zoom al 100%">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
              <polyline points="3 3 3 8 8 8"></polyline>
            </svg>
            <span id="zoom-label">100%</span>
          </button>
        </div>

        <div class="ctrl-divider"></div>

        <button id="btn-fullscreen" class="btn-ctrl" title="Pantalla completa (F)">
          <svg id="icon-fs" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
          </svg>
        </button>
      </div>
    </div>

    <!-- Standalone Scripts (No CDNs) -->
    <script src="js/page-flip.browser.js"></script>
    <script src="js/panzoom.min.js"></script>
    <script src="js/reader.js"></script>
  </body>
</html>`;
}

/**
 * Generate standalone css/style.css
 */
function generateStandaloneCss(book: BookRecord): string {
  const primary = book.primaryColor || '#2563EB';

  return `/* FlipBlue Autonomous Flipbook Stylesheet */
:root {
  --primary: ${primary};
  --primary-hover: ${primary};
  --bg-color: #F8FAFC;
  --surface: #FFFFFF;
  --text-main: #0F172A;
  --text-muted: #64748B;
  --border-color: #E2E8F0;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: var(--bg-color);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  color: var(--text-main);
  user-select: none;
}

/* Pre-loader Screen with Mandatory Blue Progress Bar */
.preloader-overlay {
  position: fixed;
  inset: 0;
  background-color: #F8FAFC;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 24px;
  transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.4s;
}

.preloader-content {
  width: 100%;
  max-width: 440px;
  background: var(--surface);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 32px 28px;
  text-align: center;
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05);
}

.preloader-badge {
  display: inline-block;
  background-color: rgba(37, 99, 235, 0.1);
  color: var(--primary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 4px 10px;
  border-radius: 6px;
  margin-bottom: 16px;
}

.preloader-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preloader-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 24px;
  line-height: 1.4;
}

.progress-bar-container {
  width: 100%;
  height: 10px;
  background-color: #F1F5F9;
  border-radius: 9999px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  margin-bottom: 14px;
}

.progress-bar-fill {
  height: 100%;
  width: 0%;
  background-color: var(--primary);
  border-radius: 9999px;
  transition: width 0.2s ease-out;
}

.progress-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-muted);
}

#progress-counter {
  font-weight: 700;
  color: var(--text-main);
}

/* Viewport & Panzoom Layer */
.reader-viewport {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #F8FAFC;
}

.book-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: center center;
  touch-action: none;
}

.flipbook {
  position: relative;
  display: block;
  margin: 0 auto;
}

.flip-page {
  background-color: #FFFFFF;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.flip-page[data-density="hard"] {
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.flip-page img {
  width: 100%;
  height: 100%;
  object-fit: fill;
  display: block;
  pointer-events: none;
}

/* StPageFlip required styles */
.stf__parent {
  position: relative;
  display: block;
  box-sizing: border-box;
  transform: translateZ(0);
}
.stf__wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}
.stf__parent canvas {
  position: absolute;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
}
.stf__block {
  position: absolute;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  perspective: 2000px;
}
.stf__item {
  display: none;
  position: absolute;
  transform-style: preserve-3d;
}
.stf__outerShadow,
.stf__innerShadow,
.stf__hardShadow,
.stf__hardInnerShadow {
  position: absolute;
  left: 0;
  top: 0;
}

/* Filmstrip Thumbnails Drawer */
.thumbnails-drawer {
  position: fixed;
  bottom: 84px;
  left: 50%;
  transform: translateX(-50%) translateY(10px);
  width: 95vw;
  max-width: 860px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.15);
  padding: 12px 16px;
  z-index: 1000;
  opacity: 0;
  pointer-events: none;
  transition: all 0.25s ease-out;
}

.thumbnails-drawer.active {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0);
}

.thumbnails-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding: 0 4px;
}

.thumbnails-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-main);
}

.btn-close-thumbs {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0 4px;
}

.btn-close-thumbs:hover {
  color: var(--text-main);
}

.thumbnails-track {
  display: flex;
  align-items: center;
  gap: 12px;
  overflow-x: auto;
  padding: 4px 2px 8px;
  scrollbar-width: thin;
}

.thumb-btn {
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  transition: transform 0.15s;
}

.thumb-btn:hover {
  transform: scale(1.05);
}

.thumb-box {
  width: 60px;
  height: 84px;
  border-radius: 6px;
  overflow: hidden;
  background: #f1f5f9;
  border: 2px solid var(--border-color);
  transition: border-color 0.15s;
}

.thumb-btn.active .thumb-box {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.3);
}

.thumb-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.thumb-btn span {
  font-size: 10px;
  font-family: monospace;
  color: var(--text-muted);
}

.thumb-btn.active span {
  font-weight: 700;
  color: var(--text-main);
}

/* Floating Navigation Bar */
.floating-controls {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 900;
  max-width: 96vw;
}

.controls-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background-color: var(--surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.02);
}

.btn-ctrl {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-main);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-ctrl:hover {
  background-color: #F1F5F9;
  color: var(--primary);
}

.btn-ctrl.active {
  background-color: rgba(37, 99, 235, 0.1);
  color: var(--primary);
}

.btn-small {
  width: 28px;
  height: 28px;
}

.page-indicator {
  display: flex;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  padding: 0 8px;
  white-space: nowrap;
}

.page-sep {
  margin: 0 4px;
  color: var(--border-color);
  font-weight: 400;
}

.ctrl-divider {
  width: 1px;
  height: 20px;
  background-color: var(--border-color);
  margin: 0 4px;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

#zoom-slider {
  width: 80px;
  height: 5px;
  -webkit-appearance: none;
  appearance: none;
  background: #E2E8F0;
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}

#zoom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--primary);
  cursor: pointer;
}

.btn-zoom-reset {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-main);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.btn-zoom-reset:hover {
  background-color: #EFF6FF;
  color: var(--primary);
  border-color: #BFDBFE;
}

@media (max-width: 640px) {
  .controls-pill {
    padding: 4px 8px;
    gap: 2px;
  }
  .btn-ctrl {
    width: 32px;
    height: 32px;
  }
  #btn-first, #btn-last {
    display: none;
  }
  #zoom-slider {
    width: 50px;
  }
}
`;
}

/**
 * Generate standalone js/reader.js
 */
function generateStandaloneJs(book: BookRecord, totalPages: number): string {
  const initialSinglePage = book.singlePageMode ? 'true' : 'false';

  return `/**
 * FlipBlue Autonomous Flipbook Reader
 * StPageFlip + Panzoom integration
 */
(function () {
  'use strict';

  const totalPages = ${totalPages};
  let isSinglePageMode = ${initialSinglePage};

  const preloader = document.getElementById('preloader');
  const progressBar = document.getElementById('progress-bar');
  const progressCounter = document.getElementById('progress-counter');
  const progressText = document.getElementById('progress-text');
  
  const viewport = document.getElementById('viewport');
  const bookWrapper = document.getElementById('book-wrapper');
  let flipbookEl = document.getElementById('flipbook');
  
  const currPageLabel = document.getElementById('curr-page-label');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnFirst = document.getElementById('btn-first');
  const btnLast = document.getElementById('btn-last');
  const btnThumbs = document.getElementById('btn-thumbs');
  const btnViewMode = document.getElementById('btn-viewmode');
  const thumbsDrawer = document.getElementById('thumbnails-drawer');
  const btnCloseThumbs = document.getElementById('btn-close-thumbs');
  const thumbsTrack = document.getElementById('thumbnails-track');

  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const zoomSlider = document.getElementById('zoom-slider');
  const zoomLabel = document.getElementById('zoom-label');
  const btnZoomReset = document.getElementById('btn-zoom-reset');
  const btnFullscreen = document.getElementById('btn-fullscreen');

  let pageFlip = null;
  let panzoom = null;
  let detectedRatio = 1.414;
  let currentPageIndex = 0;

  // 1. Mandatory Pre-loading of all PNGs into browser cache
  function preloadImages() {
    return new Promise((resolve) => {
      const pageImgs = Array.from(document.querySelectorAll('.flip-page img'));
      let loadedCount = 0;
      const total = pageImgs.length;

      if (total === 0) {
        resolve();
        return;
      }

      function onSingleImageDone(img) {
        loadedCount++;
        if (img && img.naturalWidth > 0 && img.naturalHeight > 0 && detectedRatio === 1.414) {
          detectedRatio = img.naturalHeight / img.naturalWidth;
        }
        const pct = Math.round((loadedCount / total) * 100);
        if (progressBar) progressBar.style.width = pct + '%';
        if (progressCounter) progressCounter.textContent = loadedCount + ' / ' + total;
        if (progressText) progressText.textContent = 'Precargando ' + pct + '% en memoria...';

        if (loadedCount >= total) {
          setTimeout(resolve, 250);
        }
      }

      pageImgs.forEach((img) => {
        if (img.complete && img.naturalWidth > 0) {
          onSingleImageDone(img);
        } else {
          img.addEventListener('load', () => onSingleImageDone(img));
          img.addEventListener('error', () => onSingleImageDone(img));
        }
      });
    });
  }

  // 2. Initialize StPageFlip
  function initFlipbook(startPage = 0) {
    if (pageFlip) {
      try { pageFlip.destroy(); } catch(e) {}
      pageFlip = null;
      // destroy() removes #flipbook from the DOM, so rebuild it fresh.
      const oldFlipbook = document.getElementById('flipbook');
      const freshFlipbook = document.createElement('div');
      freshFlipbook.id = 'flipbook';
      freshFlipbook.className = 'flipbook';
      if (oldFlipbook) { oldFlipbook.remove(); }
      bookWrapper.appendChild(freshFlipbook);
      flipbookEl = freshFlipbook;
    }

    const vpW = viewport.clientWidth || window.innerWidth;
    const vpH = viewport.clientHeight || window.innerHeight;
    const isMobile = vpW < 768;

    const availH = Math.max(vpH - 150, 300);
    const availW = Math.max(vpW - 48, 280);
    const ratio = detectedRatio > 0.2 && detectedRatio < 5 ? detectedRatio : 1.414;

    const forceSingle = isSinglePageMode || isMobile;

    let pageWidth, pageHeight;
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

    const totalWidth = forceSingle ? pageWidth : pageWidth * 2;
    const totalHeight = pageHeight;
    bookWrapper.style.width = totalWidth + 'px';
    bookWrapper.style.height = totalHeight + 'px';
    flipbookEl.style.width = totalWidth + 'px';
    flipbookEl.style.height = totalHeight + 'px';

    pageFlip = new St.PageFlip(flipbookEl, {
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
      startPage: startPage,
      showCover: true,
      autoSize: true,
      maxShadowOpacity: 0.4,
      mobileScrollSupport: false,
    });

    pageFlip.loadFromHTML(document.querySelectorAll('.flip-page'));

    pageFlip.on('flip', (e) => {
      updatePageDisplay(Number(e.data));
    });

    pageFlip.on('init', (e) => {
      updatePageDisplay(Number(e.data.page));
    });
  }

  function updatePageDisplay(pageIndex) {
    currentPageIndex = pageIndex;
    if (currPageLabel) currPageLabel.textContent = (pageIndex + 1);

    if (thumbsTrack) {
      thumbsTrack.querySelectorAll('.thumb-btn').forEach((btn, idx) => {
        if (idx === pageIndex) {
          btn.classList.add('active');
          btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } else {
          btn.classList.remove('active');
        }
      });
    }
  }

  // 3. Initialize Panzoom on the book container
  function initPanzoom() {
    panzoom = Panzoom(bookWrapper, {
      startScale: 1,
      minScale: 0.5,
      maxScale: 3,
      step: 0.15,
      panOnlyWhenZoomed: true,
      cursor: 'default',
      handleStartEvent: function(event) {
        if (panzoom && panzoom.getScale() > 1.05) {
          event.preventDefault();
        }
      }
    });

    if (zoomSlider) zoomSlider.value = '1';
    if (zoomLabel) zoomLabel.textContent = '100%';

    bookWrapper.addEventListener('panzoomchange', (e) => {
      const scale = e.detail.scale;
      if (zoomSlider) zoomSlider.value = scale.toFixed(2);
      if (zoomLabel) zoomLabel.textContent = Math.round(scale * 100) + '%';
      viewport.style.cursor = scale > 1.05 ? 'grab' : 'default';
    });

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      panzoom.zoomWithWheel(e, { step: 0.1 });
    }, { passive: false });

    if (zoomSlider) {
      zoomSlider.addEventListener('input', () => {
        const val = parseFloat(zoomSlider.value);
        panzoom.zoom(val, { animate: false });
      });
    }

    if (btnZoomIn) btnZoomIn.addEventListener('click', () => panzoom.zoomIn({ step: 0.2 }));
    if (btnZoomOut) btnZoomOut.addEventListener('click', () => panzoom.zoomOut({ step: 0.2 }));

    function handleReset() {
      panzoom.reset({ animate: true });
    }
    if (btnZoomReset) btnZoomReset.addEventListener('click', handleReset);
    if (zoomLabel) zoomLabel.addEventListener('click', handleReset);

    viewport.addEventListener('dblclick', (e) => {
      if (e.target.closest('button, input, a, .floating-controls, .thumbnails-drawer')) return;
      if (panzoom.getScale() > 1.05) {
        panzoom.reset({ animate: true });
      } else {
        panzoom.zoomToPoint(1.6, { clientX: e.clientX, clientY: e.clientY }, { animate: true });
      }
    });
  }

  // 4. Bind events
  function bindEvents() {
    if (btnPrev) btnPrev.addEventListener('click', () => pageFlip && pageFlip.flipPrev());
    if (btnNext) btnNext.addEventListener('click', () => pageFlip && pageFlip.flipNext());
    if (btnFirst) btnFirst.addEventListener('click', () => pageFlip && pageFlip.turnToPage(0));
    if (btnLast) btnLast.addEventListener('click', () => pageFlip && pageFlip.turnToPage(totalPages - 1));

    // Thumbnails toggle
    if (btnThumbs) {
      btnThumbs.addEventListener('click', () => {
        thumbsDrawer.classList.toggle('active');
        btnThumbs.classList.toggle('active');
      });
    }

    if (btnCloseThumbs) {
      btnCloseThumbs.addEventListener('click', () => {
        thumbsDrawer.classList.remove('active');
        if (btnThumbs) btnThumbs.classList.remove('active');
      });
    }

    // Thumbnails clicks
    if (thumbsTrack) {
      thumbsTrack.querySelectorAll('.thumb-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const page = Number(btn.getAttribute('data-page'));
          if (!isNaN(page) && pageFlip) {
            pageFlip.flip(page);
          }
        });
      });
    }

    // View mode toggle
    if (btnViewMode) {
      btnViewMode.addEventListener('click', () => {
        isSinglePageMode = !isSinglePageMode;
        initFlipbook(currentPageIndex);
      });
    }

    // Fullscreen toggle
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        pageFlip && pageFlip.flipPrev();
      } else if (e.key === 'ArrowRight') {
        pageFlip && pageFlip.flipNext();
      } else if (e.key === 'Home') {
        pageFlip && pageFlip.turnToPage(0);
      } else if (e.key === 'End') {
        pageFlip && pageFlip.turnToPage(totalPages - 1);
      } else if (e.key === 'Escape') {
        if (thumbsDrawer && thumbsDrawer.classList.contains('active')) {
          thumbsDrawer.classList.remove('active');
          if (btnThumbs) btnThumbs.classList.remove('active');
        } else if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      } else if (e.key === '+' || e.key === '=') {
        panzoom && panzoom.zoomIn({ step: 0.25 });
      } else if (e.key === '-' || e.key === '_') {
        panzoom && panzoom.zoomOut({ step: 0.25 });
      } else if (e.key === '0') {
        panzoom && panzoom.reset({ animate: true });
      }
    });
  }

  // 5. Bootstrap
  preloadImages().then(() => {
    if (preloader) {
      preloader.style.opacity = '0';
      setTimeout(() => { preloader.style.display = 'none'; }, 400);
    }
    initFlipbook(0);
    initPanzoom();
    bindEvents();
  });
})();
`;
}

/**
 * Main export function - generates and triggers download of standalone ZIP
 */
export async function exportBookAsZip(
  book: BookRecord,
  pages: PageRecord[],
  onProgress?: (percent: number, status: string) => void
): Promise<void> {
  const zip = new JSZip();

  onProgress?.(10, 'Preparando paquete de publicación autónoma...');

  // 1. Fetch vendor scripts from local /vendor/ (zero external CDN dependencies)
  let pageFlipJs: string;
  let panzoomJs: string;

  try {
    onProgress?.(20, 'Empaquetando motores StPageFlip y Panzoom...');
    pageFlipJs = await fetchVendorScript('/vendor/page-flip.browser.js');
    panzoomJs = await fetchVendorScript('/vendor/panzoom.min.js');
  } catch (err) {
    console.error('Failed fetching vendor scripts:', err);
    throw new Error('Error al cargar librerías locales para la exportación.');
  }

  // 2. Add vendor libraries
  zip.file('js/page-flip.browser.js', pageFlipJs);
  zip.file('js/panzoom.min.js', panzoomJs);

  // 3. Add generated CSS & JS
  onProgress?.(40, 'Compilando estilos y scripts autónomos...');
  zip.file('css/style.css', generateStandaloneCss(book));
  zip.file('js/reader.js', generateStandaloneJs(book, pages.length));

  // 4. Add index.html
  zip.file('index.html', generateStandaloneHtml(book, pages));

  // 5. Add manifest.json for standalone PWA capability
  const manifest = {
    name: book.title,
    short_name: book.title.substring(0, 12),
    description: book.description || book.title,
    start_url: './index.html',
    display: 'standalone',
    background_color: '#F8FAFC',
    theme_color: book.primaryColor || '#2563EB',
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // 6. Add PNG images to pages/
  onProgress?.(60, 'Empaquetando imágenes PNG...');
  const pagesFolder = zip.folder('pages')!;
  pages.forEach((page) => {
    pagesFolder.file(page.fileName, page.blob);
  });

  // 7. Generate ZIP blob
  onProgress?.(80, 'Comprimiendo archivo ZIP...');
  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      onProgress?.(80 + Math.round(metadata.percent * 0.18), `Comprimiendo: ${Math.round(metadata.percent)}%`);
    }
  );

  onProgress?.(100, '¡Exportación lista! Iniciando descarga...');

  // 8. Trigger download
  const safeTitle = (book.title || 'flipbook')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const fileName = `${safeTitle}-flipbook.zip`;

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

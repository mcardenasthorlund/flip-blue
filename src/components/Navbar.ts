import { isIOS, isStandalone, onInstallableChange, onOnlineStatusChange, promptPWAInstall } from '../pwa';
import type { AppView } from '../types';

export interface NavbarCallbacks {
  onNavigate: (view: AppView) => void;
  onNewBook: () => void;
  onSampleBook: () => void;
}

export class Navbar {
  private element: HTMLElement;
  private currentView: AppView = 'dashboard';
  private callbacks: NavbarCallbacks;
  private isOnline = true;
  private canInstall = false;

  constructor(callbacks: NavbarCallbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement('header');
    this.element.className =
      'sticky top-0 z-40 bg-white border-b border-slate-200 shrink-0';
    this.render();

    // Listen to PWA installability
    onInstallableChange((installable) => {
      this.canInstall = installable;
      this.updateInstallButton();
    });

    // Listen to online status
    onOnlineStatusChange((online) => {
      this.isOnline = online;
      this.updateStatusBadge();
    });
  }

  getElement(): HTMLElement {
    return this.element;
  }

  setView(view: AppView) {
    this.currentView = view;
    this.render();
  }

  private render() {
    this.element.innerHTML = `
      <div class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        <!-- Brand Logo & Title -->
        <div class="flex items-center gap-2 sm:gap-3 shrink-0">
          <button id="nav-brand-btn" class="flex items-center gap-2 sm:gap-3 text-left group cursor-pointer focus:outline-hidden">
            <div class="w-8 h-8 bg-[#2563EB] rounded-lg flex items-center justify-center shrink-0 shadow-sm shadow-blue-200 group-hover:bg-blue-700 transition-colors">
              <div class="w-4 h-5 border-2 border-white rounded-xs transform -skew-x-6"></div>
            </div>
            <div class="flex flex-col">
              <div class="flex items-center gap-1.5 sm:gap-2">
                <span class="text-lg sm:text-xl font-bold tracking-tight text-slate-900 group-hover:text-slate-800 transition-colors leading-tight">Flip<span class="text-[#2563EB]">Blue</span></span>
                <span class="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-[#2563EB] px-1 sm:px-1.5 py-0.5 rounded border border-blue-100/80">PWA</span>
              </div>
              <span class="text-[9px] sm:text-[10px] font-mono text-slate-400 font-medium tracking-tight">v0.2-beta</span>
            </div>
          </button>
        </div>

        <!-- Center / Breadcrumb view indicator -->
        <div class="hidden lg:flex items-center gap-2 text-xs font-semibold">
          <button id="nav-home-link" class="px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
            this.currentView === 'dashboard'
              ? 'bg-blue-50 text-[#2563EB] font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }">
            Biblioteca
          </button>
          ${
            this.currentView !== 'dashboard'
              ? `<span class="text-slate-300 font-normal">/</span>
                 <span class="px-3 py-1.5 rounded-md bg-slate-100 text-slate-800 font-bold">
                   ${this.currentView === 'editor' ? 'Editor de libro' : 'Lector interactivo'}
                 </span>`
              : ''
          }
        </div>

        <!-- Right Side Actions & PWA Controls -->
        <div class="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <!-- Offline / Synced status badge -->
          <div id="nav-online-status" class="flex items-center gap-1.5 text-xs font-medium text-slate-500 shrink-0" title="${this.isOnline ? 'Listo sin conexión' : 'Modo sin conexión'}">
            <span class="w-2 h-2 rounded-full ${this.isOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'} shrink-0"></span>
            <span class="hidden md:inline">${this.isOnline ? 'Sincronizado' : 'Sin conexión'}</span>
          </div>

          <div class="h-6 w-[1px] bg-slate-200 hidden md:block"></div>

          <!-- PWA Install Button Container -->
          <div id="nav-install-container" class="shrink-0"></div>

          <!-- Quick action buttons on Dashboard -->
          ${
            this.currentView === 'dashboard'
              ? `
            <button id="nav-sample-btn" class="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer shrink-0 whitespace-nowrap" title="Cargar libro demo con páginas de ejemplo">
              <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#2563EB] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
              <span class="hidden sm:inline">Libro demo</span>
              <span class="sm:hidden">Demo</span>
            </button>

            <button id="nav-new-btn" class="bg-[#2563EB] text-white px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200 flex items-center gap-1 sm:gap-1.5 cursor-pointer shrink-0 whitespace-nowrap" title="Crear nuevo libro">
              <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span class="hidden md:inline">Crear nuevo libro</span>
              <span class="md:hidden">Nuevo</span>
            </button>
            `
              : `
            <button id="nav-back-btn" class="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer shrink-0 whitespace-nowrap" title="Volver a la biblioteca">
              <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span class="hidden sm:inline">Volver a la biblioteca</span>
              <span class="sm:hidden">Volver</span>
            </button>
            `
          }
        </div>
      </div>
    `;

    // Bind event listeners
    this.element.querySelector('#nav-brand-btn')?.addEventListener('click', () => {
      this.callbacks.onNavigate('dashboard');
    });

    this.element.querySelector('#nav-home-link')?.addEventListener('click', () => {
      this.callbacks.onNavigate('dashboard');
    });

    this.element.querySelector('#nav-back-btn')?.addEventListener('click', () => {
      this.callbacks.onNavigate('dashboard');
    });

    this.element.querySelector('#nav-sample-btn')?.addEventListener('click', () => {
      this.callbacks.onSampleBook();
    });

    this.element.querySelector('#nav-new-btn')?.addEventListener('click', () => {
      this.callbacks.onNewBook();
    });

    this.updateInstallButton();
  }

  private updateStatusBadge() {
    const badge = this.element.querySelector<HTMLElement>('#nav-online-status');
    if (!badge) return;
    badge.className = `flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium shrink-0 ${
      this.isOnline
        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
        : 'bg-amber-50 text-amber-700 border border-amber-300'
    }`;
    badge.title = this.isOnline ? 'Listo sin conexión' : 'Modo sin conexión';
    badge.innerHTML = `
      <span class="w-2 h-2 rounded-full shrink-0 ${this.isOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}"></span>
      <span class="hidden md:inline">${this.isOnline ? 'Listo sin conexión' : 'Modo sin conexión'}</span>
    `;
  }

  private updateInstallButton() {
    const container = this.element.querySelector('#nav-install-container');
    if (!container) return;
    container.innerHTML = '';

    if (isStandalone()) {
      return;
    }

    if (this.canInstall) {
      const btn = document.createElement('button');
      btn.className =
        'flex items-center gap-1 text-xs font-semibold px-2 sm:px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors cursor-pointer shrink-0 whitespace-nowrap';
      btn.title = 'Instalar aplicación PWA';
      btn.innerHTML = `
        <svg class="w-3.5 h-3.5 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span class="hidden sm:inline">Instalar app</span>
      `;
      btn.onclick = () => {
        promptPWAInstall();
      };
      container.appendChild(btn);
    } else if (isIOS()) {
      const btn = document.createElement('button');
      btn.className =
        'flex items-center gap-1 text-xs font-medium px-2 sm:px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer shrink-0 whitespace-nowrap';
      btn.title = 'Instalar en iPhone o iPad';
      btn.innerHTML = `
        <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
          <polyline points="16 6 12 2 8 6"></polyline>
          <line x1="12" y1="2" x2="12" y2="15"></line>
        </svg>
        <span class="hidden sm:inline">Instalar en iOS</span>
      `;
      btn.onclick = () => {
        this.showIOSGuideModal();
      };
      container.appendChild(btn);
    }
  }

  private showIOSGuideModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4';
    modal.innerHTML = `
      <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
              <polyline points="16 6 12 2 8 6"></polyline>
              <line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>
          </div>
          <h3 class="text-base font-bold text-slate-900">Instalar FlipBlue en iOS</h3>
        </div>
        <ol class="mt-3 text-sm text-slate-600 space-y-2.5 list-decimal list-inside">
          <li>Toca el icono de <strong>Compartir</strong> en la barra de Safari.</li>
          <li>Desplázate hacia abajo y selecciona <strong>Añadir a pantalla de inicio</strong>.</li>
          <li>Toca <strong>Añadir</strong> en la esquina superior derecha.</li>
        </ol>
        <button id="ios-guide-close" class="mt-5 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition cursor-pointer">
          Entendido
        </button>
      </div>
    `;
    modal.querySelector('#ios-guide-close')?.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    document.body.appendChild(modal);
  }
}

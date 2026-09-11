import { Navbar } from './components/Navbar';
import { showToast } from './components/Toast';
import { showWelcomeIfNeeded } from './components/WelcomeModal';
import { getAllBooks } from './db/db';
import { initPWA, onUpdateAvailable } from './pwa';
import { seedSampleBook } from './utils/sampleBook';
import { DashboardView } from './views/DashboardView';
import { EditorView } from './views/EditorView';
import { ReaderView } from './views/ReaderView';
import type { AppView } from './types';

export class AppController {
  private container: HTMLElement;
  private currentView: AppView = 'dashboard';
  private activeBookId?: number;
  private pendingNewBookFolderId?: number | null;

  private navbar: Navbar;
  private dashboardView: DashboardView;
  private editorView: EditorView;
  private readerView: ReaderView;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.className = 'min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans';

    // 1. Initialize PWA
    initPWA();

    // 1b. Welcome tutorial for first-time users (skip via "No volver a mostrar")
    showWelcomeIfNeeded();

    // 2. Service Worker Update Notification toast
    onUpdateAvailable((reload) => {
      showToast({
        message: '¡Nueva versión de FlipBlue disponible!',
        type: 'info',
        duration: 0,
        action: {
          label: 'Actualizar',
          onClick: reload,
        },
      });
    });

    // 3. Initialize Navbar
    this.navbar = new Navbar({
      onNavigate: (view) => {
        if (view === 'dashboard') {
          this.activeBookId = undefined;
          this.setView('dashboard');
        }
      },
      onNewBook: () => {
        this.activeBookId = undefined;
        this.pendingNewBookFolderId = null;
        this.setView('editor');
      },
      onSampleBook: async () => {
        showToast({ message: 'Generando publicación demo de 6 páginas...', type: 'info' });
        try {
          await seedSampleBook();
          showToast({ message: '¡Libro demo creado con éxito!', type: 'success' });
          if (this.currentView === 'dashboard') {
            this.dashboardView.load();
          } else {
            this.setView('dashboard');
          }
        } catch (err) {
          console.error(err);
          showToast({ message: 'Error al generar el libro demo', type: 'error' });
        }
      },
      onBackup: () => {
        this.dashboardView.handleBackup();
      },
      onRestore: () => {
        this.dashboardView.triggerRestore();
      },
    });

    // 4. Initialize Views
    this.dashboardView = new DashboardView({
      onNewBook: (folderId?: number | null) => {
        this.activeBookId = undefined;
        this.pendingNewBookFolderId = folderId ?? null;
        this.setView('editor');
      },
      onEditBook: (bookId) => {
        this.activeBookId = bookId;
        this.setView('editor', bookId);
      },
      onReadBook: (bookId) => {
        this.activeBookId = bookId;
        this.setView('reader', bookId);
      },
    });

    this.editorView = new EditorView({
      onBack: () => {
        this.activeBookId = undefined;
        this.setView('dashboard');
      },
      onPreview: (bookId) => {
        this.activeBookId = bookId;
        this.setView('reader', bookId);
      },
    });

    this.readerView = new ReaderView({
      onBack: () => {
        this.setView('dashboard');
      },
      onEdit: (bookId) => {
        this.activeBookId = bookId;
        this.setView('editor', bookId);
      },
    });

    // Initial check: if first visit and DB is empty, auto-seed sample book
    getAllBooks().then(async (books) => {
      if (books.length === 0) {
        try {
          await seedSampleBook();
        } catch (e) {
          console.warn('Initial seed skipped:', e);
        }
      }
      if (this.currentView === 'dashboard') {
        this.dashboardView.load();
      }
    });

    // Initial render
    this.renderView();
  }

  public setView(view: AppView, bookId?: number) {
    this.currentView = view;
    if (bookId !== undefined) {
      this.activeBookId = bookId;
    }
    this.renderView();
  }

  private renderView() {
    this.container.innerHTML = '';
    this.navbar.setView(this.currentView);

    if (this.currentView === 'dashboard') {
      this.container.appendChild(this.navbar.getElement());
      this.container.appendChild(this.dashboardView.getElement());
      this.dashboardView.load();
    } else if (this.currentView === 'editor') {
      this.container.appendChild(this.navbar.getElement());
      this.container.appendChild(this.editorView.getElement());
      this.editorView.load(this.activeBookId, this.pendingNewBookFolderId);
    } else if (this.currentView === 'reader') {
      if (this.activeBookId) {
        this.container.appendChild(this.readerView.getElement());
        this.readerView.load(this.activeBookId);
      } else {
        this.setView('dashboard');
      }
    }
  }

  public destroy() {
    this.dashboardView.destroy();
    this.editorView.destroy();
    this.readerView.destroy();
  }
}

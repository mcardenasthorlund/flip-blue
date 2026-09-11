const STORAGE_KEY = 'flipblue-welcome-dismissed';

interface WelcomeSlide {
  icon: string;
  title: string;
  description: string;
}

const SLIDES: WelcomeSlide[] = [
  {
    icon: `<svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path><path d="M6 6h10"></path><path d="M6 10h10"></path><path d="M6 14h6"></path></svg>`,
    title: 'Bienvenido a FlipBlue',
    description:
      'Una aplicación web (PWA) que gestiona tus libros como flipbooks interactivos, totalmente sin conexión y sin servidores. Crea, edita, lee y exporta publicaciones desde tu propio dispositivo.',
  },
  {
    icon: `<svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
    title: 'Biblioteca local',
    description:
      'Todos tus libros y sus imágenes se guardan en tu navegador (IndexedDB). Funciona sin conexión: tus publicaciones persisten al recargar o cerrar la página.',
  },
  {
    icon: `<svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>`,
    title: 'Crear y editar libros',
    description:
      'Añade páginas subiendo imágenes PNG, JPG o WEBP, o importa un PDF completo. Reordena las páginas, define portada y contraportada, elige tu color de marca y el tipo de tapa.',
  },
  {
    icon: `<svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="9" height="18" rx="1.5"></rect><rect x="13" y="3" width="9" height="18" rx="1.5"></rect></svg>`,
    title: 'Lector interactivo',
    description:
      'Lee tus libros con efecto de paso de página, zoom y desplazamiento. Alterna entre una página o dos (spread), navega con el teclado y consulta las miniaturas.',
  },
  {
    icon: `<svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line><path d="M3 4h18"></path></svg>`,
    title: 'Exporta paquetes web',
    description:
      'Exporta cualquier libro como un archivo ZIP autónomo con su propio visor. Ábrelo en cualquier navegador, compártelo o súbelo a tu web sin depender de FlipBlue.',
  },
  {
    icon: `<svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    title: 'Cómo empezar',
    description:
      'Pulsa «Crear nuevo libro» para empezar desde cero, o «Libro demo» para ver un ejemplo de 6 páginas. Todo se guarda automáticamente en tu biblioteca.',
  },
];

function shouldShowWelcome(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) !== '1';
}

function persistDismissal(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch (e) {
    console.warn('No se pudo guardar la preferencia de bienvenida:', e);
  }
}

/**
 * Shows the welcome carousel the first time the app is opened, unless the
 * user has chosen "no volver a mostrar".
 */
export function showWelcomeIfNeeded(): void {
  if (!shouldShowWelcome()) return;
  showWelcome();
}

/**
 * Force-shows the welcome carousel (e.g. from the footer), regardless of the
 * stored preference.
 */
export function showWelcome(): void {
  new WelcomeModal();
}

class WelcomeModal {
  private overlay: HTMLElement;
  private currentIndex = 0;
  private dontShowAgain = false;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className =
      'fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm';
    this.render();
    document.body.appendChild(this.overlay);
  }

  private render() {
    const slide = SLIDES[this.currentIndex];
    const isLast = this.currentIndex === SLIDES.length - 1;

    this.overlay.innerHTML = `
      <div class="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden">
        <!-- Progress bar -->
        <div class="h-1.5 bg-slate-100">
          <div class="h-full bg-[#2563EB] transition-all duration-300" style="width: ${((this.currentIndex + 1) / SLIDES.length) * 100}%"></div>
        </div>

        <!-- Slide body -->
        <div class="p-8 sm:p-10 text-center">
          <div class="w-20 h-20 mx-auto rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center mb-6">
            ${slide.icon}
          </div>
          <h2 class="text-2xl font-bold text-slate-900">${slide.title}</h2>
          <p class="mt-3 text-sm leading-relaxed text-slate-500">${slide.description}</p>
        </div>

        <!-- Footer -->
        <div class="px-6 pb-6 sm:px-8 sm:pb-8">
          <div class="flex items-center justify-between gap-3">
            <button id="wm-skip-btn" class="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
              Saltar
            </button>

            <div class="flex items-center gap-1.5">
              ${SLIDES.map(
                (_, i) => `
                <button class="wm-dot w-2 h-2 rounded-full transition-all cursor-pointer ${
                  i === this.currentIndex ? 'bg-[#2563EB] w-5' : 'bg-slate-300'
                }" data-dot="${i}" aria-label="Paso ${i + 1}"></button>
              `
              ).join('')}
            </div>

            <button id="wm-next-btn" class="px-5 py-2 rounded-xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200 cursor-pointer">
              ${isLast ? 'Empezar' : 'Siguiente'}
            </button>
          </div>

          <label class="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
            <input id="wm-dont-show" type="checkbox" class="rounded text-[#2563EB] focus:ring-[#2563EB] h-4 w-4 border-slate-300" />
            No volver a mostrar
          </label>
        </div>
      </div>
    `;

    // Bind events
    this.overlay.querySelector('#wm-next-btn')?.addEventListener('click', () => {
      if (this.currentIndex === SLIDES.length - 1) {
        this.close();
      } else {
        this.currentIndex++;
        this.render();
      }
    });

    this.overlay.querySelector('#wm-skip-btn')?.addEventListener('click', () => {
      this.close();
    });

    this.overlay.querySelector('#wm-dont-show')?.addEventListener('change', (e) => {
      this.dontShowAgain = (e.target as HTMLInputElement).checked;
    });

    this.overlay.querySelectorAll<HTMLElement>('.wm-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        this.currentIndex = Number(dot.getAttribute('data-dot'));
        this.render();
      });
    });

    // Clicking the backdrop closes without persisting unless checkbox is checked
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });
  }

  private close() {
    if (this.dontShowAgain) {
      persistDismissal();
    }
    this.overlay.classList.add('opacity-0');
    this.overlay.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      if (this.overlay.parentElement) {
        this.overlay.parentElement.removeChild(this.overlay);
      }
    }, 300);
  }
}
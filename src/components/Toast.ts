export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number; // ms, 0 for sticky
  action?: {
    label: string;
    onClick: () => void;
  };
}

class ToastManager {
  private container: HTMLElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'flipblue-toast-container';
    this.container.className =
      'fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 pointer-events-none max-w-sm w-full px-4';
    document.body.appendChild(this.container);
  }

  show(options: ToastOptions): () => void {
    const { message, type = 'info', duration = 4000, action } = options;

    const toast = document.createElement('div');
    toast.className =
      'pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-lg text-sm font-medium shadow-md border transition-all duration-300 transform translate-y-2 opacity-0';

    // Minimalist color schemes
    if (type === 'success') {
      toast.className += ' bg-white border-blue-200 text-slate-800 shadow-blue-900/5';
    } else if (type === 'error') {
      toast.className += ' bg-red-50 border-red-200 text-red-900 shadow-red-900/5';
    } else if (type === 'warning') {
      toast.className += ' bg-amber-50 border-amber-200 text-amber-900 shadow-amber-900/5';
    } else {
      // Info: Crisp blue accent
      toast.className += ' bg-slate-900 border-slate-800 text-white shadow-lg';
    }

    const iconSvg = document.createElement('div');
    iconSvg.className = 'shrink-0';
    if (type === 'success') {
      iconSvg.innerHTML = `<svg class="w-4 h-4 text-[#2563EB]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`;
    } else if (type === 'error') {
      iconSvg.innerHTML = `<svg class="w-4 h-4 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    } else if (type === 'warning') {
      iconSvg.innerHTML = `<svg class="w-4 h-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    } else {
      iconSvg.innerHTML = `<svg class="w-4 h-4 text-[#2563EB]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    const content = document.createElement('div');
    content.className = 'flex-1 text-xs leading-snug';
    content.textContent = message;

    toast.appendChild(iconSvg);
    toast.appendChild(content);

    if (action) {
      const actionBtn = document.createElement('button');
      actionBtn.className =
        'px-2.5 py-1 text-xs font-semibold rounded-md bg-[#2563EB] text-white hover:bg-blue-700 shrink-0 transition-colors cursor-pointer';
      actionBtn.textContent = action.label;
      actionBtn.onclick = () => {
        action.onClick();
        removeToast();
      };
      toast.appendChild(actionBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className =
      'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer shrink-0 transition-colors';
    closeBtn.innerHTML = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.onclick = () => removeToast();
    toast.appendChild(closeBtn);

    this.container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
    });

    let timeoutId: number | null = null;
    if (duration > 0) {
      timeoutId = window.setTimeout(() => {
        removeToast();
      }, duration);
    }

    function removeToast() {
      if (timeoutId) clearTimeout(timeoutId);
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => {
        if (toast.parentElement) {
          toast.parentElement.removeChild(toast);
        }
      }, 300);
    }

    return removeToast;
  }
}

let toastInstance: ToastManager | null = null;

export function getToast(): ToastManager {
  if (!toastInstance) {
    toastInstance = new ToastManager();
  }
  return toastInstance;
}

export function showToast(options: ToastOptions): () => void {
  return getToast().show(options);
}

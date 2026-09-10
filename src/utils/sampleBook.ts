import { saveBook } from '../db/db';

/**
 * Creates a sample PNG blob using an offscreen canvas
 */
function createPageCanvasBlob(
  pageIndex: number,
  totalPages: number,
  title: string,
  content: string[],
  isHardCover: boolean = false
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1100;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }

    if (isHardCover) {
      // Hard cover styling: Deep blue #1E40AF with gradient and crisp white text
      const grad = ctx.createLinearGradient(0, 0, 800, 1100);
      grad.addColorStop(0, '#1E3A8A');
      grad.addColorStop(0.5, '#2563EB');
      grad.addColorStop(1, '#1D4ED8');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 800, 1100);

      // Book spine accent line
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(pageIndex === 1 ? 0 : 770, 0, 30, 1100);

      // Geometric cover frame
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 3;
      ctx.strokeRect(60, 60, 680, 980);

      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';

      if (pageIndex === 1) {
        // Front Cover
        ctx.font = 'bold 20px system-ui, sans-serif';
        ctx.fillStyle = '#93C5FD';
        ctx.fillText('FLIPBLUE PRESS • MONOGRAPH NO. 01', 400, 240);

        ctx.font = 'bold 48px system-ui, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('FLIPBLUE', 400, 360);
        ctx.fillText('READER & EXPORT', 400, 420);

        ctx.fillStyle = '#93C5FD';
        ctx.fillRect(320, 460, 160, 4);

        ctx.font = '500 24px system-ui, sans-serif';
        ctx.fillStyle = '#E0F2FE';
        ctx.fillText('Autonomous Flip-Page Publication', 400, 520);
        ctx.fillText('Client-Side StPageFlip & Panzoom', 400, 560);

        // Center emblem
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.strokeRect(340, 660, 120, 120);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 36px system-ui, sans-serif';
        ctx.fillText('FB', 400, 735);

        ctx.font = '16px system-ui, sans-serif';
        ctx.fillStyle = '#BFDBFE';
        ctx.fillText('HARD COVER EDITION • VOL I', 400, 940);
      } else {
        // Back Cover
        ctx.font = 'bold 28px system-ui, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('FLIPBLUE SPECIFICATION', 400, 320);

        ctx.font = '20px system-ui, sans-serif';
        ctx.fillStyle = '#DBEAFE';
        ctx.fillText('Stand-alone flipbook with 0 external dependencies.', 400, 400);
        ctx.fillText('IndexedDB persistent storage with Dexie.js.', 400, 440);
        ctx.fillText('StPageFlip vanilla physics + Panzoom zoom engine.', 400, 480);

        // Simulated Barcode
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(300, 720, 200, 80);
        ctx.fillStyle = '#0F172A';
        for (let x = 320; x < 480; x += (x % 7 === 0 ? 8 : 4)) {
          ctx.fillRect(x, 730, (x % 5 === 0 ? 3 : 2), 50);
        }
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ISBN 978-0-256-3EB00-1', 400, 794);

        ctx.font = '14px system-ui, sans-serif';
        ctx.fillStyle = '#BFDBFE';
        ctx.fillText('© FLIPBLUE • STANDALONE EXPORT READY', 400, 920);
      }
    } else {
      // Soft Inner page: Pristine white #FFFFFF with #F8FAFC paper border
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 800, 1100);

      // Subtle paper edge border
      ctx.strokeStyle = '#F1F5F9';
      ctx.lineWidth = 1;
      ctx.strokeRect(30, 30, 740, 1040);

      // Header
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillStyle = '#2563EB';
      ctx.textAlign = 'left';
      ctx.fillText('FLIPBLUE MANUAL', 60, 80);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#64748B';
      ctx.fillText(`PAGE ${pageIndex.toString().padStart(2, '0')}`, 740, 80);

      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(60, 95);
      ctx.lineTo(740, 95);
      ctx.stroke();

      // Page Title
      ctx.textAlign = 'left';
      ctx.font = 'bold 36px system-ui, sans-serif';
      ctx.fillStyle = '#0F172A';
      ctx.fillText(title, 60, 170);

      // Blue accent line under title
      ctx.fillStyle = '#2563EB';
      ctx.fillRect(60, 190, 80, 4);

      // Editorial Paragraphs
      ctx.font = '20px/1.6 system-ui, sans-serif';
      ctx.fillStyle = '#334155';
      let currentY = 240;

      content.forEach((line) => {
        if (line.startsWith('•')) {
          ctx.fillStyle = '#2563EB';
          ctx.fillText('•', 70, currentY);
          ctx.fillStyle = '#334155';
          ctx.fillText(line.substring(2), 95, currentY);
        } else if (line.startsWith('---')) {
          ctx.strokeStyle = '#E2E8F0';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(60, currentY - 10);
          ctx.lineTo(740, currentY - 10);
          ctx.stroke();
        } else {
          ctx.fillStyle = '#334155';
          ctx.fillText(line, 60, currentY);
        }
        currentY += 42;
      });

      // Illustration / graphic placeholder box
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(60, 700, 680, 240);
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.strokeRect(60, 700, 680, 240);

      // Diagram graphics
      ctx.fillStyle = '#EFF6FF';
      ctx.fillRect(80, 720, 200, 200);
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 2;
      ctx.strokeRect(80, 720, 200, 200);
      ctx.fillStyle = '#2563EB';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HARD COVER', 180, 810);
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillStyle = '#64748B';
      ctx.fillText('data-density="hard"', 180, 840);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(310, 720, 410, 200);
      ctx.strokeStyle = '#94A3B8';
      ctx.strokeRect(310, 720, 410, 200);
      ctx.fillStyle = '#0F172A';
      ctx.textAlign = 'left';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText('ADAPTIVE SPREAD ENGINE', 330, 760);
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText('• 2-page book spread on Desktop & Tablet', 330, 800);
      ctx.fillText('• 1-page responsive view on Mobile screens', 330, 835);
      ctx.fillText('• Smooth StPageFlip physics & Panzoom zoom', 330, 870);

      // Footer
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.textAlign = 'center';
      ctx.fillText(`FlipBlue Autonomous Reader • Page ${pageIndex} of ${totalPages}`, 400, 1020);
    }

    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to convert canvas to blob'));
      }
    }, 'image/png');
  });
}

/**
 * Generates and seeds a complete 6-page Sample Flipbook
 */
export async function seedSampleBook(): Promise<number> {
  const pageSpecs = [
    {
      isHardCover: true,
      title: 'Cover Front',
      content: [],
    },
    {
      isHardCover: false,
      title: '01. Minimalist Flip-Page Architecture',
      content: [
        'Welcome to FlipBlue, a dedicated offline-first PWA for managing',
        'PNG-based publications and producing self-contained flipbooks.',
        '',
        'Key Capabilities Built In:',
        '• Mass upload high-resolution PNG pages with automatic naming',
        '• Reorder spreads dynamically with smooth drag-and-drop',
        '• IndexedDB local persistence with complete blob cleanup',
        '• Instant in-app interactive reader with adaptive spread',
        '• One-click export to completely autonomous ZIP bundles',
      ],
    },
    {
      isHardCover: false,
      title: '02. Dual-Engine Reader Technology',
      content: [
        'FlipBlue combines two world-class vanilla JavaScript engines:',
        '',
        '1. StPageFlip Engine:',
        '• True 3D ray-traced page flipping with realistic shadows',
        '• Hard cover physics on the first and last sheets',
        '• Adaptive layout transitioning from dual-page to single-page',
        '',
        '2. Panzoom Engine:',
        '• Sub-pixel smooth panning across zoomed spreads',
        '• Interactive zoom slider and mouse-wheel gestures',
        '• Preserves readability on high-density diagrams and illustrations',
      ],
    },
    {
      isHardCover: false,
      title: '03. Zero-CDN Autonomous Packages',
      content: [
        'When you export from FlipBlue, the system compiles a single ZIP',
        'package containing everything needed to run anywhere:',
        '',
        'Package Contents:',
        '• index.html: Pure semantic HTML with clean floating controls',
        '• css/style.css: Minimalist Slate & Blue (#2563EB) aesthetic',
        '• js/page-flip.browser.js: Bundled minified engine (no CDN)',
        '• js/panzoom.min.js: Bundled minified engine (no CDN)',
        '• js/reader.js: Pre-loader with blue progress bar & controls',
        '• pages/001.png, 002.png...: Your exact publication pages',
      ],
    },
    {
      isHardCover: false,
      title: '04. Image Workflow & Conventions',
      content: [
        'For optimal viewing results across all devices:',
        '',
        '• Aspect Ratio: Ensure all pages share the same aspect ratio',
        '• File Naming: Automatic sequential renaming (001.png, 002.png...)',
        '• Pre-Loader: Mandatory blue progress bar ensures all images',
        '  are fully decoded and cached before the book renders',
        '• Reordering: Drag any page in the editor to re-sequence spreads',
        '• Covers: The first and last pages automatically gain hard covers',
      ],
    },
    {
      isHardCover: true,
      title: 'Cover Back',
      content: [],
    },
  ];

  const totalPages = pageSpecs.length;
  const pageItems = [];

  for (let i = 0; i < totalPages; i++) {
    const spec = pageSpecs[i];
    const blob = await createPageCanvasBlob(
      i + 1,
      totalPages,
      spec.title,
      spec.content,
      spec.isHardCover
    );
    pageItems.push({
      blob,
      width: 800,
      height: 1100,
    });
  }

  const bookId = await saveBook(
    {
      title: 'FlipBlue Architecture & Design Handbook',
      description: 'A complete showcase flipbook demonstrating adaptive 2-page spreads, hard covers, and standalone packaging.',
    },
    pageItems
  );

  return bookId;
}

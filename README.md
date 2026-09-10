<div align="center">
  <img width="96" height="96" alt="FlipBlue Logo" src="public/icon.svg" />
  <h1>FlipBlue Reader &amp; Generator</h1>
  <p><em>Flipbook interactivos offline-first con efecto página · StPageFlip + Panzoom</em></p>
</div>

FlipBlue es una **PWA offline-first** (Vite + React + TypeScript + Tailwind) que permite gestionar libros basados en imágenes PNG de forma local (IndexedDB) y exportarlos como **paquetes web autónomos** con efecto flip-page mediante StPageFlip y Panzoom, sin dependencias de CDN.

## 🌐 Deploy

La aplicación está desplegada en producción en:

**[https://appcatalogo.ideasypruebas2.es](https://appcatalogo.ideasypruebas2.es)**

## ✨ Características

- 📚 Gestión local de publicaciones (crear, editar, clonar, eliminar).
- 🖼️ Carga masiva de páginas PNG con renombrado automático secuencial (`001.png`, `002.png`…).
- 📄 Importación y renderizado de PDF a páginas PNG de alta resolución.
- 🔄 Reordenación de páginas con arrastrar y soltar (drag & drop).
- 📖 Visor interactivo con efecto flip-page, modo 1 página / spread, zoom (panzoom) y miniaturas.
- 🛍️ Exportación a un único **ZIP autónomo** (HTML/CSS/JS + imágenes, sin CDN) listo para cualquier hosting.
- 💾 Copias de seguridad y restauración completas de la biblioteca en IndexedDB.
- 📴 Funciona sin conexión (service worker / PWA).

## 🧰 Stack

- [Vite](https://vitejs.dev) + [React](https://react.dev) 19 + [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS](https://tailwindcss.com) v4
- [Dexie](https://dexie.org) (IndexedDB) para persistencia local
- [StPageFlip](https://github.com/Nodlik/StPageFlip) + [Panzoom](https://github.com/timmywil/panzoom)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app)

## 🚀 Ejecución local

**Requisitos:** Node.js

1. Instala las dependencias:
   ```bash
   npm install
   ```
2. (Opcional) Configura `GEMINI_API_KEY` en [`.env.local`](.env.example) para funciones de Gemini. El núcleo de la app funciona sin ella.
3. Inicia el servidor de desarrollo en el puerto 3000:
   ```bash
   npm run dev
   ```

### Comandos

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo (puerto 3000) |
| `npm run lint` | Typecheck (`tsc --noEmit`) |
| `npm run build` | Build de producción |
| `npm run preview` | Servir el build de producción |

## 📜 Licencia

Distribuido bajo la licencia **MIT**. Consulta el archivo [LICENSE](LICENSE).

## 👤 Autor

Proyecto creado por [Manuel Cárdenas Thorlund](https://nuevasideas.es).
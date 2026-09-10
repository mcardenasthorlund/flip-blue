import './index.css';
import { AppController } from './App';

function init() {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    rootElement.innerHTML = '';
    new AppController(rootElement);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

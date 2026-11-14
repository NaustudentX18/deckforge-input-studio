import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { BASE_CSS, LANDING_CSS, TOKENS_CSS } from './styles';

// Inject the design system before mounting so there is no unstyled flash.
const style = document.createElement('style');
style.id = 'deckforge-design-system';
style.textContent = [TOKENS_CSS, BASE_CSS, LANDING_CSS].join('\n');
document.head.appendChild(style);

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

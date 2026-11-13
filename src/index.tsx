import React from 'react';
import { definePlugin, routerHook } from '@decky/api';
import QAMPanel from './components/QAMPanel';
import FullStudio from './components/FullStudio';

// Gamepad SVG icon for Decky sidebar
const GamepadIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="currentColor"
    style={{ display: 'inline-block', verticalAlign: 'middle' }}
  >
    <path d="M17 4H7C4.24 4 2 6.24 2 9v6c0 2.76 2.24 5 5 5h10c2.76 0 5-2.24 5-5V9c0-2.76-2.24-5-5-5zm-7 8H8.5v1.5a.75.75 0 0 1-1.5 0V12H5.5a.75.75 0 0 1 0-1.5H7V9a.75.75 0 0 1 1.5 0v1.5H10a.75.75 0 0 1 0 1.5zm6.5 2.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm2-2a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-2-2a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-2 2a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
  </svg>
);

export default definePlugin(() => {
  // Register full-screen route at /deckforge
  routerHook.addRoute('/deckforge', FullStudio);

  return {
    name: 'DeckForge Input Studio',
    titleView: <div>DeckForge Input Studio</div>,
    content: <QAMPanel />,
    icon: <GamepadIcon />,
    onDismount() {
      routerHook.removeRoute('/deckforge');
    },
  };
});

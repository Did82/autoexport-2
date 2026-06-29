/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/components.css';
import 'react-day-picker/dist/style.css';

// Initialize theme before rendering
const initTheme = () => {
    const candidate = localStorage.getItem('theme');
    const stored =
        candidate === 'light' || candidate === 'dark' || candidate === 'system'
            ? candidate
            : 'system';
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    
    if (stored === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.classList.add(systemTheme);
    } else {
        root.classList.add(stored);
    }
};

initTheme();

const elem = document.getElementById('root')!;
const app = (
    <StrictMode>
        <App />
    </StrictMode>
);

if (import.meta.hot) {
    // With hot module reloading, `import.meta.hot.data` is persisted.
    const root = (import.meta.hot.data.root ??= createRoot(elem));
    root.render(app);
} else {
    // The hot module reloading API is not available in production.
    createRoot(elem).render(app);
}

import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// No StrictMode - it causes double-mount issues with Canvas lifecycle
createRoot(document.getElementById('root')).render(<App />);

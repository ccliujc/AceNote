import { createRoot } from 'react-dom/client';
import { TodayPanelApp } from './quick-input-app';
const root = document.getElementById('root');
if (!root) throw new Error('Missing today panel root');
createRoot(root).render(<TodayPanelApp />);

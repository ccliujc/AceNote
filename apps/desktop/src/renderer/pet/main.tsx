import { createRoot } from 'react-dom/client';
import { PetApp } from './pet-app';
const root = document.getElementById('root');
if (!root) throw new Error('Missing pet root');
createRoot(root).render(<PetApp />);

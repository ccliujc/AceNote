import type { AceNoteApi } from '@acenote/contracts';
import { CapturePage } from './capture-page';

declare global {
  interface Window {
    acenote: AceNoteApi;
  }
}

export function App() {
  return <CapturePage api={window.acenote} />;
}

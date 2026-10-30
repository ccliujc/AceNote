import type { EditorApi, ExperienceApi, LifecycleApi, ReminderApi } from '@acenote/contracts';
import { LifecyclePage } from './lifecycle-page';

declare global {
  interface Window {
    editor: EditorApi;
    lifecycle: LifecycleApi;
    reminder: ReminderApi;
    experience: ExperienceApi;
  }
}

export function App() {
  return <LifecyclePage api={window.lifecycle} editorApi={window.editor} reminderApi={window.reminder} experienceApi={window.experience} />;
}

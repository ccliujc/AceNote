import type { CompletionCandidate, LifecycleTask } from '@acenote/contracts';

const completionWords = /(已经)?(已完成|完成了|做完了|办好了|搞定|结束)/g;

export function normalizeTarget(value: string): string {
  return value
    .trim()
    .replace(/[\s，。！？、,.!?]/g, '')
    .replace(completionWords, '')
    .toLowerCase();
}

export function findCompletionCandidates(target: string, tasks: LifecycleTask[]): CompletionCandidate[] {
  const normalized = normalizeTarget(target);
  if (!normalized) return [];
  const open = tasks.filter((task) => task.status === 'open');
  const exact = open.filter((task) => normalizeTarget(task.title) === normalized);
  const matches = exact.length > 0
    ? exact
    : open.filter((task) => {
        const title = normalizeTarget(task.title);
        const contact = task.contact ? normalizeTarget(task.contact) : '';
        return (title.length > 0 && (normalized.includes(title) || title.includes(normalized))) || (contact.length > 0 && contact === normalized);
      });
  return matches
    .sort((a, b) => a.title.localeCompare(b.title) || a.recordDate.localeCompare(b.recordDate))
    .map(({ id, title, recordDate, contact, revision }) => ({ id, title, recordDate, contact, revision }));
}

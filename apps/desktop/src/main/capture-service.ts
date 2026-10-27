import type { ReparseMode, Task, TaskPatch } from '@acenote/contracts';
import type { TaskRepository } from './task-repository';
import type { ParseQueue } from './parse-queue';

export class CaptureService {
  constructor(private readonly repository: TaskRepository, private readonly queue: ParseQueue) {}

  async submitTask(rawText: string): Promise<Task> {
    const task = this.repository.create(rawText);
    this.queue.enqueue(task.id, task.revision);
    return task;
  }

  async listTasks(): Promise<Task[]> {
    return this.repository.list();
  }

  async updateTask(id: string, patch: TaskPatch, revision: number): Promise<Task> {
    return this.repository.update(id, patch, revision);
  }

  async retryParse(id: string): Promise<Task> {
    const task = this.repository.get(id);
    this.repository.setParseStatus(id, 'pending');
    this.queue.enqueue(id, task.revision, 'preserve');
    return { ...task, parseStatus: 'pending', parseError: null };
  }

  async reparseTask(id: string, mode: ReparseMode): Promise<Task> {
    const task = this.repository.get(id);
    this.repository.setParseStatus(id, 'pending');
    this.queue.enqueue(id, task.revision, mode);
    return { ...task, parseStatus: 'pending', parseError: null };
  }
}

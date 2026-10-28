import type { ChatMessage } from './types';

export interface OllamaConfig {
  /** Default `OLLAMA_HOST` or http://127.0.0.1:11434. */
  host: string;
  /** Default `OLLAMA_MODEL`, else the first installed of PREFERRED_MODELS. */
  model?: string;
  /** Budget for a request the player is waiting on (about 4 s). */
  liveTimeoutMs: number;
  /** Budget for background prefetches. */
  prefetchTimeoutMs: number;
}

/** Gemma 3 4B, as the build plan asks, in either of the forms Ollama installs it under. */
export const PREFERRED_MODELS = ['gemma3:4b', 'gemma3:4b-it-qat'] as const;
const TAGS_FRESH_MS = 10_000;
const TAGS_TIMEOUT_MS = 1_500;

export type Priority = 'live' | 'prefetch';

interface Job {
  priority: Priority;
  messages: ChatMessage[];
  format: unknown;
  deadline: number;
  resolve(value: unknown): void;
  reject(reason: Error): void;
  controller?: AbortController;
  preempted?: boolean;
}

/**
 * A plain-fetch Ollama client. It sends one request at a time (the model shares the GPU with the
 * game), puts live requests ahead of prefetches and interrupts a running prefetch for one, and
 * aborts anything that runs past its deadline.
 */
export class OllamaClient {
  private queue: Job[] = [];
  private running: Job | undefined;
  private tags: { at: number; model: string | undefined } | undefined;
  private waiters: (() => void)[] = [];

  constructor(private readonly config: OllamaConfig) {}

  /** The model to use, or undefined when Ollama is down or doesn't have it. */
  async model(): Promise<string | undefined> {
    if (this.tags && Date.now() - this.tags.at < TAGS_FRESH_MS) return this.tags.model;
    let model: string | undefined;
    try {
      const response = await fetch(`${this.config.host}/api/tags`, { signal: AbortSignal.timeout(TAGS_TIMEOUT_MS) });
      const { models } = (await response.json()) as { models?: { name: string }[] };
      const installed = new Set((models ?? []).map((m) => m.name));
      model = this.config.model ? (installed.has(this.config.model) ? this.config.model : undefined) : PREFERRED_MODELS.find((m) => installed.has(m));
    } catch {
      model = undefined;
    }
    this.tags = { at: Date.now(), model };
    return model;
  }

  /** Asks the model for JSON matching `format` by `deadline` (ms since epoch). Rejects on any failure. */
  chat(messages: ChatMessage[], format: unknown, priority: Priority, deadline: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const job: Job = { priority, messages, format, deadline, resolve, reject };
      if (priority === 'live') {
        const firstPrefetch = this.queue.findIndex((j) => j.priority === 'prefetch');
        this.queue.splice(firstPrefetch === -1 ? this.queue.length : firstPrefetch, 0, job);
        // A prefetch already running gives way; it goes back to the front of the prefetches.
        if (this.running?.priority === 'prefetch') {
          this.running.preempted = true;
          this.running.controller?.abort();
        }
      } else {
        this.queue.push(job);
      }
      void this.pump();
    });
  }

  /** Resolves when nothing is queued or running (tests, and the dev console). */
  idle(): Promise<void> {
    if (!this.running && this.queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    const job = this.queue.shift();
    if (!job) {
      for (const resolve of this.waiters.splice(0)) resolve();
      return;
    }
    this.running = job;
    try {
      job.resolve(await this.send(job));
    } catch (error) {
      if (job.preempted && Date.now() < job.deadline) {
        job.preempted = false;
        const firstPrefetch = this.queue.findIndex((j) => j.priority === 'prefetch');
        this.queue.splice(firstPrefetch === -1 ? this.queue.length : firstPrefetch, 0, job);
      } else {
        job.reject(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      this.running = undefined;
      void this.pump();
    }
  }

  private async send(job: Job): Promise<unknown> {
    const remaining = job.deadline - Date.now();
    if (remaining <= 0) throw new Error('timed out in the queue');
    const model = await this.model();
    if (!model) throw new Error('Ollama or the model is not available');
    job.controller = new AbortController();
    const timer = setTimeout(() => job.controller?.abort(), Math.max(0, job.deadline - Date.now()));
    try {
      const response = await fetch(`${this.config.host}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: job.controller.signal,
        body: JSON.stringify({
          model,
          messages: job.messages,
          format: job.format,
          stream: false,
          options: { temperature: 0.8, num_predict: 200 },
        }),
      });
      if (!response.ok) throw new Error(`Ollama answered ${response.status}`);
      const body = (await response.json()) as { message?: { content?: string } };
      return JSON.parse(body.message?.content ?? '');
    } finally {
      clearTimeout(timer);
    }
  }
}

export function configFromEnv(overrides: Partial<OllamaConfig> = {}): OllamaConfig {
  return {
    host: overrides.host ?? process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
    model: overrides.model ?? process.env.OLLAMA_MODEL,
    liveTimeoutMs: overrides.liveTimeoutMs ?? 4_000,
    prefetchTimeoutMs: overrides.prefetchTimeoutMs ?? 20_000,
  };
}

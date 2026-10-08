declare module '@nestjs/bullmq' {
  export function InjectQueue(name?: string): ParameterDecorator;
  export function Processor(
    name?: string,
    options?: Record<string, unknown>,
  ): ClassDecorator;
  export abstract class WorkerHost {
    abstract process(job: any): Promise<any>;
  }
  export class BullModule {
    static registerQueue(options: Record<string, unknown>): any;
    static forRoot(options: Record<string, unknown>): any;
    static forRootAsync(options: Record<string, unknown>): any;
  }
}

declare module 'bullmq' {
  export interface JobsOptions {
    jobId?: string;
    delay?: number;
    removeOnComplete?: boolean | number | { count?: number; age?: number };
    removeOnFail?: boolean | number | { count?: number; age?: number };
    attempts?: number;
  }
  export class Job<T = any> {
    id?: string;
    name: string;
    data: T;
    remove(): Promise<void>;
  }
  export class Queue<T = any> {
    add(name: string, data: T, opts?: JobsOptions): Promise<Job<T>>;
    getJob(jobId: string): Promise<Job<T> | null>;
  }
}

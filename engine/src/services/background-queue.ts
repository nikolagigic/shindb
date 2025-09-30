type Job = () => Promise<void>;

class BackgroundQueue {
  private queue: Job[] = [];
  private running = 0;

  constructor(private maxConcurrent = 5) {}

  add(job: Job) {
    this.queue.push(job);
    this.schedule();
  }

  private schedule() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.running++;

      job()
        .catch((err) => console.error("Background job failed:", err))
        .finally(() => {
          this.running--;
          this.schedule();
        });
    }
  }
}

export const backgroundQueue = new BackgroundQueue(5);

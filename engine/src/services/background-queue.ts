type Job = () => Promise<void>;

class BackgroundQueue {
  private queue: Job[] = [];
  private running = false;

  add(job: Job) {
    this.queue.push(job);
    this.schedule();
  }

  private async schedule() {
    if (this.running) return;
    const job = this.queue.shift();
    if (!job) return;

    this.running = true;
    try {
      await job();
    } catch (err) {
      console.error("Background job failed:", err);
    } finally {
      this.running = false;
      this.schedule();
    }
  }
}

export const backgroundQueue = new BackgroundQueue();

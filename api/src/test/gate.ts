/**
 * Holds an async step open until the test releases it, so a test can act while a turn is in
 * progress (TASK-004 AC-1). `entered` resolves when the held step starts waiting.
 */
export class Gate {
  readonly entered: Promise<void>;
  private markEntered!: () => void;
  private release!: () => void;
  private readonly released: Promise<void>;

  constructor() {
    this.entered = new Promise((resolve) => (this.markEntered = resolve));
    this.released = new Promise((resolve) => (this.release = resolve));
  }

  /** Called by the held step: signals entry, then waits for `open()`. */
  async wait(): Promise<void> {
    this.markEntered();
    await this.released;
  }

  open(): void {
    this.release();
  }
}

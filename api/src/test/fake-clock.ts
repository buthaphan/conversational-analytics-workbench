import { Clock } from "../time/clock";

/** A clock tests can move forward by hand, so no test waits on real time. */
export class FakeClock extends Clock {
  private current: Date;

  constructor(start = new Date("2026-11-08T09:00:00.000Z")) {
    super();
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

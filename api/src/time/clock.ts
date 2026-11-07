import { Injectable } from "@nestjs/common";

/** Source of the current time. Injected so tests can control session timing. */
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

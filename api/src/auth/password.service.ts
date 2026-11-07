import { Injectable } from "@nestjs/common";
import { hashPassword, verifyPassword } from "./password";

/** Password checks for sign-in. Wraps the scrypt helpers so tests can observe calls. */
@Injectable()
export class PasswordService {
  // A hash of a random value, checked for unknown emails so they take as long as wrong passwords.
  private dummyHash?: Promise<string>;

  verify(password: string, hash: string): Promise<boolean> {
    return verifyPassword(password, hash);
  }

  /** Runs a full password check that always fails, to equalize timing for unknown emails. */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= hashPassword(crypto.randomUUID());
    await this.verify(password, await this.dummyHash);
    return false;
  }
}

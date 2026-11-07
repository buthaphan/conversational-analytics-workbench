import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { SignInDto } from "./sign-in.dto";

/** A syntactically valid email of exactly `length` characters (64-character local part, long domain). */
function emailOfLength(length: number): string {
  // "<64 chars>@<label>.<label>.<label>.test": the three labels share what is left (each under 63).
  const labelChars = length - 64 - 1 - ".test".length - 2;
  const sizes = [0, 1, 2].map((i) => Math.floor(labelChars / 3) + (i < labelChars % 3 ? 1 : 0));
  const domain = [...sizes.map((size, i) => "bcd"[i]!.repeat(size)), "test"].join(".");
  const email = `${"a".repeat(64)}@${domain}`;
  if (email.length !== length) throw new Error(`could not build an email of length ${length}`);
  return email;
}

async function emailConstraints(email: string): Promise<string[]> {
  const errors = await validate(plainToInstance(SignInDto, { email, password: "x" }));
  return Object.keys(errors.find((e) => e.property === "email")?.constraints ?? {});
}

describe("SignInDto email length (AC-4, review R2c)", () => {
  it("accepts a valid email of exactly 254 characters", async () => {
    expect(await emailConstraints(emailOfLength(254))).toEqual([]);
  });

  it("rejects an otherwise well-formed email of 255 characters, with the explicit length rule", async () => {
    // The email validator also caps addresses at 254 characters; @MaxLength(254) states the limit
    // explicitly, so both reasons appear.
    const constraints = await emailConstraints(emailOfLength(255));
    expect(constraints).toContain("maxLength");
    expect(constraints.length).toBeGreaterThan(0);
  });
});

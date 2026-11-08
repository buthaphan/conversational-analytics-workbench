import { Transform } from "class-transformer";
import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

/** A chat message (TASK-003 AC-12): 1–500 characters after trimming. */
export class MessageDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text!: string;
}

/** The Switch / Keep current buttons (AC-7). */
export class SwitchDto {
  @IsIn(["switch", "keep"])
  choice!: "switch" | "keep";
}

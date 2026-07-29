import { describe, expect, test } from "bun:test";
import { InputRateLimiter } from "../src/input-rate-limiter";

describe("InputRateLimiter", () => {
  test("allows its burst then refills at the configured rate", () => {
    const limiter = new InputRateLimiter(2, 3);

    expect(limiter.tryTake(1_000)).toBe(true);
    expect(limiter.tryTake(1_000)).toBe(true);
    expect(limiter.tryTake(1_000)).toBe(true);
    expect(limiter.tryTake(1_000)).toBe(false);
    expect(limiter.tryTake(1_499)).toBe(false);
    expect(limiter.tryTake(1_500)).toBe(true);
  });

  test("does not refill from a clock moving backwards", () => {
    const limiter = new InputRateLimiter(1, 1);
    expect(limiter.tryTake(1_000)).toBe(true);
    expect(limiter.tryTake(900)).toBe(false);
  });
});

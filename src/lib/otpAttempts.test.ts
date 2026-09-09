import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OTP_EXHAUSTED_CODE,
  applyOtpBoxInput,
  formatOtpAttemptsLeft,
  otpVerifyFailureFromPayload,
} from "./otpAttempts.ts";

test("formats remaining attempts with correct plural", () => {
  assert.equal(formatOtpAttemptsLeft(2), "Wrong code. 2 attempts left.");
  assert.equal(formatOtpAttemptsLeft(1), "Wrong code. 1 attempt left.");
});

test("uses remaining from verify-otp payload", () => {
  const first = otpVerifyFailureFromPayload({
    error: "Wrong code. 2 attempts left.",
    remaining: 2,
  });
  assert.equal(first.expired, false);
  assert.equal(first.remaining, 2);
  assert.equal(first.message, "Wrong code. 2 attempts left.");

  const second = otpVerifyFailureFromPayload({ remaining: 1 });
  assert.equal(second.message, "Wrong code. 1 attempt left.");
});

test("third failed attempt is treated as expired", () => {
  const fromCode = otpVerifyFailureFromPayload({
    error: "Verification code expired",
    code: OTP_EXHAUSTED_CODE,
    remaining: 0,
  });
  assert.equal(fromCode.expired, true);
  assert.equal(fromCode.remaining, 0);
  assert.equal(fromCode.message, "");

  const fromRemaining = otpVerifyFailureFromPayload({ remaining: 0 });
  assert.equal(fromRemaining.expired, true);
});

test("typing into a later empty box starts the next try at box 1", () => {
  const empty = ["", "", "", "", "", ""];
  const result = applyOtpBoxInput({ index: 5, value: "1", digits: empty });
  assert.deepEqual(result.digits, ["1", "", "", "", "", ""]);
  assert.equal(result.focusIndex, 1);
  assert.equal(result.complete, false);
});

test("extra digit after last box is filled starts a new try", () => {
  const filled = ["1", "2", "3", "4", "5", "6"];
  const result = applyOtpBoxInput({ index: 5, value: "67", digits: filled });
  assert.deepEqual(result.digits, ["7", "", "", "", "", ""]);
  assert.equal(result.focusIndex, 1);
  assert.equal(result.complete, false);
});

test("paste fills from the first box", () => {
  const result = applyOtpBoxInput({
    index: 0,
    value: "123456",
    digits: ["", "", "", "", "", ""],
  });
  assert.deepEqual(result.digits, ["1", "2", "3", "4", "5", "6"]);
  assert.equal(result.complete, true);
  assert.equal(result.focusIndex, 5);
});

test("single digit advances to the next box", () => {
  const result = applyOtpBoxInput({
    index: 0,
    value: "4",
    digits: ["", "", "", "", "", ""],
  });
  assert.deepEqual(result.digits, ["4", "", "", "", "", ""]);
  assert.equal(result.focusIndex, 1);
});

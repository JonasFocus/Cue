import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidEmail,
  maskEmail,
  nameFromEmail,
  normaliseEmail,
} from "./waitlist.ts";

test("accepts ordinary addresses", () => {
  for (const email of [
    "jonas@krevo.io",
    "amelia.harper@harperstudio.co",
    "a+tag@sub.domain.com",
    "n.okafor@okafor-visuals.com",
  ]) {
    assert.equal(isValidEmail(email), true, email);
  }
});

test("rejects junk", () => {
  for (const email of [
    "",
    "jonas",
    "jonas@",
    "@krevo.io",
    "jonas@krevo",
    "jonas @krevo.io",
    "jonas@krevo.io, other@x.com", // comma-separated list, not one address
    `${"a".repeat(250)}@krevo.io`, // over the 254 cap
  ]) {
    assert.equal(isValidEmail(email), false, JSON.stringify(email));
  }
});

test("normalises case and surrounding whitespace", () => {
  assert.equal(normaliseEmail("  Jonas@Krevo.IO \n"), "jonas@krevo.io");
  assert.equal(normaliseEmail(undefined), "");
  assert.equal(normaliseEmail(null), "");
});

test("derives a readable name from an address", () => {
  assert.equal(nameFromEmail("jonas.bubela@krevo.io"), "Jonas Bubela");
  assert.equal(nameFromEmail("n_okafor@x.com"), "N Okafor");
  assert.equal(nameFromEmail("tom-brandt@x.com"), "Tom Brandt");
  assert.equal(nameFromEmail("km@marshportraits.com"), "Km");
  // Digits are dropped; an address that is only digits leaves nothing behind.
  assert.equal(nameFromEmail("12345@x.com"), "—");
});

test("masks the local part but keeps the domain", () => {
  assert.equal(maskEmail("jonas@krevo.io"), "jo•••@krevo.io");
  // Never leaks length-1 local parts as bare plaintext.
  assert.equal(maskEmail("a@x.com"), "a•@x.com");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIpFrom, userAgentFrom } from "./client-ip.ts";

/* The value this derives is salted and stored on cue_party.ip_hash as evidence
   attached to a signature, and it keys the rate limiter on the only
   unauthenticated write in the product. It had no test at all while it was four
   copies of the same five lines, which is most of why it is one module now. */

test("the left-most forwarded entry is the client", () => {
  const h = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
  assert.equal(clientIpFrom(h), "203.0.113.7");
});

test("a single address needs no splitting", () => {
  assert.equal(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.7" })), "203.0.113.7");
});

test("surrounding whitespace is not part of the address", () => {
  // A hash of " 203.0.113.7" and a hash of "203.0.113.7" are different values,
  // so a stray space would silently split one client into two audit identities.
  assert.equal(clientIpFrom(new Headers({ "x-forwarded-for": "  203.0.113.7  " })), "203.0.113.7");
  assert.equal(
    clientIpFrom(new Headers({ "x-forwarded-for": " 203.0.113.7 , 70.41.3.18 " })),
    "203.0.113.7",
  );
});

test("IPv6 is returned intact", () => {
  const h = new Headers({ "x-forwarded-for": "2600:3c06::2000:a6ff:fe3f:9057" });
  assert.equal(clientIpFrom(h), "2600:3c06::2000:a6ff:fe3f:9057");
});

test("an absent or empty header is 'unknown', never an empty string", () => {
  // "unknown" still hashes to something stable, so the limiter keeps working and
  // the audit row records that the address was not determinable — rather than a
  // hash of "" that reads like a real value.
  assert.equal(clientIpFrom(new Headers()), "unknown");
  assert.equal(clientIpFrom(new Headers({ "x-forwarded-for": "" })), "unknown");
  assert.equal(clientIpFrom(new Headers({ "x-forwarded-for": "   " })), "unknown");
  assert.equal(clientIpFrom(new Headers({ "x-forwarded-for": ", 70.41.3.18" })), "unknown");
});

test("x-real-ip is never consulted, even when it is the only header present", () => {
  /* The security property of the whole module. Vercel documents overwriting
     x-forwarded-for to stop spoofing; nothing documents that an inbound
     x-real-ip is stripped. If this ever returns 198.51.100.9 then a client can
     choose the value stored on a signature and can rotate it to bypass the
     signing rate limit. */
  assert.equal(clientIpFrom(new Headers({ "x-real-ip": "198.51.100.9" })), "unknown");
  assert.equal(
    clientIpFrom(new Headers({ "x-real-ip": "198.51.100.9", "x-forwarded-for": "203.0.113.7" })),
    "203.0.113.7",
    "a forged x-real-ip must not win over the header Vercel controls",
  );
});

test("the user agent is captured and capped at the column width", () => {
  assert.equal(userAgentFrom(new Headers({ "user-agent": "Mozilla/5.0" })), "Mozilla/5.0");
  assert.equal(userAgentFrom(new Headers()), null);
  assert.equal(userAgentFrom(new Headers({ "user-agent": "x".repeat(400) }))?.length, 255);
});

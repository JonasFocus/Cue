import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLANK,
  buildContext,
  canonicalise,
  defaultVars,
  fillTokens,
  formatDate,
  formatStamp,
  formatMoney,
  hasBlanks,
  matches,
  renderAgreement,
  shiftDate,
  visibleQuestions,
  type Question,
  type Template,
} from "./agreement.ts";
import { TEMPLATES, templateBySlug } from "./templates.ts";

const STUDIO = { name: "Harper Studio", legalName: "Harper Studio LLC", email: "a@b.co" };
const CUE = {
  title: "Harper & Wells",
  clientName: "Ava Harper",
  clientEmail: "ava@example.com",
  shootDate: "2026-06-14",
  location: "The Old Mill",
};


/** Renders a template with its defaults, overridden, as one searchable string. */
function render(slug: string, overrides: Record<string, string | number | boolean> = {}): string {
  const template = templateBySlug(slug)!;
  return JSON.stringify(
    renderAgreement(template, STUDIO, CUE, { ...defaultVars(template), ...overrides }),
  );
}

test("matches: bare key is truthiness", () => {
  assert.equal(matches("deposit", { deposit: true }), true);
  assert.equal(matches("deposit", { deposit: false }), false);
  assert.equal(matches("deposit", {}), false);
  assert.equal(matches(undefined, {}), true);
});

test("matches: a numeric zero means 'none', so its clause is dropped", () => {
  // Clause gating, not answeredness. 0 revisions must reach the "no revisions"
  // clause, not render "0 rounds of revisions are included". The builder's own
  // `isAnswered` still treats a deliberate 0 as answered — different question.
  assert.equal(matches("revisions", { revisions: 0 }), false);
  assert.equal(matches("!revisions", { revisions: 0 }), true);
  assert.equal(matches("revisions", { revisions: 2 }), true);
  assert.equal(matches("extra_terms", { extra_terms: "" }), false);
  assert.equal(matches("extra_terms", { extra_terms: "  " }), false);
  assert.equal(matches("extra_terms", { extra_terms: "No parking." }), true);
});

test("matches: `&` is AND, and every atom must pass", () => {
  const on = { deposit: true, deposit_type: "percent" };
  assert.equal(matches("deposit & deposit_type=percent", on), true);
  assert.equal(matches("deposit & deposit_type=amount", on), false);
  // The exact bug this exists for: the parent toggle off, the sub-answer stale.
  assert.equal(matches("deposit & deposit_type=percent", { ...on, deposit: false }), false);
  assert.equal(matches("deposit & !deposit_refundable", on), true);
  assert.equal(matches("deposit & !deposit_refundable", { ...on, deposit_refundable: true }), false);
  // Whitespace around atoms is insignificant.
  assert.equal(matches("deposit&deposit_type=percent", on), true);
});

/* Five wrong contracts, caught by rendering rather than by reading. Answers to
   hidden questions are deliberately retained, so a clause gated on a
   sub-question stayed true after its parent toggle was switched off. */
test("switching a money term off removes its clause from the contract", () => {
  const wedding = templateBySlug("wedding")!;
  const base = defaultVars(wedding);
  const ids = (vars: typeof base) =>
    renderAgreement(wedding, STUDIO, CUE, vars).clauses.map((c) => c.id);

  // Deposit off must not leave a document demanding 30% up front.
  const noDeposit = ids({ ...base, deposit: false });
  for (const id of ["deposit_percent", "deposit_amount", "deposit_nonrefundable"]) {
    assert.ok(!noDeposit.includes(id), `${id} survived deposit being switched off`);
  }

  // A refundable deposit must not also carry "non-refundable once paid".
  const refundable = ids({ ...base, deposit_refundable: true });
  assert.ok(refundable.includes("deposit_refundable"));
  assert.ok(
    !refundable.includes("deposit_nonrefundable"),
    "the contract said both refundable and non-refundable",
  );

  const noLate = ids({ ...base, late_fee: false });
  assert.ok(!noLate.some((id) => id.startsWith("late_")), "late fee clause survived");

  const noCancel = ids({ ...base, cancellation_fee: false });
  assert.ok(!noCancel.includes("cancel_percent") && !noCancel.includes("cancel_amount"));
  // …and the plain cancellation clause takes over rather than leaving a gap.
  assert.ok(noCancel.includes("cancel_plain"));
});

test("matches: equality and negation", () => {
  assert.equal(matches("deposit_type=percent", { deposit_type: "percent" }), true);
  assert.equal(matches("deposit_type=percent", { deposit_type: "amount" }), false);
  assert.equal(matches("!portfolio_use", { portfolio_use: false }), true);
  assert.equal(matches("!portfolio_use", { portfolio_use: true }), false);
  assert.equal(matches("!retouching=none", { retouching: "standard" }), true);
  assert.equal(matches("!retouching=none", { retouching: "none" }), false);
});

test("formatMoney: cents in, no float drift, whole dollars stay whole", () => {
  assert.equal(formatMoney(0), "$0");
  assert.equal(formatMoney(250000), "$2,500");
  assert.equal(formatMoney(123450), "$1,234.50");
  assert.equal(formatMoney(1), "$0.01");
});

test("formatDate does not shift the day across timezones", () => {
  // new Date("2026-06-14") is UTC midnight and prints as June 13 anywhere west
  // of Greenwich. This must name June 14 regardless of where the process runs.
  assert.equal(formatDate("2026-06-14"), "June 14, 2026");
  assert.equal(formatDate("2026-01-01"), "January 1, 2026");
  assert.equal(formatDate("2026-12-31"), "December 31, 2026");
});

/* Regression: the obvious `{ dateStyle, timeStyle, timeZoneName }` is a runtime
   TypeError ("Invalid option : option") — ECMA-402 forbids mixing the style
   shorthands with individual components. It type-checks fine and is only
   reached once a signature exists to stamp, so it shipped to a sealed record
   and crashed the page. Constructing the formatter is the whole test. */
test("formatStamp builds a legal Intl formatter and names its zone", () => {
  const out = formatStamp("2026-06-14T21:12:00.000Z");
  assert.match(out, /Jun 14, 2026/);
  // 21:12 UTC is 16:12 US Central.
  assert.match(out, /4:12/);
  assert.match(out, /C[DS]T/, "the timezone must be named, not implied");
  assert.equal(formatStamp(new Date("2026-06-14T21:12:00.000Z")), out);
});

test("shiftDate crosses month and year boundaries", () => {
  assert.equal(shiftDate("2026-06-14", -30), "2026-05-15");
  assert.equal(shiftDate("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDate("2026-02-28", 1), "2026-03-01");
});

test("buildContext renders choices by label and money by format", () => {
  const questions: Question[] = [
    {
      key: "deposit_due",
      type: "choice",
      label: "Due",
      group: "Money",
      options: [{ value: "day_of", label: "on the day of the shoot" }],
    },
    { key: "total_fee", type: "money", label: "Fee", group: "Money" },
    { key: "photo_count", type: "slider", label: "Images", group: "Deliver" },
    { key: "deposit_percent", type: "percent", label: "Deposit", group: "Money" },
  ];
  const ctx = buildContext(
    STUDIO,
    CUE,
    { deposit_due: "day_of", total_fee: 250000, photo_count: 1200, deposit_percent: 30 },
    questions,
  );

  // A choice must never reach the document as its storage value.
  assert.equal(ctx.deposit_due, "on the day of the shoot");
  assert.equal(ctx.total_fee, "$2,500");
  assert.equal(ctx.photo_count, "1,200");
  assert.equal(ctx.deposit_percent, "30%");
  assert.equal(ctx["shoot.date"], "June 14, 2026");
  assert.equal(ctx["studio.legal_name"], "Harper Studio LLC");
});

test("an unfilled token becomes a visible blank, never raw machinery", () => {
  const out = fillTokens("Signed by {{client.name}} of {{nope}}.", { "client.name": "Ava" });
  assert.equal(out, `Signed by Ava of ${BLANK}.`);
  assert.ok(!out.includes("{{"));
});

test("renderAgreement drops clauses whose condition fails", () => {
  const template: Pick<Template, "clauses" | "questions"> = {
    questions: [],
    clauses: [
      { id: "always", heading: "A", body: "Always." },
      { id: "gated", heading: "B", body: "Only with a deposit.", showIf: "deposit" },
    ],
  };

  const withDeposit = renderAgreement(template, STUDIO, CUE, { deposit: true });
  const without = renderAgreement(template, STUDIO, CUE, { deposit: false });

  assert.deepEqual(withDeposit.clauses.map((c) => c.id), ["always", "gated"]);
  assert.deepEqual(without.clauses.map((c) => c.id), ["always"]);
});

test("a locked clause survives being omitted", () => {
  const template: Pick<Template, "clauses" | "questions"> = {
    questions: [],
    clauses: [
      { id: "removable", heading: "A", body: "x" },
      { id: "disclaimer", heading: "B", body: "y", locked: true },
    ],
  };
  const doc = renderAgreement(template, STUDIO, CUE, {}, ["removable", "disclaimer"]);
  assert.deepEqual(doc.clauses.map((c) => c.id), ["disclaimer"]);
});

test("paragraphs split on blank lines and collapse internal whitespace", () => {
  const template: Pick<Template, "clauses" | "questions"> = {
    questions: [],
    clauses: [{ id: "c", heading: "H", body: "One   line.\n\n\nTwo\nline." }],
  };
  const doc = renderAgreement(template, STUDIO, CUE, {});
  assert.deepEqual(doc.clauses[0]!.paragraphs, ["One line.", "Two line."]);
});

test("hasBlanks catches a document that is not ready to send", () => {
  const template: Pick<Template, "clauses" | "questions"> = {
    questions: [],
    clauses: [{ id: "c", heading: "H", body: "At {{shoot.location}}." }],
  };
  assert.equal(hasBlanks(renderAgreement(template, STUDIO, CUE, {})), false);
  assert.equal(
    hasBlanks(renderAgreement(template, STUDIO, { ...CUE, location: null }, {})),
    true,
  );
});

test("canonicalise is stable under key order, so the hash is too", () => {
  assert.equal(
    canonicalise({ b: 1, a: [{ z: 1, y: 2 }] }),
    canonicalise({ a: [{ y: 2, z: 1 }], b: 1 }),
  );
  // Different content must not collide.
  assert.notEqual(canonicalise({ a: 1 }), canonicalise({ a: 2 }));
});

test("visibleQuestions follows the answers", () => {
  const wedding = templateBySlug("wedding")!;
  const vars = defaultVars(wedding);

  const keys = (v: typeof vars) => visibleQuestions(wedding, v).map((q) => q.key);
  assert.ok(keys(vars).includes("deposit_percent"));
  assert.ok(!keys(vars).includes("deposit_amount"));

  const fixed = { ...vars, deposit_type: "amount" };
  assert.ok(keys(fixed).includes("deposit_amount"));
  assert.ok(!keys(fixed).includes("deposit_percent"));

  const none = { ...vars, deposit: false };
  assert.ok(!keys(none).includes("deposit_due"));
  // Sub-answers are kept in vars when the parent toggle is off — the same trap
  // that produced wrong *clauses* before `&`. The amount/percent questions must
  // gate on the parent too, or they stay on screen demanding a deposit the
  // creator just switched off.
  assert.ok(!keys(none).includes("deposit_percent"));
  assert.ok(!keys(none).includes("deposit_amount"));
});

/* ── Template integrity ──
   These guard the data, not the engine. A template with a typo'd showIf key
   silently drops a clause from a real contract, which is the worst possible
   failure mode for this product and the cheapest one to test for. */

test("defaults alone leave a blank, so hasBlanks blocks a premature send", () => {
  // Free-text answers (start_time) have no sensible default, so a freshly
  // created Cue is deliberately incomplete. That is the signal the builder
  // uses to keep the Send button off.
  const wedding = templateBySlug("wedding")!;
  assert.equal(hasBlanks(renderAgreement(wedding, STUDIO, CUE, defaultVars(wedding))), true);
});

test("every template renders complete once its questions are answered", () => {
  for (const template of TEMPLATES) {
    const vars = { ...defaultVars(template) };
    // Stand in for the creator filling the form: anything with no default gets
    // an answer of the right shape.
    for (const q of template.questions) {
      if (vars[q.key] !== undefined && vars[q.key] !== "") continue;
      vars[q.key] =
        q.type === "text" || q.type === "textarea"
          ? "answered"
          : q.type === "choice"
            ? (q.options?.[0]?.value ?? "")
            : q.type === "toggle"
              ? true
              : 1;
    }

    const doc = renderAgreement(template, STUDIO, CUE, vars);
    assert.ok(doc.clauses.length > 0, `${template.slug} rendered nothing`);
    assert.equal(hasBlanks(doc), false, `${template.slug} has an unfilled token`);
  }
});

test("every showIf references a key some question can actually set", () => {
  const CUE_KEYS = new Set(["outdoor"]); // set by a spliced question, checked below
  for (const template of TEMPLATES) {
    const known = new Set(template.questions.map((q) => q.key));
    const referenced = [
      ...template.questions.map((q) => q.showIf),
      ...template.clauses.map((c) => c.showIf),
    ].filter((s): s is string => Boolean(s));

    // A condition may be several atoms joined by `&`; every one must resolve.
    for (const expr of referenced) {
      for (const atom of expr.split("&")) {
        const key = atom.trim().replace(/^!/, "").split("=")[0]!;
        assert.ok(
          known.has(key) || CUE_KEYS.has(key),
          `${template.slug}: showIf "${expr}" references unknown key "${key}"`,
        );
      }
    }
  }
});

test("every template carries the locked disclaimer and cannot lose it", () => {
  for (const template of TEMPLATES) {
    const disclaimer = template.clauses.find((c) => c.id === "disclaimer");
    assert.ok(disclaimer, `${template.slug} has no disclaimer clause`);
    assert.equal(disclaimer.locked, true, `${template.slug} disclaimer is removable`);

    const doc = renderAgreement(template, STUDIO, CUE, defaultVars(template), ["disclaimer"]);
    assert.ok(
      doc.clauses.some((c) => c.id === "disclaimer"),
      `${template.slug} dropped the disclaimer when omitted`,
    );
  }
});

/* A slider's `unit` is written for its form control ("Delivered within [30]
   days of the shoot"), so it cannot be appended to the token in prose — that
   would render "within 30 days of the shoot of the shoot date". The noun has to
   be in the clause text, and forgetting it produced real contract copy reading
   "for 8 of coverage". No token is missing and nothing is blank, so hasBlanks
   cannot see it; this can. */
test("a number in the prose is never left without its noun", () => {
  /* The lookbehind skips numbers whose unit is a *prefix* rather than a suffix:
     "$0 per hour" and "$4,500 of the fee" are correct prose, and the digits
     inside "4,500" must not be treated as fresh numbers either. */
  const FUNCTION_WORD = /(?<![$\d.,])\b\d[\d,]*\s+(of|are|is|from|to|per|and|or|the)\b/;

  for (const template of TEMPLATES) {
    const vars = { ...defaultVars(template) };
    for (const q of template.questions) {
      if (vars[q.key] !== undefined && vars[q.key] !== "") continue;
      vars[q.key] =
        q.type === "text" || q.type === "textarea"
          ? "answered"
          : q.type === "choice"
            ? (q.options?.[0]?.value ?? "")
            : q.type === "toggle"
              ? true
              : 3;
    }

    for (const clause of renderAgreement(template, STUDIO, CUE, vars).clauses) {
      for (const p of clause.paragraphs) {
        const hit = p.match(FUNCTION_WORD);
        assert.equal(
          hit,
          null,
          `${template.slug}/${clause.id}: "${hit?.[0]}" — a bare number followed by "${hit?.[1]}" is missing its unit noun.\n  ${p}`,
        );
      }
    }
  }
});

/* Contract-correctness regressions. Each of these shipped a document that said
   something its creator never agreed to, and none was visible by reading the
   source — only by rendering it. */
test("a default agreement contains no money term the creator did not choose", () => {
  const doc = render("wedding");
  assert.ok(!doc.includes("becomes payable"), "an un-enabled cancellation fee rendered");
  assert.ok(!doc.includes("per month on the outstanding balance"), "an un-enabled late fee rendered");
  // Two clauses both headed "Cancellation", with incompatible consequences.
  const headings = doc.match(/"heading":"Cancellation"/g) ?? [];
  assert.equal(headings.length, 1, "two contradictory Cancellation clauses rendered");
});

test("the commercial template grants one licence, not two", () => {
  const doc = render("commercial");
  assert.ok(
    !doc.includes("personal, non-commercial use"),
    "a brand client was told their licence was personal and non-commercial",
  );
  assert.ok(doc.includes("Commercial licence"));
});

test("the video template never calls the deliverable an image", () => {
  const doc = render("video");
  for (const phrase of [
    "delivered images",
    "appearing in the images",
    "posting the images",
    "loss of the images", // the liability cap — the worst one to get wrong
  ]) {
    assert.ok(!doc.includes(phrase), `video says "${phrase}"`);
  }
});

test("an unrestricted licence does not then list restrictions", () => {
  assert.ok(!render("wedding", { client_use: "unlimited" }).includes("may not be altered"));
  // …but a restricted one still carries them.
  assert.ok(render("wedding", { client_use: "personal" }).includes("may not be altered"));
});

test("a private shoot's consent clause does not point at uses that were removed", () => {
  const doc = render("wedding", { portfolio_use: false });
  assert.ok(!doc.includes("the uses described above"), "dangling reference on a private shoot");
  assert.ok(doc.includes("authority to consent on behalf"));
});

test("no clause asserts what an electronic signature is worth in law", () => {
  // Cue is not a law firm, the locked disclaimer says so one clause later, and
  // a typed-only signer never produced ink.
  assert.ok(!render("wedding").includes("same effect as a signature in ink"));
});

test("the delivered count is a floor OR an estimate, never advertised as both", () => {
  const doc = render("wedding");
  assert.ok(doc.includes("will receive at least"));
  assert.ok(!doc.includes("approximately"), "a floor and an estimate are different promises");
});

test("a short session does not default to a wedding's guaranteed image count", () => {
  assert.ok(!render("portrait").includes("at least 400"), "a 2-hour session guaranteed 400 images");
  assert.ok(render("portrait").includes("at least 40 "));
});

test("clause ids are unique within a template", () => {
  for (const template of TEMPLATES) {
    const ids = template.clauses.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, `${template.slug} has duplicate clause ids`);
  }
});

test("question keys are unique within a template", () => {
  for (const template of TEMPLATES) {
    const keys = template.questions.map((q) => q.key);
    assert.equal(new Set(keys).size, keys.length, `${template.slug} has duplicate question keys`);
  }
});

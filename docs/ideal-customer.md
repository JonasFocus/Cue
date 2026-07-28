# Ideal customer

> **This is a hypothesis, not research.** Cue has zero customers. It has a
> waitlist and no shipped product. Nothing below comes from interviews, surveys,
> or usage data, because none exist yet. It is a reasoned starting point written
> to be falsified — the first fifteen real users should contradict some of it,
> and when they do, this file changes.

Derived from the positioning in [`solution.md`](./solution.md) and from the
assumptions already baked into the six templates in `src/lib/templates.ts`.

---

## The one-line version

An independent wedding photographer or videographer who sends between two and
six client agreements a month, works mostly from a phone, and is currently doing
it with a PDF and a text message.

---

## Who this is for

**Primary — the beachhead.** Independent wedding photographers and
videographers. Chosen not because the market is largest but because the pain is
sharpest and most frequent: weddings involve a deposit to hold a date, a
cancellation window, a reschedule policy, and a client who has never signed
anything like this before. Every one of those is a clause someone eventually
wishes they had written down.

**Secondary — reachable from the same product.** Portrait and family
photographers (higher volume, lower stakes per shoot), and brand/commercial
shooters (fewer shoots, but usage licensing that genuinely matters). The
commercial template exists because a business client asking "can we use these in
an ad?" is where an amateur agreement falls apart.

**Explicitly not for us yet:**

- Studios with several photographers on staff. `studio.owner_user_id` is 1:1;
  multi-user is a Studio-plan promise, not a built feature.
- Anyone who needs to *collect* money. Cue is not an invoicing or payments
  product and rejecting that scope is a feature.
- Anyone who needs a general-purpose form or document builder.
- Enterprise procurement, redlining, or counter-signature workflows.

---

## What they are doing today

The competition is not DocuSign. It is:

1. **A PDF and a text message.** Export from Pages or Canva, send it, hope they
   sign it, receive a photo of a signed page taken at an angle in bad light.
2. **A studio-management suite** (HoneyBook, Dubsado, Sprout, Táve). Capable,
   and priced and shaped for someone running a business on it. Overkill for
   someone who wants the agreement part to work.
3. **Nothing.** A verbal agreement and a deposit over Venmo. This is more common
   than anyone admits, and it is who the free tier is for.

Cue's wedge is between (1) and (2): more trustworthy than a PDF, far less than a
suite.

---

## The moment we are building for

Not "contract management". A specific moment: **a client has just said yes, and
the photographer wants it in writing before the enthusiasm cools.**

That moment has properties that dictate the product:

- It is often **on a phone**, sometimes at a venue, on bad wifi. Hence the
  signing page ships almost no JavaScript and the builder is usable one-handed.
- It is **time-sensitive but not urgent** — minutes matter, seconds do not.
- The client is **not a business buyer**. They will not create an account, and
  asking them to is how the yes gets lost. Hence a token link and no signup.
- The photographer's **professionalism is on display**. The signing page is the
  client's impression of them, which is why studio branding lands there.

---

## Why they would pay

The free tier is five sends **total**, not monthly. That is deliberate: enough
to feel the workflow on real client work, and a clean conversion point once it
has become the way they do it. Someone who sends five agreements has stopped
evaluating and started depending.

The upgrade trigger we expect is **volume, not features** — they run out. If
instead people upgrade for branding or saved templates, the pricing shape is
wrong and should change.

---

## How we would know we are right

Nothing here is validated. These are the signals that would confirm or kill it:

| Signal | Reading |
| --- | --- |
| Sends per active creator per month | The core one. Below ~2 this is not a habit and retention will not hold. |
| Time from signup to *first send* | Measures whether the builder is actually fast. Long tail means the form is too heavy. |
| Share of Cues that reach `signed` | Sent-but-never-signed means the client experience is failing, not the creator one. |
| Free-to-paid conversion at the five-send wall | Tests the allowance shape directly. |
| Templates actually used | If everything is wedding, cut the others. If `blank` dominates, the templates are wrong. |
| Clauses removed in the builder | A clause everyone deletes is a clause written badly. |

None of these are instrumented yet. That is a gap, and it should be closed
before the first fifteen users arrive rather than after.

---

## What would falsify this

Written down now, while it is cheap to be wrong:

- **They want payments.** If the first thing every user asks for is "can they
  pay the deposit here", the wedge is wrong and Cue is a payments product with
  an agreement attached. `solution.md` rejects this scope; that rejection is a
  bet, not a fact.
- **They already have a suite.** If most of the waitlist is on HoneyBook and
  content with it, the market is people who have *not* yet bought one — much
  smaller and earlier-career than assumed.
- **The templates are unusable.** If everyone pastes their lawyer's wording into
  the blank template, then the value is the signing and record-keeping, not the
  agreements — and the six templates were largely wasted effort.
- **Nobody trusts it.** If clients balk at signing on a link from an unknown
  domain, branding and a custom domain move from Pro-tier nice-to-have to
  table stakes.

---

## Positioning, in their words

What a photographer should be able to say about it:

> "I send the agreement from my phone, they sign it on theirs, and I have the
> signed copy before I have left the venue."

Not "document workflow automation". Not "e-signature infrastructure". The
product is the ninety seconds between the yes and the record.

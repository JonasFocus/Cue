import type { Clause, Question, Template } from "./agreement";

/* The system templates. Data, not code: the engine in agreement.ts never names
   a shoot type, so a sixth template is an entry in TEMPLATES and nothing else.

   On the prose: these are written to be professional, plain, and even-handed —
   the kind of terms a working photographer would recognise. They are still a
   starting point, not legal advice, and every template carries the locked
   `disclaimer` clause saying exactly that. Do not remove it, and do not write
   copy anywhere that implies Cue has reviewed these for a jurisdiction. */

const G = {
  shoot: "The shoot",
  deliver: "What the client gets",
  money: "Money",
  change: "If plans change",
  rights: "Rights and use",
  extra: "Extras",
} as const;

const DUE_OPTIONS = [
  { value: "on_signing", label: "on signing" },
  { value: "14_before", label: "14 days before the shoot" },
  { value: "30_before", label: "30 days before the shoot" },
  { value: "60_before", label: "60 days before the shoot" },
  { value: "90_before", label: "90 days before the shoot" },
  { value: "day_of", label: "on the day of the shoot" },
  { value: "on_delivery", label: "on delivery of the final gallery" },
  { value: "30_after", label: "30 days after the shoot" },
] as const;

/* ── Question sets ──
   Returned from functions rather than shared as module constants: a template
   is free to splice or reorder its own copy without reaching into another's. */

function moneyQuestions(): Question[] {
  return [
    {
      key: "total_fee",
      type: "money",
      label: "Total fee",
      help: "The full amount for the work described here, before any add-ons.",
      group: G.money,
      default: 0,
    },
    {
      key: "deposit",
      type: "toggle",
      label: "Take a deposit to hold the date",
      help: "A non-refundable retainer is the usual way to reserve a date.",
      group: G.money,
      default: true,
    },
    {
      key: "deposit_type",
      type: "choice",
      label: "Deposit is",
      group: G.money,
      showIf: "deposit",
      default: "percent",
      options: [
        { value: "percent", label: "a percentage of the total" },
        { value: "amount", label: "a fixed amount" },
      ],
    },
    {
      key: "deposit_percent",
      type: "percent",
      label: "Deposit percentage",
      group: G.money,
      showIf: "deposit & deposit_type=percent",
      default: 30,
    },
    {
      key: "deposit_amount",
      type: "money",
      label: "Deposit amount",
      group: G.money,
      showIf: "deposit & deposit_type=amount",
      default: 0,
    },
    {
      key: "deposit_due",
      type: "choice",
      label: "Deposit due",
      group: G.money,
      showIf: "deposit",
      default: "on_signing",
      options: DUE_OPTIONS,
    },
    {
      key: "deposit_refundable",
      type: "toggle",
      label: "Deposit is refundable",
      help: "Off is standard — the deposit compensates for the date being held.",
      group: G.money,
      showIf: "deposit",
      default: false,
    },
    {
      key: "balance_due",
      type: "choice",
      label: "Balance due",
      group: G.money,
      default: "day_of",
      options: DUE_OPTIONS,
    },
    {
      key: "late_fee",
      type: "toggle",
      label: "Charge a late fee on overdue payments",
      group: G.money,
      default: false,
    },
    {
      key: "late_fee_type",
      type: "choice",
      label: "Late fee is",
      group: G.money,
      showIf: "late_fee",
      default: "percent",
      options: [
        { value: "percent", label: "a percentage per month" },
        { value: "amount", label: "a flat amount" },
      ],
    },
    {
      key: "late_fee_percent",
      type: "percent",
      label: "Late fee per month",
      group: G.money,
      showIf: "late_fee & late_fee_type=percent",
      default: 5,
    },
    {
      key: "late_fee_amount",
      type: "money",
      label: "Late fee",
      group: G.money,
      showIf: "late_fee & late_fee_type=amount",
      default: 0,
    },
    {
      key: "late_fee_grace",
      type: "slider",
      label: "Grace period before it applies",
      group: G.money,
      showIf: "late_fee",
      min: 0,
      max: 30,
      step: 1,
      unit: "days",
      default: 7,
    },
  ];
}

function changeQuestions(): Question[] {
  return [
    {
      key: "cancellation_fee",
      type: "toggle",
      label: "Charge a cancellation fee",
      help: "Beyond keeping the deposit. Covers work already done and the date lost.",
      group: G.change,
      default: false,
    },
    {
      key: "cancellation_type",
      type: "choice",
      label: "Cancellation fee is",
      group: G.change,
      showIf: "cancellation_fee",
      default: "percent",
      options: [
        { value: "percent", label: "a percentage of the total" },
        { value: "amount", label: "a fixed amount" },
      ],
    },
    {
      key: "cancellation_percent",
      type: "percent",
      label: "Cancellation fee",
      group: G.change,
      showIf: "cancellation_fee & cancellation_type=percent",
      default: 50,
    },
    {
      key: "cancellation_amount",
      type: "money",
      label: "Cancellation fee",
      group: G.change,
      showIf: "cancellation_fee & cancellation_type=amount",
      default: 0,
    },
    {
      key: "cancellation_window",
      type: "slider",
      label: "Applies to cancellations within",
      help: "Cancel earlier than this and only the deposit is kept.",
      group: G.change,
      showIf: "cancellation_fee",
      min: 0,
      max: 180,
      step: 5,
      unit: "days of the shoot",
      default: 30,
    },
    {
      key: "reschedule",
      type: "toggle",
      label: "Allow one free reschedule",
      group: G.change,
      default: true,
    },
    {
      key: "reschedule_notice",
      type: "slider",
      label: "Notice required to reschedule",
      group: G.change,
      showIf: "reschedule",
      min: 0,
      max: 90,
      step: 1,
      unit: "days",
      default: 14,
    },
  ];
}

function rightsQuestions(): Question[] {
  return [
    {
      key: "client_use",
      type: "choice",
      label: "The client may use the images for",
      group: G.rights,
      default: "personal",
      options: [
        { value: "personal", label: "personal, non-commercial use" },
        { value: "personal_social", label: "personal use and social media" },
        { value: "commercial", label: "commercial use in their own business" },
        { value: "unlimited", label: "any use, with no restriction" },
      ],
    },
    {
      key: "portfolio_use",
      type: "toggle",
      label: "I may show this work in my portfolio",
      help: "Website, social media, and submissions. Off means a private shoot.",
      group: G.rights,
      default: true,
    },
    {
      key: "model_release",
      type: "toggle",
      label: "Include a model release",
      help: "Written permission to use the client's likeness in the ways above.",
      group: G.rights,
      default: true,
    },
    {
      key: "credit",
      type: "toggle",
      label: "Ask for a credit when the client posts",
      group: G.rights,
      default: true,
    },
  ];
}

function extraQuestions(): Question[] {
  return [
    {
      key: "travel_fee",
      type: "toggle",
      label: "Travel is billed separately",
      group: G.extra,
      default: false,
    },
    {
      key: "travel_amount",
      type: "money",
      label: "Travel fee",
      group: G.extra,
      showIf: "travel_fee",
      default: 0,
    },
    {
      key: "overtime",
      type: "toggle",
      label: "Offer overtime beyond the booked hours",
      group: G.extra,
      default: true,
    },
    {
      key: "overtime_rate",
      type: "money",
      label: "Overtime rate per hour",
      group: G.extra,
      showIf: "overtime",
      default: 0,
    },
    {
      key: "extra_terms",
      type: "textarea",
      label: "Anything else",
      help: "Added to the agreement as a final clause, in your words.",
      placeholder: "Parking is provided by the venue. Meal break at 6pm.",
      group: G.extra,
      default: "",
    },
  ];
}

function deliveryQuestions(photoDefault = 400): Question[] {
  return [
    {
      key: "deliverables",
      type: "choice",
      label: "The client receives",
      group: G.deliver,
      default: "digitals",
      options: [
        { value: "digitals", label: "edited digital images" },
        { value: "raws", label: "unedited RAW files" },
        { value: "both", label: "edited digital images and the RAW files" },
      ],
    },
    {
      key: "photo_count_set",
      type: "toggle",
      label: "Guarantee a number of images",
      help: "Off promises a best-effort gallery with no minimum count.",
      group: G.deliver,
      default: true,
    },
    {
      key: "photo_count",
      type: "slider",
      label: "Images delivered",
      group: G.deliver,
      showIf: "photo_count_set",
      min: 0,
      max: 5000,
      step: 25,
      custom: true,
      unit: "images",
      default: photoDefault,
    },
    {
      key: "delivery_days",
      type: "slider",
      label: "Delivered within",
      group: G.deliver,
      min: 1,
      max: 180,
      step: 1,
      unit: "days of the shoot",
      default: 30,
    },
    {
      key: "gallery_days",
      type: "slider",
      label: "Online gallery stays live for",
      group: G.deliver,
      min: 30,
      max: 1095,
      step: 30,
      custom: true,
      unit: "days",
      default: 365,
    },
    {
      key: "shot_list",
      type: "toggle",
      label: "The client provides a shot list",
      help: "Turns on a clause about when it is due and what it commits you to.",
      group: G.deliver,
      default: false,
    },
    {
      key: "shot_list_due",
      type: "slider",
      label: "Shot list due",
      group: G.deliver,
      showIf: "shot_list",
      min: 1,
      max: 60,
      step: 1,
      unit: "days before the shoot",
      default: 14,
    },
    {
      key: "retouching",
      type: "choice",
      label: "Retouching included",
      group: G.deliver,
      default: "standard",
      options: [
        { value: "standard", label: "colour and exposure correction" },
        { value: "full", label: "full retouching on every delivered image" },
        { value: "selects", label: "full retouching on a selection" },
        { value: "none", label: "no retouching — straight edits only" },
      ],
    },
  ];
}

function timeQuestions(hoursDefault: number): Question[] {
  return [
    {
      key: "hours",
      type: "slider",
      label: "Hours of coverage",
      group: G.shoot,
      min: 1,
      max: 16,
      step: 1,
      unit: "hours",
      default: hoursDefault,
    },
    {
      key: "start_time",
      type: "text",
      label: "Start time",
      placeholder: "10:00 AM",
      group: G.shoot,
      default: "",
    },
    {
      key: "second_shooter",
      type: "toggle",
      label: "A second shooter is included",
      group: G.shoot,
      default: false,
    },
  ];
}

/* ── Clause sets ── */

function moneyClauses(): Clause[] {
  return [
    {
      id: "fee",
      heading: "Fee",
      body: `The total fee for the services described in this agreement is {{total_fee}}. Unless stated otherwise below, this covers the coverage, editing, and delivery set out above and nothing further.`,
    },
    {
      id: "deposit_percent",
      heading: "Deposit",
      showIf: "deposit & deposit_type=percent",
      body: `A deposit of {{deposit_percent}} of the total fee is due {{deposit_due}}. The date is not reserved until the deposit is received, and {{studio.name}} is free to accept other work for that date until it is.

The deposit is applied against the total fee.`,
    },
    {
      id: "deposit_amount",
      heading: "Deposit",
      showIf: "deposit & deposit_type=amount",
      body: `A deposit of {{deposit_amount}} is due {{deposit_due}}. The date is not reserved until the deposit is received, and {{studio.name}} is free to accept other work for that date until it is.

The deposit is applied against the total fee.`,
    },
    {
      id: "deposit_nonrefundable",
      heading: "The deposit is non-refundable",
      showIf: "deposit & !deposit_refundable",
      body: `Because the deposit compensates {{studio.name}} for holding the date and turning away other work, it is non-refundable once paid, except where this agreement says otherwise.`,
    },
    {
      id: "deposit_refundable",
      heading: "Refund of the deposit",
      showIf: "deposit & deposit_refundable",
      body: `The deposit is refundable in full if {{client.name}} cancels in writing, subject to the cancellation terms in this agreement.`,
    },
    {
      id: "balance",
      heading: "Balance",
      body: `The remaining balance is due {{balance_due}}. Final delivery follows payment of the balance in full.`,
    },
    {
      id: "late_percent",
      heading: "Late payment",
      showIf: "late_fee & late_fee_type=percent",
      body: `Payments more than {{late_fee_grace}} days overdue accrue a late fee of {{late_fee_percent}} per month on the outstanding balance, applied from the original due date.`,
    },
    {
      id: "late_amount",
      heading: "Late payment",
      showIf: "late_fee & late_fee_type=amount",
      body: `Payments more than {{late_fee_grace}} days overdue incur a late fee of {{late_fee_amount}}.`,
    },
    {
      id: "travel",
      heading: "Travel",
      showIf: "travel_fee",
      body: `Travel to and from the location is billed separately at {{travel_amount}}, in addition to the fee above.`,
    },
    {
      id: "overtime",
      heading: "Overtime",
      showIf: "overtime",
      body: `Coverage beyond the booked hours is available at {{overtime_rate}} per hour, agreed at the time and billed with the balance. {{studio.name}} will always confirm before the clock starts.`,
    },
  ];
}

function changeClauses(): Clause[] {
  return [
    {
      id: "cancel_percent",
      heading: "Cancellation",
      showIf: "cancellation_fee & cancellation_type=percent",
      body: `If {{client.name}} cancels within {{cancellation_window}} days of the shoot, {{cancellation_percent}} of the total fee becomes payable, in addition to the deposit already paid. Cancelling earlier than that forfeits the deposit only.

Cancellation must be given in writing.`,
    },
    {
      id: "cancel_amount",
      heading: "Cancellation",
      showIf: "cancellation_fee & cancellation_type=amount",
      body: `If {{client.name}} cancels within {{cancellation_window}} days of the shoot, a cancellation fee of {{cancellation_amount}} becomes payable, in addition to the deposit already paid. Cancelling earlier than that forfeits the deposit only.

Cancellation must be given in writing.`,
    },
    {
      id: "cancel_plain",
      heading: "Cancellation",
      showIf: "!cancellation_fee",
      body: `Either party may cancel in writing. {{client.name}} forfeits any deposit paid. If {{studio.name}} cancels for any reason other than those described under Circumstances beyond control, all sums paid are refunded in full.`,
    },
    {
      id: "reschedule",
      heading: "Rescheduling",
      showIf: "reschedule",
      body: `The shoot may be moved once at no charge, with at least {{reschedule_notice}} days' written notice and subject to {{studio.name}} being available on the new date. The deposit carries across. Further changes are treated as a cancellation and a new booking.`,
    },
    {
      id: "force_majeure",
      heading: "Circumstances beyond control",
      body: `Neither party is liable for failing to perform because of events outside their reasonable control — illness, injury, accident, severe weather, transport failure, or an act of government. In that case {{studio.name}} will make every reasonable effort to find a replacement of comparable standard or to reschedule.

If neither is possible, liability is limited to a refund of all sums paid, and neither party owes the other anything further.`,
    },
    {
      id: "weather",
      heading: "Weather",
      showIf: "outdoor",
      body: `Some of this shoot takes place outdoors. If conditions on the day make photography unsafe or unworkable, {{studio.name}} and {{client.name}} will agree either to move to a suitable indoor location or to reschedule under the terms above. Weather alone is not grounds for a refund once coverage has begun.`,
    },
  ];
}

function rightsClauses(): Clause[] {
  return [
    {
      id: "copyright",
      heading: "Copyright",
      body: `{{studio.name}} retains copyright in every image produced under this agreement. Nothing here transfers ownership of the work itself.`,
    },
    {
      id: "client_licence",
      heading: "What the client may do with the images",
      body: `{{client.name}} receives a perpetual, worldwide licence to use the delivered images for {{client_use}}. The images may be printed, shared, and stored without further payment, within that scope.`,
    },
    {
      id: "client_licence_limits",
      heading: "Limits on that licence",
      // Not rendered on "any use, with no restriction" — a grant of no
      // restriction followed by four restrictions is not a licence anyone can
      // rely on. Cropping and colour for layout are explicitly allowed: a
      // business that may not crop cannot put an image in a layout at all.
      showIf: "!client_use=unlimited",
      body: `Images may not be altered in a way that changes the character of the work, and may not be sold or sub-licensed to a third party without written permission. Cropping, resizing, and colour adjustment to fit a layout are fine.`,
    },
    {
      id: "portfolio",
      heading: "Portfolio and promotion",
      showIf: "portfolio_use",
      body: `{{client.name}} agrees that {{studio.name}} may display the images in a portfolio, on a website, on social media, in printed samples, and in competition or publication submissions.

If {{client.name}} would prefer specific images withheld, saying so in writing at any time is enough — {{studio.name}} will remove them from public display within a reasonable period.`,
    },
    {
      id: "private",
      heading: "Private shoot",
      showIf: "!portfolio_use",
      body: `This is a private shoot. {{studio.name}} will not display, publish, or submit any image from it without separate written permission from {{client.name}}.`,
    },
    {
      id: "model_release",
      heading: "Model release",
      showIf: "model_release & portfolio_use",
      body: `{{client.name}} consents to their likeness appearing in the images and to the uses described above, and confirms they have authority to give that consent for everyone they have engaged to appear.

This consent is given without expectation of payment, and may be withdrawn for future use by written notice.`,
    },
    {
      id: "model_release_private",
      heading: "Consent and likeness",
      showIf: "model_release & !portfolio_use",
      body: `{{client.name}} confirms they have authority to consent on behalf of everyone they have engaged to appear. No image from this shoot will be published or displayed by {{studio.name}} without separate written permission.`,
    },
    {
      id: "credit",
      heading: "Credit",
      showIf: "credit",
      body: `Where practical, {{client.name}} will credit {{studio.name}} when posting the images publicly. This is a courtesy, not a condition of the licence.`,
    },
  ];
}

function deliveryClauses(): Clause[] {
  return [
    {
      id: "deliverables_count",
      heading: "What is delivered",
      showIf: "photo_count_set",
      body: `{{client.name}} will receive at least {{photo_count}} {{deliverables}} from this shoot, delivered within {{delivery_days}} days of the shoot date.

The final count is usually higher — {{studio.name}} delivers every image that meets a professional standard rather than working to a quota — but the number above is the minimum, barring circumstances beyond control.`,
    },
    {
      id: "deliverables_open",
      heading: "What is delivered",
      showIf: "!photo_count_set",
      body: `{{client.name}} will receive {{deliverables}} from this shoot, delivered within {{delivery_days}} days of the shoot date. No specific number of images is guaranteed; {{studio.name}} delivers every image that meets a professional standard.`,
    },
    {
      id: "retouching",
      heading: "Editing",
      showIf: "!retouching=none",
      body: `Delivered images include {{retouching}}. Editing style is at the professional discretion of {{studio.name}} and is consistent with the portfolio {{client.name}} booked from. Requests for a materially different edit are treated as additional work.`,
    },
    {
      id: "raws",
      heading: "RAW files",
      showIf: "deliverables=raws",
      body: `This booking delivers unedited RAW files. {{studio.name}} does not colour-correct, retouch, or cull them, and asks that they not be published in a way that credits {{studio.name}} for the finished result.`,
    },
    {
      id: "raws_both",
      heading: "RAW files",
      showIf: "deliverables=both",
      body: `Alongside the edited images, {{client.name}} receives the unedited RAW files. {{studio.name}} asks that RAW files not be published as finished work, or edited and credited to {{studio.name}}.`,
    },
    {
      id: "gallery",
      heading: "Gallery availability",
      body: `The online gallery remains available for {{gallery_days}} days from delivery. {{client.name}} is responsible for downloading and backing up the images within that window. {{studio.name}} keeps an archive as a courtesy but does not guarantee it, and may charge a retrieval fee after the gallery closes.`,
    },
    {
      id: "shot_list",
      heading: "Shot list",
      showIf: "shot_list",
      body: `{{client.name}} will provide a written shot list at least {{shot_list_due}} days before the shoot. {{studio.name}} will make every reasonable effort to capture every item on it.

A shot list is a guide, not a guarantee: people move, light changes, and schedules slip. Items that cannot be captured because a person, object, or location was unavailable on the day are not a failure to perform under this agreement.`,
    },
    {
      id: "no_shot_list",
      heading: "Creative direction",
      showIf: "!shot_list",
      body: `No shot list has been agreed. {{studio.name}} will shoot to their own judgement and style, informed by any direction {{client.name}} gives on the day.`,
    },
  ];
}

function conductClauses(): Clause[] {
  return [
    {
      id: "cooperation",
      heading: "Cooperation and access",
      body: `{{client.name}} agrees to ensure {{studio.name}} has safe and reasonable access to the location, subjects, and any permissions the venue requires. Time lost to access problems, permits, or delays outside {{studio.name}}'s control comes out of the booked hours.`,
    },
    {
      id: "safety",
      heading: "Safety and conduct",
      body: `{{studio.name}} may stop work and leave if the environment becomes unsafe, or if anyone present behaves abusively toward {{studio.name}} or their team. In that case the fee remains payable in full.`,
    },
    {
      id: "backup",
      heading: "Files and loss",
      body: `{{studio.name}} keeps duplicate copies of the images from capture until delivery. In the unlikely event of total loss of the images through equipment failure or an event beyond reasonable control, liability is limited to a refund of all sums paid.

Neither party is liable to the other for indirect or consequential loss.`,
    },
    {
      id: "extra_terms",
      heading: "Additional terms",
      showIf: "extra_terms",
      body: `{{extra_terms}}`,
    },
    {
      id: "whole",
      heading: "The whole agreement",
      body: `This document is the entire agreement between {{studio.name}} and {{client.name}} for this booking, and replaces any earlier discussion or quote. Changes are only effective if both parties agree to them in writing.

If any part of this agreement is found unenforceable, the rest continues to apply.`,
    },
  ];
}

/* Locked, and last. Every template carries it, the creator cannot remove it,
   and it is the reason this product can honestly call these templates. */
const DISCLAIMER: Clause = {
  id: "disclaimer",
  heading: "About this document",
  locked: true,
  body: `This agreement was prepared from a template by {{studio.name}} using Cue. Cue is not a law firm, is not a party to this agreement, and does not provide legal advice. This template has not been reviewed for any particular jurisdiction or set of circumstances.

Both parties are encouraged to have it reviewed by a qualified lawyer before signing. By signing, each party confirms they have read it, understood it, and had the opportunity to take independent advice.`,
};

const SIGNATURES: Clause = {
  id: "signatures",
  heading: "Signatures",
  locked: true,
  body: `By signing below, each party agrees to be bound by the terms set out above, and consents to signing this agreement electronically. Each party agrees not to dispute the validity of this agreement on the grounds that it was signed electronically.

A signature is the signer's full legal name, given with that consent. A drawn mark may be added but is not required. Each signature is recorded with the signer's name, the time of signing, and a record of the document as it stood at that moment.`,
};

/* ── The templates ── */

function photoTemplate(
  slug: string,
  name: string,
  blurb: string,
  tone: Template["tone"],
  meta: string,
  hours: number,
  extras: {
    questions?: Question[];
    clauses?: Clause[];
    outdoor?: boolean;
    /** Inherited rights clauses this template replaces with its own. */
    dropRights?: string[];
    /** Questions whose only clause was dropped, so the control would do nothing. */
    dropQuestions?: string[];
    /** Guaranteed image count. A 2-hour portrait must not default to 400. */
    photoDefault?: number;
  } = {},
): Template {
  const questions: Question[] = [
    ...timeQuestions(hours),
    ...(extras.questions ?? []),
    ...deliveryQuestions(extras.photoDefault),
    ...moneyQuestions(),
    ...changeQuestions(),
    // A question whose only clause was dropped would be a control with no
    // effect on the document — worse than absent.
    ...rightsQuestions().filter((q) => !(extras.dropQuestions ?? []).includes(q.key)),
    ...extraQuestions(),
  ];

  if (extras.outdoor) {
    questions.splice(3, 0, {
      key: "outdoor",
      type: "toggle",
      label: "Some of this shoot is outdoors",
      help: "Adds a weather clause so a washout is not an argument.",
      group: G.shoot,
      default: true,
    });
  }

  return {
    slug,
    name,
    blurb,
    tone,
    meta,
    questions,
    clauses: [
      {
        id: "engagement",
        heading: "The booking",
        body: `{{client.name}} engages {{studio.legal_name}} to provide photography services on {{shoot.date}} at {{shoot.location}}, for {{hours}} hours of coverage beginning at {{start_time}}.`,
      },
      {
        id: "second_shooter",
        heading: "Second shooter",
        showIf: "second_shooter",
        body: `A second photographer is included in this booking, working under the direction of {{studio.name}}. {{studio.name}} remains responsible for the delivered work.`,
      },
      ...(extras.clauses ?? []),
      ...deliveryClauses(),
      ...moneyClauses(),
      ...changeClauses(),
      /* A template may drop an inherited rights clause when it grants the same
         right differently — commercial replaces `client_licence` with its own
         `commercial_licence`, and carrying both told a brand client their use
         was "personal, non-commercial". */
      ...rightsClauses().filter((c) => !(extras.dropRights ?? []).includes(c.id)),
      ...conductClauses(),
      SIGNATURES,
      DISCLAIMER,
    ],
  };
}

const WEDDING = photoTemplate(
  "wedding",
  "Wedding",
  "Full-day coverage, deposit to hold the date, and the clauses a wedding actually needs.",
  "rose",
  "Full day · deposit · reschedule",
  8,
  {
    outdoor: true,
    questions: [
      {
        key: "engagement_session",
        type: "toggle",
        label: "An engagement session is included",
        group: G.shoot,
        default: false,
      },
      {
        key: "meal",
        type: "toggle",
        label: "A meal is provided for the coverage team",
        help: "Standard on a full day, and worth writing down.",
        group: G.shoot,
        default: true,
      },
      {
        key: "album",
        type: "toggle",
        label: "A printed album is included",
        group: G.deliver,
        default: false,
      },
    ],
    clauses: [
      {
        id: "engagement_session",
        heading: "Engagement session",
        showIf: "engagement_session",
        body: `An engagement session is included in this booking, to be scheduled at a mutually convenient time before the wedding date. Images from it are delivered under the same terms as the wedding images.`,
      },
      {
        id: "meal",
        heading: "Meals and breaks",
        showIf: "meal",
        body: `For coverage of six hours or more, {{client.name}} will provide a hot meal and a short break for {{studio.name}} and any second shooter, taken at a natural pause in the day. Coverage continues from the same booked hours.`,
      },
      {
        id: "album",
        heading: "Album",
        showIf: "album",
        body: `A printed album is included in this booking. {{client.name}} selects the images; {{studio.name}} lays them out and provides one round of revisions before it goes to print. Albums are produced after final selections are approved, and printing timelines are set by the supplier.`,
      },
      {
        id: "venue",
        heading: "Venue restrictions",
        body: `Some venues and officiants restrict where a photographer may stand, whether flash may be used, and what may be photographed during a ceremony. {{studio.name}} will follow those rules. Coverage limited by a venue's restrictions is not a failure to perform under this agreement, and {{client.name}} agrees to share any known restrictions in advance.`,
      },
    ],
  },
);

const ELOPEMENT = photoTemplate(
  "elopement",
  "Elopement",
  "Small, often remote, usually travel. Adds travel, permits, and daylight.",
  "violet",
  "Half day · travel · permits",
  4,
  {
    photoDefault: 150,
    outdoor: true,
    questions: [
      {
        key: "permits",
        type: "toggle",
        label: "The location needs a permit",
        help: "National and state parks usually do, and someone has to hold it.",
        group: G.shoot,
        default: false,
      },
      {
        key: "hike",
        type: "toggle",
        label: "The location requires a hike",
        group: G.shoot,
        default: false,
      },
    ],
    clauses: [
      {
        id: "permits",
        heading: "Permits and access",
        showIf: "permits",
        body: `The location requires a permit for professional photography. {{client.name}} is responsible for obtaining it and for any fee, and will share a copy with {{studio.name}} before the date.

If the permit is refused or withdrawn, both parties will agree an alternative location or reschedule under the terms below.`,
      },
      {
        id: "hike",
        heading: "Remote locations",
        showIf: "hike",
        body: `This location is reached on foot. Both parties accept that terrain, daylight, and conditions may require the plan to change on the day, and agree to {{studio.name}}'s judgement on what is safe. {{client.name}} is responsible for their own suitable footwear, clothing, water, and fitness for the walk.`,
      },
      {
        id: "daylight",
        heading: "Daylight",
        body: `Coverage depends on natural light. The schedule is set around sunrise or sunset at the location, and {{client.name}} agrees to be ready at the agreed time so the light is not lost. Time lost to a late start comes out of the booked hours.`,
      },
    ],
  },
);

const PORTRAIT = photoTemplate(
  "portrait",
  "Portrait & family",
  "Short sessions, families and headshots. Simple money, quick turnaround.",
  "teal",
  "Session · quick turnaround",
  2,
  {
    photoDefault: 40,
    outdoor: true,
    questions: [
      {
        key: "people_count",
        type: "slider",
        label: "People in the session",
        group: G.shoot,
        min: 1,
        max: 40,
        step: 1,
        custom: true,
        unit: "people",
        default: 4,
      },
      {
        key: "outfit_changes",
        type: "slider",
        label: "Outfit changes included",
        group: G.shoot,
        min: 0,
        max: 6,
        step: 1,
        unit: "changes",
        default: 1,
      },
    ],
    clauses: [
      {
        id: "group",
        heading: "The group",
        body: `This session covers up to {{people_count}} people. Additional people can usually be accommodated but may extend the session, and time beyond the booked hours is charged as overtime.`,
      },
      {
        id: "outfits",
        heading: "Outfit changes",
        showIf: "outfit_changes",
        body: `This booking includes up to {{outfit_changes}} outfit changes. Changes take place within the booked time.`,
      },
      {
        id: "children",
        heading: "Children and pets",
        body: `Where children or animals are being photographed, {{client.name}} remains responsible for their supervision and safety throughout. {{studio.name}} will work patiently with whatever the day brings, and both parties accept that cooperation cannot be guaranteed.`,
      },
    ],
  },
);

const COMMERCIAL = photoTemplate(
  "commercial",
  "Brand & commercial",
  "Business clients, usage terms that matter, and an invoice with real payment terms.",
  "amber",
  "Commercial licence · usage term",
  6,
  {
    // `commercial_licence` below grants the same right on commercial terms.
    photoDefault: 25,
    dropRights: ["client_licence", "client_licence_limits"],
    dropQuestions: ["client_use"],
    questions: [
      {
        key: "usage_term",
        type: "choice",
        label: "Commercial licence runs for",
        group: G.rights,
        default: "perpetual",
        options: [
          { value: "one_year", label: "one year from delivery" },
          { value: "two_years", label: "two years from delivery" },
          { value: "perpetual", label: "an unlimited term" },
        ],
      },
      {
        key: "exclusive",
        type: "toggle",
        label: "The licence is exclusive to the client's industry",
        group: G.rights,
        default: false,
      },
      {
        key: "usage_media",
        type: "choice",
        label: "Licensed for",
        group: G.rights,
        default: "digital",
        options: [
          { value: "digital", label: "the client's own website and social media" },
          { value: "digital_print", label: "web, social, and printed marketing" },
          { value: "all_media", label: "all media, including paid advertising" },
        ],
      },
      {
        key: "art_direction",
        type: "toggle",
        label: "The client is providing art direction",
        group: G.shoot,
        default: true,
      },
    ],
    clauses: [
      {
        id: "commercial_licence",
        heading: "Commercial licence",
        body: `{{studio.name}} grants {{client.name}} a licence to use the delivered images for {{usage_media}}, running for {{usage_term}} from delivery.

Use outside that scope — a different medium, a longer term, or resale to a third party — requires a separate written licence and fee.`,
      },
      {
        id: "exclusive",
        heading: "Exclusivity",
        showIf: "exclusive",
        body: `For the term of the licence, {{studio.name}} will not license these specific images to a direct competitor of {{client.name}}. This does not restrict {{studio.name}} from working with other clients or from portfolio use.`,
      },
      {
        id: "art_direction",
        heading: "Art direction",
        showIf: "art_direction",
        body: `{{client.name}} is providing art direction for this shoot and is responsible for approving setups on the day. Images delivered in line with approved direction are accepted as complete. Reshoots requested because the brief changed after the fact are quoted as new work.`,
      },
      {
        id: "third_party",
        heading: "Third-party rights",
        body: `{{client.name}} confirms they hold the rights, releases, and permissions for any product, artwork, trademark, location, or person they ask {{studio.name}} to photograph, and accepts responsibility for any claim arising from their use of the images.`,
      },
    ],
  },
);

/* `rightsClauses()` and `conductClauses()` are written for photographs. Video
   inherits their structure but must not inherit the noun: a client who received
   a film should not be granted a licence over "images", and a liability cap on
   "total loss of the images" may not cap the loss of the footage. */
const VIDEO_RIGHTS: Record<string, Partial<Clause>> = {
  copyright: {
    body: `{{studio.name}} retains copyright in all footage and in the finished film. Nothing here transfers ownership of the work itself.`,
  },
  client_licence: {
    heading: "What the client may do with the film",
    body: `{{client.name}} receives a perpetual, worldwide licence to use the delivered film for {{client_use}}. It may be shared, streamed, screened, and stored without further payment, within that scope.`,
  },
  client_licence_limits: {
    body: `The film may not be re-edited, re-scored, or otherwise altered in a way that changes the character of the work, and may not be sold or sub-licensed to a third party without written permission. Trimming for a platform's length limit is fine.`,
  },
  portfolio: {
    body: `{{client.name}} agrees that {{studio.name}} may show the film, and stills taken from it, in a portfolio, on a website, on social media, and in competition or festival submissions.

If {{client.name}} would prefer specific footage withheld, saying so in writing at any time is enough — {{studio.name}} will remove it from public display within a reasonable period.`,
  },
  private: {
    body: `This is a private shoot. {{studio.name}} will not display, publish, or submit the film or any footage from it without separate written permission from {{client.name}}.`,
  },
  model_release: {
    heading: "Appearing on camera",
    body: `{{client.name}} consents to appearing in the film and to the uses described above, and confirms they have authority to give that consent for everyone they have engaged to appear.

This consent is given without expectation of payment, and may be withdrawn for future use by written notice.`,
  },
  model_release_private: {
    body: `{{client.name}} confirms they have authority to consent on behalf of everyone they have engaged to appear. No footage from this shoot will be published or displayed by {{studio.name}} without separate written permission.`,
  },
  credit: {
    body: `Where practical, {{client.name}} will credit {{studio.name}} when posting the film publicly. This is a courtesy, not a condition of the licence.`,
  },
  backup: {
    body: `{{studio.name}} keeps duplicate copies of the footage from capture until delivery. In the unlikely event of total loss of the footage or the finished film through equipment failure or an event beyond reasonable control, liability is limited to a refund of all sums paid.

Neither party is liable to the other for indirect or consequential loss.`,
  },
};

/* Video is not a photo template with the words swapped — deliverables, revision
   rounds, and music licensing have no photo equivalent, so it builds its own
   question set rather than bending deliveryQuestions() out of shape. */
const VIDEO: Template = {
  slug: "video",
  name: "Video & film",
  blurb: "Films, reels, and commercial video. Cuts, revisions, music, and drone.",
  tone: "blue",
  meta: "Edit · revisions · music",
  questions: [
    ...timeQuestions(8),
    {
      key: "drone",
      type: "toggle",
      label: "Drone or aerial footage is included",
      group: G.shoot,
      default: false,
    },
    {
      key: "film_length",
      type: "slider",
      label: "Finished film runs about",
      group: G.deliver,
      min: 1,
      max: 120,
      step: 1,
      custom: true,
      unit: "minutes",
      default: 6,
    },
    {
      key: "teaser",
      type: "toggle",
      label: "A short teaser is included",
      group: G.deliver,
      default: false,
    },
    {
      key: "revisions",
      type: "slider",
      label: "Rounds of revisions included",
      help: "Two is standard. Unlimited revisions is how an edit never ships.",
      group: G.deliver,
      min: 0,
      max: 5,
      step: 1,
      unit: "rounds",
      default: 2,
    },
    {
      key: "delivery_days",
      type: "slider",
      label: "First cut delivered within",
      group: G.deliver,
      min: 7,
      max: 240,
      step: 1,
      unit: "days of the shoot",
      default: 60,
    },
    {
      key: "raw_footage",
      type: "toggle",
      label: "Raw footage is delivered too",
      help: "On a separate drive or transfer, usually for an extra fee.",
      group: G.deliver,
      default: false,
    },
    {
      key: "music",
      type: "choice",
      label: "Music is",
      group: G.rights,
      default: "licensed",
      options: [
        { value: "licensed", label: "licensed by me from a stock library" },
        { value: "client", label: "supplied by the client, with their licence" },
        { value: "custom", label: "custom-composed for this film" },
      ],
    },
    {
      key: "gallery_days",
      type: "slider",
      label: "Download link stays live for",
      group: G.deliver,
      min: 30,
      max: 1095,
      step: 30,
      custom: true,
      unit: "days",
      default: 365,
    },
    ...moneyQuestions(),
    ...changeQuestions(),
    ...rightsQuestions().filter((q) => q.key !== "model_release"),
    {
      key: "model_release",
      type: "toggle",
      label: "Include a release for appearing on camera",
      group: G.rights,
      default: true,
    },
    ...extraQuestions(),
  ],
  clauses: [
    {
      id: "engagement",
      heading: "The booking",
      body: `{{client.name}} engages {{studio.legal_name}} to provide video production services on {{shoot.date}} at {{shoot.location}}, for {{hours}} hours of filming beginning at {{start_time}}.`,
    },
    {
      id: "second_shooter",
      heading: "Second operator",
      showIf: "second_shooter",
      body: `A second camera operator is included in this booking, working under the direction of {{studio.name}}.`,
    },
    {
      id: "drone",
      heading: "Aerial footage",
      showIf: "drone",
      body: `Aerial footage is included where it can be flown safely and lawfully. {{studio.name}} will not fly in unsafe weather, in restricted airspace, or without any permission the location requires, and the absence of aerial footage for those reasons is not a failure to perform under this agreement.`,
    },
    {
      id: "film",
      heading: "The finished film",
      body: `{{client.name}} will receive a finished film of approximately {{film_length}} minutes, delivered within {{delivery_days}} days of the shoot date. Final running time is an editorial judgement and varies with the footage the day produces.`,
    },
    {
      id: "teaser",
      heading: "Teaser",
      showIf: "teaser",
      body: `A short teaser edit is included, usually delivered ahead of the full film.`,
    },
    {
      id: "revisions",
      heading: "Revisions",
      showIf: "revisions",
      body: `{{revisions}} rounds of revisions are included on the finished film. A round means one consolidated set of notes from {{client.name}}, returned within 14 days of receiving the cut.

Revisions cover pacing, ordering, trims, and corrections. Recutting to a materially different brief, or notes arriving after the film is approved, is quoted as additional work.`,
    },
    {
      id: "no_revisions",
      heading: "Revisions",
      showIf: "!revisions",
      body: `The finished film is delivered as a completed edit. Changes after delivery are quoted as additional work.`,
    },
    {
      id: "raw_footage",
      heading: "Raw footage",
      showIf: "raw_footage",
      body: `The unedited footage is delivered alongside the finished film. It is provided as captured, without grading or sound work, and {{studio.name}} asks that it not be published as finished work or re-edited and credited to {{studio.name}}.`,
    },
    {
      id: "no_raw_footage",
      heading: "Raw footage",
      showIf: "!raw_footage",
      body: `Unedited footage is not included in this booking and is not delivered. {{studio.name}} may archive it as a courtesy but does not guarantee it.`,
    },
    {
      id: "music_licensed",
      heading: "Music",
      showIf: "music=licensed",
      body: `{{studio.name}} licenses the music used in the film from a commercial library. The licence covers the delivered film as a whole; it does not permit {{client.name}} to extract or reuse the music separately.`,
    },
    {
      id: "music_client",
      heading: "Music",
      showIf: "music=client",
      body: `{{client.name}} is supplying the music and confirms they hold a licence permitting its use in this film and in the ways they intend to publish it. {{client.name}} accepts responsibility for any claim arising from that music, including a takedown by a platform.`,
    },
    {
      id: "music_custom",
      heading: "Music",
      showIf: "music=custom",
      body: `Music is composed for this film. {{client.name}} receives the right to use it as part of the delivered film. Rights in the composition itself remain with the composer.`,
    },
    {
      id: "gallery",
      heading: "Download availability",
      body: `The download link remains available for {{gallery_days}} days from delivery. {{client.name}} is responsible for downloading and backing up the film within that window.`,
    },
    ...moneyClauses(),
    ...changeClauses(),
    ...rightsClauses().map((c) =>
      VIDEO_RIGHTS[c.id] ? { ...c, ...VIDEO_RIGHTS[c.id] } : c,
    ),
    ...conductClauses().map((c) =>
      VIDEO_RIGHTS[c.id] ? { ...c, ...VIDEO_RIGHTS[c.id] } : c,
    ),
    SIGNATURES,
    DISCLAIMER,
  ],
};



/* The escape hatch. Matches the FAQ promise that a creator can bring their own
   wording — everything is theirs except the two locked clauses. */
const BLANK: Template = {
  slug: "blank",
  name: "Blank",
  blurb: "Your own wording, with Cue's signature block and audit record around it.",
  tone: "slate",
  meta: "Bring your own terms",
  questions: [
    {
      key: "body",
      type: "textarea",
      label: "Your agreement",
      help: "Paste or write your terms. Separate clauses with a blank line.",
      group: "Your terms",
      default: "",
    },
    ...moneyQuestions().slice(0, 1),
  ],
  clauses: [
    {
      id: "engagement",
      heading: "The booking",
      body: `{{client.name}} engages {{studio.legal_name}} for the work described below, on {{shoot.date}} at {{shoot.location}}.`,
    },
    /* Locked, and deliberately NOT gated on `showIf: "body"`.
     *
     * On this template the creator's terms are the entire agreement — the
     * booking clause above literally says "for the work described below". A
     * `showIf` that is false REMOVES a clause, and a removed clause leaves no
     * marker for `hasBlanks` to find, so an unanswered body used to render a
     * contract with no terms in it that passed the send gate and went to a
     * client to sign.
     *
     * Ungating alone is not enough: an unlocked clause appears in the builder's
     * clause picker with a Remove button, which is the same bug one click away.
     * `locked` is what makes it undroppable — see the `omitted` handling in
     * renderAgreement. */
    { id: "body", heading: "Terms", locked: true, body: `{{body}}` },
    {
      id: "fee",
      heading: "Fee",
      body: `The total fee for this work is {{total_fee}}.`,
    },
    SIGNATURES,
    DISCLAIMER,
  ],
};

export const TEMPLATES: readonly Template[] = [
  WEDDING,
  ELOPEMENT,
  PORTRAIT,
  COMMERCIAL,
  VIDEO,
  BLANK,
];

export function templateBySlug(slug: string): Template | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}

/** Distinct group headings for a template, in declaration order. */
export function questionGroups(template: Template): string[] {
  return [...new Set(template.questions.map((q) => q.group))];
}

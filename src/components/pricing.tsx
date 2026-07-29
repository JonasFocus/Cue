import { Check, CircleCheck } from "lucide-react";
import { Reveal } from "./reveal";

/* Stripe is deliberately not wired for v1 (see docs/solution.md, "Launch billing
   decision"). Plans are provisioned on the invite, so every CTA routes to the
   access form rather than a checkout. */

const PLANS = [
  {
    key: "free",
    name: "Free",
    badge: "$0",
    blurb: "Try Cue on a real send before you commit to anything.",
    features: [
      "Five total sent Cues",
      "Every agreement template",
      "Browser-saveable sealed record",
      "Document hash and audit trail",
    ],
    cta: "Request access",
    tone: "dark",
  },
  {
    key: "pro",
    name: "Pro",
    badge: "$19/month",
    blurb: "For independent photographers and videographers sending regularly.",
    features: [
      "Unlimited Cues",
      "Everything currently in Free",
      "Saved templates (planned)",
      "Email reminders (planned)",
    ],
    cta: "Request access",
    tone: "accent",
  },
  {
    key: "studio",
    name: "Studio",
    badge: "$49/month",
    blurb: "For small creative businesses with more than one person sending.",
    features: [
      "Everything in Pro",
      "Multiple users (planned)",
      "Shared templates (planned)",
      "Custom domain (planned)",
      "Priority support (planned)",
    ],
    cta: "Request access",
    tone: "dark",
  },
] as const;

const COMPARISON = [
  ["Sent Cues", "5 total", "Unlimited", "Unlimited"],
  ["Templates and audit record", "yes", "yes", "yes"],
  ["Saved templates", "—", "Planned", "Planned"],
  ["Users", "1", "1", "Planned"],
  ["Custom domain", "—", "—", "Planned"],
];

function Cell({ value }: { value: string }) {
  if (value === "yes") {
    return (
      <span
        aria-label="Included"
        style={{
          display: "inline-grid",
          placeItems: "center",
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "var(--cue-accent)",
          color: "#fff",
        }}
      >
        <Check size={12} strokeWidth={3} aria-hidden />
      </span>
    );
  }
  return <>{value}</>;
}

export function Pricing() {
  return (
    <section id="pricing" className="cue-section">
      <div className="cue-shell cue-shell-wide">
        <Reveal>
          <div className="cue-eyebrow-block">
            <h2 className="cue-h2">{"Start free,\npay when it sticks"}</h2>
            <p className="cue-lede">
              Five Cues free, no card required — the allowance is a total, not a
              monthly reset. Billing is not connected yet; paid prices describe
              the planned launch offer.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="cue-price-grid">
            {PLANS.map((plan) => (
              <div className="cue-price-card" key={plan.name}>
                <div className="cue-price-media" data-plan={plan.key} aria-hidden />

                <div className="cue-price-body">
                  <div className="cue-price-head">
                    <h3 className="cue-price-name">{plan.name}</h3>
                    <span className="cue-price-badge" data-tone={plan.tone}>
                      {plan.badge}
                    </span>
                  </div>

                  <p className="cue-price-blurb">{plan.blurb}</p>

                  <p className="cue-price-what">What you get:</p>
                  <ul className="cue-feature-list">
                    {plan.features.map((f) => (
                      <li key={f}>
                        <CircleCheck
                          className="cue-check"
                          size={16}
                          strokeWidth={1.6}
                          aria-hidden
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="cue-price-foot">
                  <a
                    href="#waitlist"
                    className={`cue-btn cue-btn-block ${
                      plan.tone === "accent" ? "cue-btn-accent" : "cue-btn-dark"
                    }`}
                  >
                    {plan.cta}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal>
          {/* Scrolls horizontally under ~600px, so it has to be reachable and
              scrollable from the keyboard. */}
          <div
            className="cue-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Plan comparison"
          >
            <table className="cue-table">
              <thead>
                <tr>
                  <th scope="col">Plan comparison</th>
                  <th scope="col">Free</th>
                  <th scope="col">Pro</th>
                  <th scope="col">Studio</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(([label, free, creator, studio]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>
                      <Cell value={free} />
                    </td>
                    <td>
                      <Cell value={creator} />
                    </td>
                    <td>
                      <Cell value={studio} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

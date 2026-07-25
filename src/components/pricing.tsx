import { Check, CircleCheck } from "lucide-react";
import { Reveal } from "./reveal";

/* Stripe is deliberately not wired for v1 (see solution.md, "Launch billing
   decision"). Every CTA collects interest instead of taking a payment. */

const PLANS = [
  {
    key: "free",
    name: "Free",
    badge: "$0",
    blurb: "Try Cue on real client work before you commit to anything.",
    features: [
      "Five total sent Cues",
      "Standard agreement templates",
      "Final PDF on every signature",
      "Full audit trail",
    ],
    cta: "Create your first Cue",
    tone: "dark",
  },
  {
    key: "creator",
    name: "Creator",
    badge: "$19/month",
    blurb: "For independent photographers and videographers sending regularly.",
    features: [
      "Unlimited Cues",
      "Custom branding",
      "Saved templates",
      "Email reminders",
      "Searchable agreement library",
    ],
    cta: "Join the waitlist",
    tone: "accent",
  },
  {
    key: "studio",
    name: "Studio",
    badge: "$49/month",
    blurb: "For small creative businesses with more than one person sending.",
    features: [
      "Everything in Creator",
      "Multiple users",
      "Shared templates",
      "Custom domain",
      "Priority support",
    ],
    cta: "Join the waitlist",
    tone: "dark",
  },
] as const;

const COMPARISON = [
  ["Sent Cues", "5 total", "Unlimited", "Unlimited"],
  ["Final PDF and audit trail", "yes", "yes", "yes"],
  ["Custom branding", "—", "yes", "yes"],
  ["Saved templates", "—", "yes", "Shared"],
  ["Users", "1", "1", "Multiple"],
  ["Support", "Email", "Email", "Priority"],
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
              Five Cues free, no card required. The allowance is a total, not a
              monthly reset.
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
          <div className="cue-table-wrap">
            <table className="cue-table">
              <thead>
                <tr>
                  <th scope="col">Plan Comparison</th>
                  <th scope="col">Free</th>
                  <th scope="col">Creator</th>
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

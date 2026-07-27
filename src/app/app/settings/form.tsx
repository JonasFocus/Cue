"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { updateStudioAction, type ActionState } from "../actions";

export type StudioFields = {
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  brandColor: string | null;
};

const INITIAL: ActionState = { status: "idle", message: "" };

const DEFAULT_BRAND = "#0086ff";
const HEX = /^#[0-9a-fA-F]{6}$/;

export function SettingsForm({ studio }: { studio: StudioFields }) {
  const [state, action, pending] = useActionState(updateStudioAction, INITIAL);
  const [brand, setBrand] = useState(studio.brandColor ?? "");

  // <input type="color"> has no empty state and rejects a partial hex, so it
  // shows the accent until the text field holds something it can render. The
  // text field is the one that submits.
  const swatch = HEX.test(brand) ? brand : DEFAULT_BRAND;
  const brandInvalid = brand !== "" && !HEX.test(brand);

  return (
    <form className="ca-card ca-card-pad cw-form ca-rise" action={action}>
      <div className="ca-field">
        <label className="ca-label" htmlFor="cw-name">
          Studio name
        </label>
        <input
          id="cw-name"
          className="ca-input"
          type="text"
          name="name"
          required
          maxLength={120}
          defaultValue={studio.name}
          autoComplete="organization"
          placeholder="Harper Studio"
        />
      </div>

      <div className="ca-field">
        <label className="ca-label" htmlFor="cw-legal">
          Legal name <span className="cw-opt">optional</span>
        </label>
        <input
          id="cw-legal"
          className="ca-input"
          type="text"
          name="legalName"
          maxLength={160}
          defaultValue={studio.legalName ?? ""}
          placeholder="Harper Studio LLC"
          aria-describedby="cw-legal-help"
        />
        <p className="ca-help" id="cw-legal-help">
          The name that appears as the contracting party. Falls back to your studio
          name when empty.
        </p>
      </div>

      <div className="cw-form-pair">
        <div className="ca-field">
          <label className="ca-label" htmlFor="cw-email">
            Contact email
          </label>
          <input
            id="cw-email"
            className="ca-input"
            type="email"
            name="email"
            maxLength={254}
            defaultValue={studio.email ?? ""}
            autoComplete="email"
            placeholder="you@studio.com"
          />
        </div>

        <div className="ca-field">
          <label className="ca-label" htmlFor="cw-phone">
            Phone <span className="cw-opt">optional</span>
          </label>
          <input
            id="cw-phone"
            className="ca-input"
            type="tel"
            name="phone"
            maxLength={40}
            defaultValue={studio.phone ?? ""}
            autoComplete="tel"
            placeholder="+1 512 555 0134"
          />
        </div>
      </div>

      <div className="ca-field">
        <label className="ca-label" htmlFor="cw-address">
          Address <span className="cw-opt">optional</span>
        </label>
        <textarea
          id="cw-address"
          className="ca-textarea cw-address"
          name="address"
          maxLength={400}
          rows={3}
          defaultValue={studio.address ?? ""}
          autoComplete="street-address"
          placeholder={"1100 Congress Ave\nAustin, TX 78701"}
        />
      </div>

      <div className="ca-field">
        <label className="ca-label" htmlFor="cw-brand">
          Brand colour <span className="cw-opt">optional</span>
        </label>
        <div className="cw-brand">
          <input
            className="cw-brand-swatch"
            type="color"
            value={swatch}
            onChange={(e) => setBrand(e.target.value)}
            aria-label="Pick a brand colour"
          />
          <input
            id="cw-brand"
            className="ca-input cw-brand-hex ca-nums"
            type="text"
            name="brandColor"
            maxLength={7}
            value={brand}
            onChange={(e) => setBrand(e.target.value.trim())}
            spellCheck={false}
            autoComplete="off"
            placeholder={DEFAULT_BRAND}
            aria-invalid={brandInvalid || undefined}
            aria-describedby="cw-brand-help"
          />
        </div>
        <p className="ca-help" id="cw-brand-help">
          {brandInvalid
            ? "Six-digit hex, like #0086ff."
            : "Used on the agreement your client opens. Leave empty for Cue's default."}
        </p>
      </div>

      <div className="cw-form-foot">
        <button type="submit" className="ca-btn ca-btn-primary" disabled={pending}>
          {pending ? (
            <>
              <Loader2 size={16} strokeWidth={2.25} className="ca-spin" />
              Saving
            </>
          ) : (
            "Save changes"
          )}
        </button>

        {/* Always mounted so the announcement comes from a content change AT is
            already watching — the same reasoning as the waitlist form. */}
        <p className="cw-form-msg" role="status" aria-live="polite" data-tone={state.status}>
          {state.status === "ok" && (
            <>
              <Check size={15} strokeWidth={2.75} aria-hidden />
              {state.message}
            </>
          )}
          {state.status === "error" && (
            <>
              <AlertCircle size={15} strokeWidth={2} aria-hidden />
              {state.message}
            </>
          )}
        </p>
      </div>
    </form>
  );
}

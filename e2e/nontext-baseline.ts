/**
 * Known WCAG 1.4.11 / generated-content findings in this lab, captured through
 * the gate's own path so the baseline and the check cannot disagree.
 *
 * THIS FILE IS A TO-DO LIST, NOT A SET OF EXEMPTIONS. The gate ratchets on it:
 *   - a finding NOT listed here fails the run, so a regression cannot land;
 *   - a listed finding whose ratio gets WORSE fails, so the list cannot rot;
 *   - a listed finding that no longer appears ALSO fails, so a fixed entry must
 *     be deleted and the file can only shrink toward empty.
 * The last rule is what stops an allowlist becoming a permanent exemption.
 *
 * `unverified: true` marks an absolutely-positioned pseudo-element. It can paint
 * outside its host and the oracle measures it against the host's backdrop, so
 * that ratio is NOT trustworthy — hand-measure before acting on it.
 */
export const NONTEXT_BASELINE: Record<
  string,
  { ratio: number; required: number; unverified: boolean }
> = {
  "control-boundary|button#cl-theme-toggle.cl-btn.cl-icon": { ratio: 1.58, required: 3.0, unverified: false },
  "control-boundary|button.align-pick": { ratio: 1.39, required: 3.0, unverified: false },
  "control-boundary|button.btn": { ratio: 1.28, required: 3.0, unverified: false },
  "control-boundary|button.copy-btn": { ratio: 1.48, required: 3.0, unverified: false },
  "control-boundary|button.key": { ratio: 1.24, required: 3.0, unverified: false },
  "control-boundary|button.plug-key": { ratio: 1.48, required: 3.0, unverified: false },
  "control-boundary|button.step-btn": { ratio: 1.28, required: 3.0, unverified: false },
  "control-boundary|select": { ratio: 2.99, required: 3.0, unverified: false },
  "control-boundary|textarea.mono": { ratio: 2.99, required: 3.0, unverified: false }
};

/**
 * Consent purposes, and the plain-language notice that accompanies each one.
 *
 * The DPDP Act asks that consent be "free, specific, informed, unconditional
 * and unambiguous", collected at the point of collection, with a notice saying
 * what data, why, for how long, which rights, and how to withdraw. That is a
 * lot to get right twice, so it is written down once here and every surface
 * renders from it — the sign-up page, the onboarding step, the rights centre
 * and the withdrawal control all quote the same words.
 *
 * `NOTICE_VERSION` is stamped onto every consent row. If this text changes in a
 * way that alters what someone agreed to, bump it: the old rows then say,
 * truthfully, that they were given against the old notice.
 *
 * Pure data. Safe to import from a client component.
 */

export const NOTICE_VERSION = "v1";

export type ConsentPurpose =
  | "account"
  | "marketing"
  | "profile_publication"
  | "ugc_publication";

export interface PurposeNotice {
  purpose: ConsentPurpose;
  /** The checkbox label. Written as a first-person statement, not a demand. */
  label: string;
  /** What data, and why. One sentence. */
  what: string;
  /** How long it is kept. */
  retention: string;
  /** Required to use the product at all? */
  required: boolean;
  /** What happens if this is withdrawn. */
  onWithdraw: string;
}

/**
 * Only `account` is required, and it is required because without it there is no
 * account — not as leverage to obtain the others. Every other purpose defaults
 * to off and can be withdrawn on its own, which is what "no bundling" means in
 * practice.
 */
export const PURPOSES: readonly PurposeNotice[] = [
  {
    purpose: "account",
    label:
      "Create my account and use it to manage my bookings on the wall.",
    what:
      "Your name and email, plus the bookings, payments and agreements you make. We need these to run the account itself.",
    retention:
      "While the account is open. Tax and contract records are kept for as long as the law requires, even after closure.",
    required: true,
    onWithdraw:
      "Withdrawing this closes the account. Bookings already paid for are honoured; records the law requires us to keep are retained.",
  },
  {
    purpose: "profile_publication",
    label:
      "Publish my name, city and practice on my public artist page while my work is on the wall.",
    what:
      "The public fields of your profile — never your email or phone. Buyer interest always routes through ArtWall.",
    retention: "While you choose to publish. Withdraw and the page unpublishes.",
    required: false,
    onWithdraw:
      "Your public page comes down. Work already hanging stays on the wall until its booking ends, shown without your profile link.",
  },
  {
    purpose: "marketing",
    label: "Send me invitations to future shows and occasional updates.",
    what: "Your email, used to send you things we think you'd want to come to.",
    retention: "Until you withdraw. One tap, no reason needed.",
    required: false,
    onWithdraw: "We stop sending. Nothing else about your account changes.",
  },
  {
    purpose: "ugc_publication",
    label:
      "Publish photos I submit to the community gallery, including any showing me.",
    what:
      "Photographs you choose to upload, and anything visible in them. A photo of a person is personal data, which is why this is its own question.",
    retention: "While it stands. Withdraw and the image is deleted and purged.",
    required: false,
    onWithdraw:
      "Anything you submitted is removed from the gallery and purged from the image cache.",
  },
] as const;

export const REQUIRED_PURPOSES = PURPOSES.filter((p) => p.required).map(
  (p) => p.purpose
);

export const OPTIONAL_PURPOSES = PURPOSES.filter((p) => !p.required);

export function purposeNotice(purpose: ConsentPurpose): PurposeNotice {
  const found = PURPOSES.find((p) => p.purpose === purpose);
  if (!found) throw new Error(`Unknown consent purpose: ${purpose}`);
  return found;
}

/**
 * The one-paragraph summary shown next to a sign-up button.
 *
 * Short enough that it is actually read, and specific enough to be a notice
 * rather than a gesture at one.
 */
export const SIGNUP_NOTICE =
  "Creating an account stores your name and email so we can run your bookings. " +
  "We never sell your data, and we never show your contact details to buyers. " +
  "You choose separately whether to publish a public profile or hear from us about future shows — " +
  "and you can withdraw any of it, one purpose at a time, whenever you like.";

/** Who to complain to, per §5.3. A named contact, not a form into a void. */
export const GRIEVANCE_RESPONSE_DAYS = 30;

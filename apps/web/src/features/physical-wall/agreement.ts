/**
 * The exhibition agreement (F20).
 *
 * Generated from the booking's own facts, then hashed. Storing the body **and**
 * its SHA-256 means a later dispute is settled by recomputation rather than by
 * asking anyone to trust our database: if the stored text hashes to the stored
 * hash, that is what was signed.
 *
 * `TERMS_VERSION` changes whenever the wording changes in a way that alters the
 * bargain. Old agreements keep their own version and their own text, so an
 * artist is never held to terms published after they signed.
 *
 * Pure and isomorphic: the same function renders the preview in the browser and
 * produces the text that gets hashed on the server, which is the only way to
 * guarantee the artist signed what we stored.
 */

export const TERMS_VERSION = "2026-08-a";

export interface AgreementFacts {
  bookingId: string;
  artistName: string;
  venueName: string;
  slotLabels: string[];
  startDate: string;
  endDate: string;
  durationDays: number;
  totalPaise: number;
  gstRatePct: number;
  refundPercentage: number | null;
  refundPolicyVersion: number | null;
  gstin: string;
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  })}`;
}

/**
 * The agreement text, as plain paragraphs.
 *
 * Deliberately readable rather than lawyerly. An agreement an artist actually
 * reads is worth more than one that is airtight and skipped — and every clause
 * here restates a rule the system already enforces, so there is nothing in it
 * that the software does not do.
 */
export function agreementClauses(facts: AgreementFacts): {
  heading: string;
  body: string;
}[] {
  return [
    {
      heading: "1. What you are booking",
      body: `${facts.slotLabels.join(", ") || "—"} at ${facts.venueName}, for ${facts.durationDays} day${facts.durationDays === 1 ? "" : "s"} from ${facts.startDate} to ${facts.endDate}.`,
    },
    {
      heading: "2. What it costs",
      body: `${rupees(facts.totalPaise)}, inclusive of any add-ons and ${facts.gstRatePct}% GST, invoiced under GSTIN ${facts.gstin}. Nothing further is charged for the exhibition itself.`,
    },
    {
      heading: "3. Your copyright",
      body: "You keep every right in your work. By exhibiting you grant Artwall Labs a limited, non-exclusive licence to display the piece and to photograph it for marketing while this booking runs. That licence ends when the booking does. It is never an assignment, and we never claim authorship.",
    },
    {
      heading: "4. If it sells",
      body: "Should the work sell through ArtWall, our commission is 15% of the sale price. On any later resale that passes through ArtWall, 4% of the price returns to you as a royalty and 1% to the platform.",
    },
    {
      heading: "5. Condition and insurance",
      body: "Our staff photograph the work when it arrives and again when it comes down, and those photographs are the record if anything is disputed. Insuring the physical piece remains yours — we do not insure it for you, and we say so plainly rather than leaving you to discover it.",
    },
    {
      heading: "6. Cancelling",
      body:
        facts.refundPercentage === null
          ? "No refund policy is currently published. Do not sign this until one is — ask us first."
          : `${facts.refundPercentage}% of the fee is refunded if you cancel, whenever you cancel. One rule, applied the same way to everyone${facts.refundPolicyVersion !== null ? ` (policy version ${facts.refundPolicyVersion})` : ""}. This is the version in force for this booking and later changes to it do not apply to you.`,
    },
    {
      heading: "7. Signing",
      body: `Signed electronically by ${facts.artistName}. An electronic signature is valid under section 6 of the Information Technology Act, 2000. We store the exact text you agreed to along with a cryptographic hash of it, so what you signed can be proven later.`,
    },
  ];
}

/** The canonical text that gets hashed. Whitespace-stable, so the hash is too. */
export function agreementText(facts: AgreementFacts): string {
  const header = `ARTWALL LABS — EXHIBITION AGREEMENT\nTerms version: ${TERMS_VERSION}\nBooking: ${facts.bookingId}\nArtist: ${facts.artistName}`;

  const body = agreementClauses(facts)
    .map((clause) => `${clause.heading}\n${clause.body}`)
    .join("\n\n");

  return `${header}\n\n${body}\n`;
}

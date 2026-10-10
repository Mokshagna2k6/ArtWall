/**
 * Pre-installation checklist generation (F14).
 *
 * The checklist is *derived*, never hand-written: the slot's size and type plus
 * the add-ons on the booking decide which items appear. That is what stops it
 * degrading into a list nobody reads — a heavy piece gets the heavy-fixings
 * item, a spotlight add-on gets the spotlight item, and nothing else shows up.
 *
 * The generated list is stored on the check-in row, so an audit can see exactly
 * what a staff member was asked to confirm even after these rules change.
 *
 * Pure. The caller loads the booking facts and hands them in.
 */

export interface ChecklistItem {
  key: string;
  label: string;
  /** Why this item is on the list, shown to staff on hover/expand. */
  reason: string;
}

export interface ChecklistContext {
  sizeName: string;
  weightKg: number;
  typeLabel: string;
  addonLabels: string[];
}

/**
 * Items every install gets, whatever is hanging.
 *
 * The QR label check is here rather than optional: with NFC removed (C06) the
 * label is the *only* thing connecting the physical piece to its digital
 * record, and a spot-check for tampering is the stated mitigation for losing
 * NFC's crypto.
 */
const ALWAYS: ChecklistItem[] = [
  {
    key: "condition",
    label: "Photograph the work's condition on arrival",
    reason: "The record that settles any later damage dispute.",
  },
  {
    key: "hardware",
    label: "Correct hanging hardware fitted and secure",
    reason: "Every install.",
  },
  {
    key: "qr-label",
    label: "QR label applied, undamaged, and scans to the right artwork",
    reason:
      "The label is the only link between the physical piece and its page. Scan it yourself before you walk away.",
  },
  {
    key: "alignment",
    label: "Work sits level and within the slot's bounds",
    reason: "Every install.",
  },
];

const HEAVY_KG = 10;

export function generateChecklist(context: ChecklistContext): ChecklistItem[] {
  const items = [...ALWAYS];

  if (context.weightKg >= HEAVY_KG) {
    items.push({
      key: "heavy-fixings",
      label: `Two-person lift and rated fixings used (${context.weightKg}kg)`,
      reason: `The ${context.sizeName} class is rated to ${context.weightKg}kg.`,
    });
  }

  if (/featured|premium/i.test(context.typeLabel)) {
    items.push({
      key: "premium-finish",
      label: "Wall surface cleaned and the surround free of marks",
      reason: `${context.typeLabel} slots are the ones people photograph.`,
    });
  }

  if (/workshop/i.test(context.typeLabel)) {
    items.push({
      key: "workshop-clearance",
      label: "Floor clearance in front of the slot left unobstructed",
      reason: "Workshop slots gather a standing audience.",
    });
  }

  for (const label of context.addonLabels) {
    if (/spotlight|lighting/i.test(label)) {
      items.push({
        key: "spotlight",
        label: "Spotlight fitted, aimed, and switched through",
        reason: `Bought as an add-on: ${label}.`,
      });
    }
    if (/photograph/i.test(label)) {
      items.push({
        key: "photo-brief",
        label: "Photographer briefed and slot access booked",
        reason: `Bought as an add-on: ${label}.`,
      });
    }
  }

  return items;
}

/** Every item ticked? Activation is blocked until this is true (F14). */
export function isChecklistComplete(
  items: ChecklistItem[],
  completed: string[]
): boolean {
  if (items.length === 0) return false;
  const done = new Set(completed);
  return items.every((item) => done.has(item.key));
}

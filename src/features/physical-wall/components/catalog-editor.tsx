"use client";

import { useActionState } from "react";

import { IDLE } from "@/features/physical-wall/action-state";
import {
  setRefundPolicy,
  updateSettings,
  upsertAddon,
  upsertSize,
  upsertSlotType,
} from "@/features/physical-wall/actions/catalogs";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";
import { toRupees } from "@/features/physical-wall/money";
import type {
  Addon,
  RefundPolicy,
  SizeClass,
  SlotType,
  WallSettings,
} from "@/features/physical-wall/types";

/**
 * The pricing catalogs (C02, C03, C05).
 *
 * Every row is its own form. That looks repetitive and is deliberate: one big
 * form would mean a typo in a size class blocks an unrelated add-on price
 * change, and the founder is usually here to change exactly one number.
 *
 * Each save says out loud that existing bookings keep their price, because the
 * single most reasonable fear when editing a live price list is that you have
 * just re-priced something somebody already paid for.
 */
export function CatalogEditor({
  sizes,
  types,
  addons,
  policy,
  policyHistory,
  settings,
}: {
  sizes: SizeClass[];
  types: SlotType[];
  addons: Addon[];
  policy: RefundPolicy | null;
  policyHistory: RefundPolicy[];
  settings: WallSettings;
}) {
  return (
    <div className="flex flex-col gap-12">
      <SizesSection sizes={sizes} />
      <TypesSection types={types} />
      <AddonsSection addons={addons} />
      <RefundSection policy={policy} history={policyHistory} />
      <SettingsSection settings={settings} />
    </div>
  );
}

function SizesSection({ sizes }: { sizes: SizeClass[] }) {
  const [state, action] = useActionState(upsertSize, IDLE);

  return (
    <section>
      <h2 className="font-heading text-section">Size classes</h2>
      <p className="text-ink-muted mt-2 text-sm leading-6">
        Physical dimensions and the base price per day. Changing a price affects
        new quotes only.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {sizes.map((size) => (
          <form
            key={size.id}
            action={action}
            className="border-hairline grid items-end gap-3 rounded-md border p-4 sm:grid-cols-6"
          >
            <input type="hidden" name="id" value={size.id} />
            <input type="hidden" name="active" value="true" />
            <Field label="Name" htmlFor={`size-name-${size.id}`}>
              <input
                id={`size-name-${size.id}`}
                name="name"
                defaultValue={size.name}
                className={inputClass}
              />
            </Field>
            <Field label="W (cm)" htmlFor={`size-w-${size.id}`}>
              <input
                id={`size-w-${size.id}`}
                name="wCm"
                type="number"
                defaultValue={size.wCm}
                className={inputClass}
              />
            </Field>
            <Field label="H (cm)" htmlFor={`size-h-${size.id}`}>
              <input
                id={`size-h-${size.id}`}
                name="hCm"
                type="number"
                defaultValue={size.hCm}
                className={inputClass}
              />
            </Field>
            <Field label="Max kg" htmlFor={`size-kg-${size.id}`}>
              <input
                id={`size-kg-${size.id}`}
                name="weightKg"
                type="number"
                defaultValue={size.weightKg}
                className={inputClass}
              />
            </Field>
            <Field label="₹ / day" htmlFor={`size-price-${size.id}`}>
              <input
                id={`size-price-${size.id}`}
                name="basePrice"
                type="number"
                step="0.01"
                defaultValue={toRupees(size.basePricePaise)}
                className={inputClass}
              />
            </Field>
            <SubmitButton variant="quiet">Save</SubmitButton>
          </form>
        ))}
      </div>
      <FormStatus state={state} />
    </section>
  );
}

function TypesSection({ types }: { types: SlotType[] }) {
  const [state, action] = useActionState(upsertSlotType, IDLE);

  return (
    <section>
      <h2 className="font-heading text-section">Slot types</h2>
      <p className="text-ink-muted mt-2 text-sm leading-6">
        The multiplier applied to a slot&rsquo;s size price. Sponsored is 0×.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {types.map((type) => (
          <form
            key={type.id}
            action={action}
            className="border-hairline grid items-end gap-3 rounded-md border p-4 sm:grid-cols-4"
          >
            <input type="hidden" name="id" value={type.id} />
            <input type="hidden" name="active" value="true" />
            <input
              type="hidden"
              name="requiresGrant"
              value={String(type.requiresGrant)}
            />
            <Field label="Label" htmlFor={`type-label-${type.id}`}>
              <input
                id={`type-label-${type.id}`}
                name="label"
                defaultValue={type.label}
                className={inputClass}
              />
            </Field>
            <Field label="Multiplier" htmlFor={`type-mult-${type.id}`}>
              <input
                id={`type-mult-${type.id}`}
                name="multiplier"
                type="number"
                step="0.05"
                min="0"
                defaultValue={type.multiplierBp / 10000}
                className={inputClass}
              />
            </Field>
            <p className="text-ink-muted text-xs leading-5">
              {type.requiresGrant ? "Needs an admin grant" : "Bookable directly"}
            </p>
            <SubmitButton variant="quiet">Save</SubmitButton>
          </form>
        ))}
      </div>
      <FormStatus state={state} />
    </section>
  );
}

function AddonsSection({ addons }: { addons: Addon[] }) {
  const [state, action] = useActionState(upsertAddon, IDLE);

  return (
    <section>
      <h2 className="font-heading text-section">Add-ons</h2>
      <p className="text-ink-muted mt-2 text-sm leading-6">
        Flat line-items. Coffee add-ons are Artwall&rsquo;s own products,
        invoiced by us with GST — not Ric Platter&rsquo;s.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {addons.map((addon) => (
          <form
            key={addon.id}
            action={action}
            className="border-hairline grid items-end gap-3 rounded-md border p-4 sm:grid-cols-5"
          >
            <input type="hidden" name="id" value={addon.id} />
            <input type="hidden" name="active" value="true" />
            <Field label="Label" htmlFor={`addon-label-${addon.id}`}>
              <input
                id={`addon-label-${addon.id}`}
                name="label"
                defaultValue={addon.label}
                className={inputClass}
              />
            </Field>
            <Field label="₹" htmlFor={`addon-price-${addon.id}`}>
              <input
                id={`addon-price-${addon.id}`}
                name="price"
                type="number"
                step="0.01"
                defaultValue={toRupees(addon.pricePaise)}
                className={inputClass}
              />
            </Field>
            <Field label="For" htmlFor={`addon-applies-${addon.id}`}>
              <select
                id={`addon-applies-${addon.id}`}
                name="appliesTo"
                defaultValue={addon.appliesTo}
                className={inputClass}
              >
                <option value="artist">Artists</option>
                <option value="visitor">Visitors</option>
                <option value="both">Both</option>
              </select>
            </Field>
            <Field label="Category" htmlFor={`addon-cat-${addon.id}`}>
              <select
                id={`addon-cat-${addon.id}`}
                name="category"
                defaultValue={addon.category}
                className={inputClass}
              >
                <option value="general">General</option>
                <option value="coffee">Coffee</option>
              </select>
            </Field>
            <SubmitButton variant="quiet">Save</SubmitButton>
          </form>
        ))}
      </div>
      <FormStatus state={state} />
    </section>
  );
}

function RefundSection({
  policy,
  history,
}: {
  policy: RefundPolicy | null;
  history: RefundPolicy[];
}) {
  const [state, action] = useActionState(setRefundPolicy, IDLE);

  return (
    <section>
      <h2 className="font-heading text-section">Refund policy</h2>
      <p className="text-ink-muted mt-2 text-sm leading-6">
        One percentage, applied to every cancellation. Saving creates a new
        version — bookings already made keep the version they were made under,
        which is what their agreement promises.
      </p>

      <form
        action={action}
        className="border-hairline mt-6 grid max-w-2xl items-end gap-4 rounded-md border p-5 sm:grid-cols-3"
      >
        <Field label="Refund %" htmlFor="percentage">
          <input
            id="percentage"
            name="percentage"
            type="number"
            min={0}
            max={100}
            defaultValue={policy?.percentage ?? 50}
            className={inputClass}
          />
        </Field>
        <Field label="Why (optional)" htmlFor="policy-note">
          <input id="policy-note" name="note" maxLength={280} className={inputClass} />
        </Field>
        <SubmitButton>Set policy</SubmitButton>
        <div className="sm:col-span-3">
          <FormStatus state={state} />
        </div>
      </form>

      {history.length > 0 && (
        <ol className="text-ink-muted mt-4 flex flex-col gap-1 text-xs">
          {history.map((entry) => (
            <li key={entry.version}>
              v{entry.version} — {entry.percentage}%
              {entry.note ? ` · ${entry.note}` : ""}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SettingsSection({ settings }: { settings: WallSettings }) {
  const [state, action] = useActionState(updateSettings, IDLE);

  return (
    <section>
      <h2 className="font-heading text-section">Wall settings</h2>

      <form
        action={action}
        className="border-hairline mt-6 grid max-w-4xl gap-4 rounded-md border p-5 sm:grid-cols-3"
      >
        <Field
          label="Hold (minutes)"
          htmlFor="holdMinutes"
          hint="How long slots stay held while an artist pays."
        >
          <input
            id="holdMinutes"
            name="holdMinutes"
            type="number"
            min={5}
            defaultValue={settings.holdMinutes}
            className={inputClass}
          />
        </Field>
        <Field
          label="Buffer (days)"
          htmlFor="bufferDays"
          hint="Gap enforced between two bookings on one slot."
        >
          <input
            id="bufferDays"
            name="bufferDays"
            type="number"
            min={0}
            defaultValue={settings.bufferDays}
            className={inputClass}
          />
        </Field>
        <Field label="GST %" htmlFor="gstRate">
          <input
            id="gstRate"
            name="gstRate"
            type="number"
            step="0.01"
            defaultValue={settings.gstRateBp / 100}
            className={inputClass}
          />
        </Field>

        <Field
          label="Platter discount %"
          htmlFor="perkDiscount"
          hint="Taken off a food bill at the counter."
        >
          <input
            id="perkDiscount"
            name="perkDiscount"
            type="number"
            step="0.5"
            defaultValue={settings.perkDiscountBp / 100}
            className={inputClass}
          />
        </Field>
        <Field
          label="Who bears it"
          htmlFor="perkCostBearer"
          hint="Only our share becomes an expense in the ledger."
        >
          <select
            id="perkCostBearer"
            name="perkCostBearer"
            defaultValue={settings.perkCostBearer}
            className={inputClass}
          >
            <option value="artwall">Artwall</option>
            <option value="platter">Ric Platter</option>
            <option value="split">Split 50/50</option>
          </select>
        </Field>
        <div />

        <fieldset className="border-hairline sm:col-span-3 rounded-md border border-dashed p-4">
          <legend className="text-label text-ink-muted px-1 tracking-wider uppercase">
            Demand pricing
          </legend>
          <p className="text-ink-muted text-xs leading-5">
            In the prototype but <strong>not</strong> in the written spec. Off
            unless you decide otherwise.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="surgeEnabled"
                defaultChecked={settings.surgeEnabled}
                className="size-4"
              />
              Enabled
            </label>
            <Field label="Above % full" htmlFor="surgeThresholdPct">
              <input
                id="surgeThresholdPct"
                name="surgeThresholdPct"
                type="number"
                min={0}
                max={100}
                defaultValue={settings.surgeThresholdPct}
                className={inputClass}
              />
            </Field>
            <Field label="Multiplier" htmlFor="surgeMultiplier">
              <input
                id="surgeMultiplier"
                name="surgeMultiplier"
                type="number"
                step="0.05"
                min={1}
                defaultValue={settings.surgeMultiplierBp / 10000}
                className={inputClass}
              />
            </Field>
          </div>
        </fieldset>

        <div className="sm:col-span-3 flex flex-col gap-3">
          <SubmitButton>Save settings</SubmitButton>
          <FormStatus state={state} />
        </div>
      </form>
    </section>
  );
}

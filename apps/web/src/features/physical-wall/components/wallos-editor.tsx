"use client";

import { useActionState } from "react";
import Link from "next/link";

import {
  createWallosNodeForm,
  createWallosSlotForm,
  deleteWallosNodeForm,
  deleteWallosSlotForm,
  updateWallosNodeForm,
  updateWallosSlotForm,
} from "@/features/wallos/actions";
import { IDLE } from "@/features/physical-wall/action-state";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";

/**
 * FE-3.12: the drill-down editor behind /physical-wall/admin/wallos.
 *
 * Six container levels share one shape (an id and a name), so one
 * `NodeSection` renders all six instead of six near-identical components —
 * the mirror, in the UI, of `wallos/actions.ts`'s single generic CRUD core.
 * Only the leaf (slots) differs, because a slot is the one thing with a
 * second identity: the flat pw_slots row it may be linked to.
 */

type Node = { id: string; name: string };
type Slot = { id: string; wallId: string; label: string; pwSlotId: string | null };
type PwSlot = { id: string; label: string };

type LevelName = "organization" | "venue" | "building" | "floor" | "roomZone" | "wall";

export function WallosEditor({
  orgId,
  venueId,
  buildingId,
  floorId,
  zoneId,
  wallId,
  organizations,
  venues,
  buildings,
  floors,
  zones,
  walls,
  slots,
  unlinkedPwSlots,
}: {
  orgId?: string;
  venueId?: string;
  buildingId?: string;
  floorId?: string;
  zoneId?: string;
  wallId?: string;
  organizations: Node[];
  venues: Node[];
  buildings: Node[];
  floors: Node[];
  zones: Node[];
  walls: Node[];
  slots: Slot[];
  unlinkedPwSlots: PwSlot[];
}) {
  const selected = { org: orgId, venue: venueId, building: buildingId, floor: floorId, zone: zoneId, wall: wallId };

  // The breadcrumb trail of names, for "Org / Venue / Building" above the
  // active section — resolved from each level's own list, since that's the
  // list that was loaded with that id's row in it.
  const trail: { label: string; href: string }[] = [];
  const lists: Record<string, Node[]> = { org: organizations, venue: venues, building: buildings, floor: floors, zone: zones, wall: walls };
  const params: Record<string, string | undefined> = selected;
  let href = "/physical-wall/admin/wallos";
  for (const { param } of [{ param: "org" }, { param: "venue" }, { param: "building" }, { param: "floor" }, { param: "zone" }, { param: "wall" }]) {
    const id = params[param];
    if (!id) break;
    const row = lists[param]?.find((n) => n.id === id);
    href += `${href.includes("?") ? "&" : "?"}${param}=${id}`;
    trail.push({ label: row?.name ?? id, href });
  }

  return (
    <div className="flex flex-col gap-8">
      {trail.length > 0 && (
        <nav aria-label="Breadcrumb" className="text-ink-muted flex flex-wrap items-center gap-1.5 text-sm">
          <Link href="/physical-wall/admin/wallos" className="hover:text-ink hover:underline">
            All organizations
          </Link>
          {trail.map((crumb, i) => (
            <span key={crumb.href} className="flex items-center gap-1.5">
              <span aria-hidden>/</span>
              {i === trail.length - 1 ? (
                <span className="text-ink font-medium">{crumb.label}</span>
              ) : (
                <Link href={crumb.href} className="hover:text-ink hover:underline">
                  {crumb.label}
                </Link>
              )}
            </span>
          ))}
        </nav>
      )}

      <NodeSection
        level="organization"
        title="Organizations"
        nodes={organizations}
        childHrefBase="/physical-wall/admin/wallos"
        childParam="org"
      />

      {orgId && (
        <NodeSection
          level="venue"
          title="Venues"
          nodes={venues}
          parentId={orgId}
          childHrefBase={`/physical-wall/admin/wallos?org=${orgId}`}
          childParam="venue"
        />
      )}

      {venueId && (
        <NodeSection
          level="building"
          title="Buildings"
          nodes={buildings}
          parentId={venueId}
          childHrefBase={`/physical-wall/admin/wallos?org=${orgId}&venue=${venueId}`}
          childParam="building"
        />
      )}

      {buildingId && (
        <NodeSection
          level="floor"
          title="Floors"
          nodes={floors}
          parentId={buildingId}
          childHrefBase={`/physical-wall/admin/wallos?org=${orgId}&venue=${venueId}&building=${buildingId}`}
          childParam="floor"
        />
      )}

      {floorId && (
        <NodeSection
          level="roomZone"
          title="Rooms / Zones"
          nodes={zones}
          parentId={floorId}
          childHrefBase={`/physical-wall/admin/wallos?org=${orgId}&venue=${venueId}&building=${buildingId}&floor=${floorId}`}
          childParam="zone"
        />
      )}

      {zoneId && (
        <NodeSection
          level="wall"
          title="Walls"
          nodes={walls}
          parentId={zoneId}
          childHrefBase={`/physical-wall/admin/wallos?org=${orgId}&venue=${venueId}&building=${buildingId}&floor=${floorId}&zone=${zoneId}`}
          childParam="wall"
        />
      )}

      {wallId && (
        <SlotSection wallId={wallId} slots={slots} unlinkedPwSlots={unlinkedPwSlots} />
      )}
    </div>
  );
}

/**
 * One container level: a create form, and a row per existing node with an
 * inline rename and a delete — "drill in" is a link, since picking a row is
 * navigation (it changes the URL), not a mutation.
 */
function NodeSection({
  level,
  title,
  nodes,
  parentId,
  childHrefBase,
  childParam,
}: {
  level: LevelName;
  title: string;
  nodes: Node[];
  parentId?: string;
  childHrefBase: string;
  childParam: string;
}) {
  const [createState, createAction] = useActionState(createWallosNodeForm, IDLE);
  const [updateState, updateAction] = useActionState(updateWallosNodeForm, IDLE);
  const [deleteState, deleteAction] = useActionState(deleteWallosNodeForm, IDLE);

  return (
    <section className="border-hairline rounded-md border p-5">
      <h2 className="font-heading text-card">{title}</h2>

      <ul className="mt-4 flex flex-col gap-2">
        {nodes.map((node) => (
          <li key={node.id} className="border-hairline flex flex-wrap items-center gap-3 rounded-md border p-3">
            <form action={updateAction} className="flex flex-1 items-center gap-2">
              <input type="hidden" name="level" value={level} />
              <input type="hidden" name="id" value={node.id} />
              <input name="name" defaultValue={node.name} className={`${inputClass} h-9`} />
              <SubmitButton variant="quiet">Save</SubmitButton>
            </form>
            <Link
              href={`${childHrefBase}${childHrefBase.includes("?") ? "&" : "?"}${childParam}=${node.id}`}
              className="text-small text-ink-muted hover:text-ink underline underline-offset-4"
            >
              Open &rarr;
            </Link>
            <form action={deleteAction}>
              <input type="hidden" name="level" value={level} />
              <input type="hidden" name="id" value={node.id} />
              <SubmitButton variant="danger">Delete</SubmitButton>
            </form>
          </li>
        ))}
        {nodes.length === 0 && (
          <li className="text-ink-muted text-sm">Nothing here yet.</li>
        )}
      </ul>
      <FormStatus state={updateState} />
      <FormStatus state={deleteState} />

      <form action={createAction} className="border-hairline mt-4 flex flex-wrap items-end gap-3 border-t pt-4">
        <input type="hidden" name="level" value={level} />
        {parentId && <input type="hidden" name="parentId" value={parentId} />}
        <Field label="New name" htmlFor={`${level}-new-name`}>
          <input id={`${level}-new-name`} name="name" required className={inputClass} />
        </Field>
        <SubmitButton>Create</SubmitButton>
      </form>
      <FormStatus state={createState} />
    </section>
  );
}

/** The leaf: slots under the selected wall, each optionally linked to a real pw_slots row. */
function SlotSection({
  wallId,
  slots,
  unlinkedPwSlots,
}: {
  wallId: string;
  slots: Slot[];
  unlinkedPwSlots: PwSlot[];
}) {
  const [createState, createAction] = useActionState(createWallosSlotForm, IDLE);
  const [updateState, updateAction] = useActionState(updateWallosSlotForm, IDLE);
  const [deleteState, deleteAction] = useActionState(deleteWallosSlotForm, IDLE);

  return (
    <section className="border-hairline rounded-md border p-5">
      <h2 className="font-heading text-card">Slots</h2>
      <p className="text-ink-muted mt-2 text-sm leading-6">
        A slot only shows up in the booking flow&rsquo;s hierarchy picker once
        it&rsquo;s linked to a real slot on the wall map. Unlinked slots here
        are a hierarchy placeholder only.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {slots.map((slot) => (
          <li key={slot.id} className="border-hairline flex flex-wrap items-center gap-3 rounded-md border p-3">
            <form action={updateAction} className="flex flex-1 items-center gap-2">
              <input type="hidden" name="id" value={slot.id} />
              <input name="label" defaultValue={slot.label} className={`${inputClass} h-9`} />
              <SubmitButton variant="quiet">Save</SubmitButton>
            </form>
            <span className="text-ink-muted text-xs">
              {slot.pwSlotId ? `Linked to grid slot ${slot.pwSlotId}` : "Not linked to the grid"}
            </span>
            <form action={deleteAction}>
              <input type="hidden" name="id" value={slot.id} />
              <SubmitButton variant="danger">Delete</SubmitButton>
            </form>
          </li>
        ))}
        {slots.length === 0 && (
          <li className="text-ink-muted text-sm">No slots under this wall yet.</li>
        )}
      </ul>
      <FormStatus state={updateState} />
      <FormStatus state={deleteState} />

      <form action={createAction} className="border-hairline mt-4 flex flex-wrap items-end gap-3 border-t pt-4">
        <input type="hidden" name="wallId" value={wallId} />
        <Field label="New slot label" htmlFor="slot-new-label">
          <input id="slot-new-label" name="label" required className={inputClass} />
        </Field>
        <Field label="Link to grid slot (optional)" htmlFor="slot-pw-id">
          <select id="slot-pw-id" name="pwSlotId" defaultValue="" className={inputClass}>
            <option value="">Not linked</option>
            {unlinkedPwSlots.map((pwSlot) => (
              <option key={pwSlot.id} value={pwSlot.id}>
                {pwSlot.label} ({pwSlot.id})
              </option>
            ))}
          </select>
        </Field>
        <SubmitButton>Create</SubmitButton>
      </form>
      <FormStatus state={createState} />
      {unlinkedPwSlots.length === 0 && (
        <p className="text-ink-muted mt-2 text-xs leading-5">
          Every grid slot is already linked to a hierarchy slot.
        </p>
      )}
    </section>
  );
}

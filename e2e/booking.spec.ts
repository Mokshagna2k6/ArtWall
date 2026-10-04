import { randomBytes } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { closeDb, releaseE2eUser, q } from "./db";

/**
 * FE-2.04: the whole booking journey against the real app and real Razorpay
 * Checkout in TEST mode — sign up, onboard, pick a slot, agree, hold, pay,
 * see the booking paid. Also asserts FE-2.02: a double-click on Pay opens one
 * order, not two.
 */

const email = `e2e_${randomBytes(5).toString("hex")}@artwall.test`;
const password = `e2e-${randomBytes(9).toString("base64url")}`;

test.afterAll(async () => {
  await releaseE2eUser(email);
  await closeDb();
});

async function signUp(page: Page) {
  const res = await page.request.post("/api/auth/sign-up/email", {
    data: { email, password, name: "E2E Artist" },
    headers: { origin: new URL(page.url() === "about:blank" ? test.info().project.use.baseURL! : page.url()).origin },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function onboard(page: Page) {
  await expect(page).toHaveURL(/\/physical-wall\/welcome/);
  await page.getByRole("button", { name: /18 or over/ }).click();
  await page.locator('input[name="account"]').check();
  await page.getByRole("button", { name: /Finish and see the wall/ }).click();
}

test("book a slot, agree, pay in Razorpay test mode, see it paid", async ({ page }) => {
  await signUp(page);

  await page.goto("/physical-wall/book");
  await onboard(page);
  await page.goto("/physical-wall/book");

  // Step 1: first open slot.
  const grid = page.getByRole("grid", { name: "The physical wall" });
  await grid.locator('button[aria-pressed="false"]:not([aria-label*="not available"])').first().click();
  const next = page.getByRole("button", { name: "Continue" });
  await next.click(); // -> dates
  // Focus follows the step change (FE-2.18).
  await expect(page.getByRole("heading", { name: "How long for?" })).toBeFocused();
  await next.click(); // -> artwork
  await next.click(); // -> add-ons
  await next.click(); // -> agreement
  const sign = page.getByRole("button", { name: /Sign and hold/ });
  await expect(sign).toBeDisabled();
  await page.getByLabel(/I have read the agreement/).check();
  await sign.click();
  await expect(page.getByText(/I.m exhibiting on The Wall/)).toBeVisible();

  await page.getByRole("link", { name: /Pay and pick an install slot/ }).click();
  await expect(page).toHaveURL(/\/physical-wall\/bookings/);

  const [user] = await q<{ id: string }>(`select id from "user" where email = $1`, [email]);
  const [booking] = await q<{ id: string }>(
    `select id from pw_bookings where artist_id = $1 and status = 'held'`,
    [user.id]
  );
  expect(booking).toBeTruthy();

  // FE-2.02: double-click. One order, and the button locks while in flight.
  const pay = page.getByTestId("pay-button");
  await pay.dblclick();
  await expect(pay).toBeDisabled();

  const checkout = page.frameLocator("iframe.razorpay-checkout-frame");
  await payInTestMode(page, checkout);

  // Paid only once the server says so; the card's status pill re-renders from
  // the server after verifyPayment (no webhook needed, so no tunnel).
  await expect(page.getByText("paid", { exact: true })).toBeVisible({ timeout: 90_000 });

  const orders = await q<{ order_id: string }>(
    `select distinct order_id from pw_payments where booking_id = $1 and order_id is not null`,
    [booking.id]
  );
  expect(orders).toHaveLength(1);
  const [row] = await q<{ status: string }>(`select status from pw_bookings where id = $1`, [booking.id]);
  expect(row.status).toBe("paid");
});

/**
 * Razorpay's own Checkout widget re-shows the "Contact details" dialog at
 * more than one point in this flow (at least once before the payment
 * method list, and it can reappear after picking netbanking) — this isn't
 * app code we control, and no `prefill.contact` reaches it today (the app
 * only prefills name/email; see razorpay-pay-button.tsx), so a real payer
 * hits this same dialog. Rather than assume it only ever shows once, treat
 * it as something that can appear before any step and clear it every time.
 */
async function clearContactDialogIfShown(checkout: ReturnType<Page["frameLocator"]>) {
  const contact = checkout.locator('input[name="contact"]');
  if (!(await contact.isVisible({ timeout: 3_000 }).catch(() => false))) return;

  // A plain .fill() can land before the widget's own handlers are attached,
  // so the value never sticks and Continue re-shows the same empty dialog.
  // Click first to focus/hydrate it, type character-by-character, and
  // confirm the value stuck before submitting.
  await contact.click();
  await contact.pressSequentially("9999999999", { delay: 20 });
  await expect(contact).toHaveValue("9999999999");
  await checkout.getByRole("button", { name: /continue|proceed/i }).first().click();
  // The dialog's own backdrop (#overlay-backdrop) stays in the DOM above
  // the payment list until the close transition finishes. Wait for both
  // the input and its backdrop to actually leave the DOM before the caller
  // tries to click anything the dialog was covering.
  const contactGone = await contact
    .waitFor({ state: "detached", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  const backdropGone = await checkout
    .locator("#overlay-backdrop")
    .waitFor({ state: "detached", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!contactGone || !backdropGone) {
    console.log(
      `[e2e] contact dialog did not fully detach: contactGone=${contactGone} backdropGone=${backdropGone}`
    );
  }
}

/**
 * Click something in the checkout iframe, tolerating the contact dialog
 * popping back in front of it right as the click lands (observed: it can
 * reappear after `clearContactDialogIfShown` has already reported it gone,
 * so a one-shot clear-then-click isn't enough — retry the whole
 * clear-and-click cycle a few times).
 */
async function clickThroughContactDialog(
  checkout: ReturnType<Page["frameLocator"]>,
  locator: ReturnType<ReturnType<Page["frameLocator"]>["getByText"]>
) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await clearContactDialogIfShown(checkout);
    try {
      await locator.click({ timeout: 5_000 });
      return;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
}

async function payInTestMode(page: Page, checkout: ReturnType<Page["frameLocator"]>) {
  await checkout.locator("body").waitFor();
  await clearContactDialogIfShown(checkout);

  await clickThroughContactDialog(checkout, checkout.getByText(/netbanking/i).first());
  await clickThroughContactDialog(checkout, checkout.getByText(/SBI|State Bank/i).first());

  const popup = page.waitForEvent("popup");
  await clickThroughContactDialog(checkout, checkout.getByRole("button", { name: /^pay/i }).first());
  const bank = await popup;
  await bank.getByRole("button", { name: /success/i }).click();
}

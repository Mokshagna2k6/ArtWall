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
  // `.isVisible()` is a point-in-time check — unlike `expect(...).toBeVisible()`
  // or `.waitFor()`, passing it a `timeout` does not make it poll for the
  // element to *become* visible; it just looks once and returns false
  // immediately if the dialog hasn't finished animating in yet. That false
  // negative was the actual bug here: the dialog was genuinely on screen
  // (confirmed by screenshot) but this check said "not shown" and let the
  // caller click straight into it, where it then blocked every click for
  // the rest of the test. `.waitFor({state:"visible"})` genuinely polls.
  const shown = await contact
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return;

  // A plain .fill() can land before the widget's own handlers are attached,
  // so the value never sticks and Continue re-shows the same empty dialog.
  // `.fill("")` to clear has the same problem in reverse: it sets the DOM
  // value directly without the input events Razorpay's controlled component
  // listens for, so its internal state can still think the field holds
  // whatever it had before — the visible value looks right but the widget's
  // own validation (which reads its state, not the DOM) keeps failing.
  // Select-all and type over it via real keyboard events instead, so every
  // mutation the widget sees comes through its normal input handler.
  await contact.click();
  await contact.press("ControlOrMeta+a");
  await contact.press("Backspace");
  await contact.pressSequentially("9123456780", { delay: 20 });
  await expect(contact).toHaveValue("9123456780");
  // The widget's own validation message can lag a beat behind the last
  // keystroke (debounced revalidation) — clicking Continue immediately can
  // land while it's still showing the error from before this field was
  // filled. Give it a moment to clear before relying on Continue to dismiss
  // the dialog; if the error is still showing, fall through and let the
  // caller's retry loop give it another pass rather than waiting forever
  // here.
  await checkout
    .getByText(/please enter a valid/i)
    .waitFor({ state: "hidden", timeout: 2_000 })
    .catch(() => {});
  // A valid number can make the widget auto-advance on its own before this
  // click lands, detaching the button mid-click and hanging the action for
  // its full timeout. The click is just a nudge for when it doesn't
  // auto-advance — either way the waits below confirm the dialog is gone.
  await checkout
    .getByRole("button", { name: /continue|proceed/i })
    .first()
    .click({ timeout: 5_000 })
    .catch(() => {});
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

  // HDFC, not SBI: Razorpay's own test-mode sandbox has shown SBI as
  // intermittently unavailable ("currently facing issues"), which is a
  // property of their mock bank list, not this app -- HDFC has been stable.
  // Selecting a netbanking option can submit straight away (it shows its own
  // "Processing your payment" transition and opens the bank popup directly)
  // instead of waiting for a separate Pay button click -- arm the popup
  // listener before picking the bank so either path is caught.
  await clickThroughContactDialog(checkout, checkout.getByText(/netbanking/i).first());
  const popup = page.waitForEvent("popup", { timeout: 20_000 }).catch(() => null);
  await clickThroughContactDialog(checkout, checkout.getByText(/HDFC/i).first());

  let bank = await popup;
  if (!bank) {
    // Didn't auto-submit: a separate Pay button needs a click. `/^pay/i`
    // alone also matches the unrelated "Pay Later" option
    // (data-testid="paylater"), which can sit earlier in the DOM than the
    // real submit button and win `.first()` -- exclude it explicitly.
    await clearContactDialogIfShown(checkout);
    const payButton = checkout
      .getByRole("button", { name: /^pay/i })
      .filter({ hasNotText: /later/i })
      .first();
    await payButton.waitFor({ state: "visible", timeout: 10_000 });
    const popup2 = page.waitForEvent("popup");
    await payButton.click();
    bank = await popup2;
  }
  await bank.getByRole("button", { name: /success/i }).click();
}

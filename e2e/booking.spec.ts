import { randomBytes } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { closeDb, purgeE2eUser, q } from "./db";

/**
 * FE-2.04: the whole booking journey against the real app and real Razorpay
 * Checkout in TEST mode — sign up, onboard, pick a slot, agree, hold, pay,
 * see the booking paid. Also asserts FE-2.02: a double-click on Pay opens one
 * order, not two.
 */

const email = `e2e_${randomBytes(5).toString("hex")}@artwall.test`;
const password = `e2e-${randomBytes(9).toString("base64url")}`;

test.afterAll(async () => {
  await purgeE2eUser(email);
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
  await next.click(); // → dates
  // Focus follows the step change (FE-2.18).
  await expect(page.getByRole("heading", { name: "How long for?" })).toBeFocused();
  await next.click(); // → artwork
  await next.click(); // → add-ons
  await next.click(); // → agreement
  await expect(next).toBeDisabled();
  await page.getByLabel(/I have read the agreement/).check();
  await page.getByRole("button", { name: /Sign and hold/ }).click();
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
  await payWithTestCard(page, checkout);

  // Paid only once the server says so; the card re-renders from the server.
  await expect(page.getByTestId("pay-status").or(page.getByText("paid", { exact: true })).first()).toBeVisible();
  await expect(page.getByText("paid", { exact: true })).toBeVisible({ timeout: 90_000 });

  const orders = await q<{ order_id: string }>(
    `select distinct order_id from pw_payments where booking_id = $1 and order_id is not null`,
    [booking.id]
  );
  expect(orders).toHaveLength(1);
  const [row] = await q<{ status: string }>(`select status from pw_bookings where id = $1`, [booking.id]);
  expect(row.status).toBe("paid");
});

async function payWithTestCard(page: Page, checkout: ReturnType<Page["frameLocator"]>) {
  await page.screenshot({ path: ".scratch/e2e-checkout-0.png" });
  await checkout.locator("body").waitFor();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: ".scratch/e2e-checkout-1.png" });
  throw new Error("explore");
}

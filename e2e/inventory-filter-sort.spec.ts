import { test, expect } from "@playwright/test";

const TEST_EMAIL    = process.env.E2E_TEST_EMAIL    ?? "testuser@vaultset.test";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "testpassword123!";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(TEST_EMAIL);
  await page.locator('input[autocomplete="current-password"]').fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
});

async function addCard(page: any, name: string) {
  await page.goto("/inventory/add");
  await page.getByPlaceholder("Charizard").fill(name);
  await page.getByRole("button", { name: "Near Mint", exact: true }).click();
  await page.getByRole("button", { name: "Add to Vault" }).click();
  await expect(page).toHaveURL(/\/inventory$/, { timeout: 20000 });
}

test.describe("Inventory Filter and Sort", () => {

  test("search filters cards by name", async ({ page }) => {
    const ts    = Date.now();
    const nameA = `Alpha Search ${ts}`;
    const nameB = `Omega Search ${ts}`;

    await addCard(page, nameA);
    await addCard(page, nameB);

    await page.getByPlaceholder("Search by card name…").fill("Alpha Search");

    await expect(page.getByText(nameA)).toBeVisible();
    await expect(page.getByText(nameB)).not.toBeVisible();
  });

  test("clearing search restores all cards", async ({ page }) => {
    const ts    = Date.now();
    const nameA = `Alpha Clear ${ts}`;
    const nameB = `Omega Clear ${ts}`;

    await addCard(page, nameA);
    await addCard(page, nameB);

    const searchInput = page.getByPlaceholder("Search by card name…");
    await searchInput.fill("Alpha Clear");
    await expect(page.getByText(nameB)).not.toBeVisible();

    await searchInput.clear();

    await expect(page.getByText(nameA)).toBeVisible();
    await expect(page.getByText(nameB)).toBeVisible();
  });

  test("Name A–Z sort orders cards alphabetically ascending", async ({ page }) => {
    const ts    = Date.now();
    const nameA = `AAA Sort ${ts}`;
    const nameB = `ZZZ Sort ${ts}`;

    // Add ZZZ first so it appears first under default (newest) sort
    await addCard(page, nameB);
    await addCard(page, nameA);

    // Narrow the grid to just these two cards
    await page.getByPlaceholder("Search by card name…").fill(`Sort ${ts}`);

    await page.selectOption("select", "name_asc");

    const cards = page.locator("div.grid .group");
    await expect(cards.first()).toContainText(nameA);
    await expect(cards.nth(1)).toContainText(nameB);
  });

  test("Name Z–A sort orders cards alphabetically descending", async ({ page }) => {
    const ts    = Date.now();
    const nameA = `AAA Sort ${ts}`;
    const nameB = `ZZZ Sort ${ts}`;

    await addCard(page, nameA);
    await addCard(page, nameB);

    await page.getByPlaceholder("Search by card name…").fill(`Sort ${ts}`);

    await page.selectOption("select", "name_desc");

    const cards = page.locator("div.grid .group");
    await expect(cards.first()).toContainText(nameB);
    await expect(cards.nth(1)).toContainText(nameA);
  });

  test("search with no matches shows empty state", async ({ page }) => {
    await page.goto("/inventory");
    await page.getByPlaceholder("Search by card name…").fill("xyznotarealcard99999");

    await expect(page.getByText(/No cards found for/)).toBeVisible();
  });

  test("active filter with no matching cards shows empty state", async ({ page }) => {
    // Add an ungraded card so the grid is non-empty, then apply the Graded filter
    await addCard(page, `Ungraded Card ${Date.now()}`);

    await page.getByRole("button", { name: "Graded", exact: true }).click();

    await expect(page.getByText("No cards match this filter.")).toBeVisible();
  });

});

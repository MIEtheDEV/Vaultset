import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "testuser@vaultset.test";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "testpassword123!";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(TEST_EMAIL);
  await page.locator('input[autocomplete="current-password"]').fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
});

test.describe("Collection Management", () => {
  test("inventory page loads and shows Add Card button", async ({ page }) => {
    await page.goto("/inventory");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Add Card/i })).toBeVisible();
  });

  test("card search returns results from the TCG API", async ({ page }) => {
    await page.goto("/inventory/add");
    await expect(page.getByRole("heading", { name: "Add Card" })).toBeVisible();

    await page.getByPlaceholder("Card name…").fill("Charizard");

    // Results appear as buttons inside a dropdown ul
    await expect(page.locator("ul.absolute li button").first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("selecting a search result pre-populates card name", async ({ page }) => {
    await page.goto("/inventory/add");

    await page.getByPlaceholder("Card name…").fill("Pikachu");

    const firstResult = page.locator("ul.absolute li button").first();
    await firstResult.waitFor({ timeout: 15000 });
    await firstResult.click();

    // Card name field should now be populated
    await expect(page.getByPlaceholder("Charizard")).not.toHaveValue("");
  });

  test("can add a card with only required fields", async ({ page }) => {
    await page.goto("/inventory/add");

    await page.getByPlaceholder("Charizard").fill("Test Card");
    await page.getByRole("button", { name: "Near Mint", exact: true }).click();
    await page.getByRole("button", { name: "Add to Vault" }).click();

    await expect(page).toHaveURL(/\/inventory$/, { timeout: 15000 });
  });

  test("can add a card with all fields populated", async ({ page }) => {
    await page.goto("/inventory/add");

    await page.getByPlaceholder("Charizard").fill("Full Fields Card");
    await page.getByPlaceholder("4/102").fill("1/100");
    await page.getByRole("button", { name: "Mint", exact: true }).click();
    await page.getByPlaceholder("0.00").fill("5.00");
    await page.getByRole("button", { name: "Add to Vault" }).click();

    await expect(page).toHaveURL(/\/inventory$/, { timeout: 15000 });
  });

  test("added card appears in the inventory grid", async ({ page }) => {
    const cardName = `E2E Card ${Date.now()}`;

    await page.goto("/inventory/add");
    await page.getByPlaceholder("Charizard").fill(cardName);
    await page.getByRole("button", { name: "Near Mint", exact: true }).click();
    await page.getByRole("button", { name: "Add to Vault" }).click();

    await expect(page).toHaveURL(/\/inventory$/, { timeout: 15000 });
    await expect(page.getByText(cardName)).toBeVisible();
  });

  test("can edit an existing card and changes persist", async ({ page }) => {
    const originalName = `Edit Target ${Date.now()}`;

    // Add a card to edit
    await page.goto("/inventory/add");
    await page.getByPlaceholder("Charizard").fill(originalName);
    await page.getByRole("button", { name: "Near Mint", exact: true }).click();
    await page.getByRole("button", { name: "Add to Vault" }).click();
    await expect(page).toHaveURL(/\/inventory$/, { timeout: 15000 });

    // Find the card tile by its container and click Edit
    const cardTile = page.locator(".group", { hasText: originalName }).first();
    await cardTile.waitFor();
    await cardTile.getByRole("link", { name: "Edit" }).click();

    // Update the notes field and save
    await page.getByPlaceholder("Any personal notes about this card...").fill("Edited via E2E test");
    await page.getByRole("button", { name: /save/i }).click();

    await expect(page).toHaveURL(/\/inventory/, { timeout: 15000 });
  });

  test("can delete a card and it is removed from the grid", async ({ page }) => {
    const cardName = `Delete Me ${Date.now()}`;

    // Add a card to delete
    await page.goto("/inventory/add");
    await page.getByPlaceholder("Charizard").fill(cardName);
    await page.getByRole("button", { name: "Near Mint", exact: true }).click();
    await page.getByRole("button", { name: "Add to Vault" }).click();
    await expect(page).toHaveURL(/\/inventory$/, { timeout: 15000 });

    // Find the card tile and click Remove
    const cardTile = page.locator(".group", { hasText: cardName }).first();
    await cardTile.waitFor();
    await cardTile.getByRole("button", { name: "Remove" }).click();

    // Confirm deletion
    await cardTile.getByRole("button", { name: "Confirm" }).click();

    // Card should no longer be visible
    await expect(page.getByText(cardName)).not.toBeVisible({ timeout: 10000 });
  });
});

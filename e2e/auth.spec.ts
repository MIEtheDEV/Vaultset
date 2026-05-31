import { test, expect } from "@playwright/test";

// Credentials for a pre-existing test account.
// Set these in .env.local: E2E_TEST_EMAIL / E2E_TEST_PASSWORD
const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "testuser@vaultset.test";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "testpassword123!";

test.describe("Authentication", () => {
  test("registration page renders correctly", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.getByPlaceholder("collector99")).toBeVisible();
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(page.getByPlaceholder("Min. 8 characters")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();
  });

  test("registration rejects duplicate email", async ({ page }) => {
    await page.goto("/register");
    // Use the known test account email to trigger the duplicate check
    await page.getByPlaceholder("collector99").fill("uniqueuser123");
    await page.getByPlaceholder("you@example.com").fill(TEST_EMAIL);
    await page.getByPlaceholder("Min. 8 characters").fill(TEST_PASSWORD);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create Account" }).click();
    // Should show an error — either duplicate email or username taken
    await expect(page.locator("p.text-red-400")).toBeVisible({ timeout: 10000 });
  });

  test("registration rejects duplicate username", async ({ page }) => {
    await page.goto("/register");
    await page.getByPlaceholder("collector99").fill("Tester99");
    await page.getByPlaceholder("you@example.com").fill(`new.${Date.now()}@vaultset.test`);
    await page.getByPlaceholder("Min. 8 characters").fill("Password123!");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByText("This username is already taken.")).toBeVisible({ timeout: 10000 });
  });

  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByPlaceholder("you@example.com or collector99")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("login rejects incorrect credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("you@example.com or collector99").fill("wrong@example.com");
    await page.locator('input[autocomplete="current-password"]').fill("wrongpassword");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.locator("p.text-red-400")).toBeVisible({ timeout: 10000 });
  });

  test("login succeeds with correct credentials and redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("you@example.com or collector99").fill(TEST_EMAIL);
    await page.locator('input[autocomplete="current-password"]').fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });

  test("session persists across page refresh", async ({ page }) => {
    // Log in
    await page.goto("/login");
    await page.getByPlaceholder("you@example.com or collector99").fill(TEST_EMAIL);
    await page.locator('input[autocomplete="current-password"]').fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

    // Refresh and confirm still authenticated
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/good (morning|afternoon|evening)/i)).toBeVisible();
  });

  test("unauthenticated user is redirected to login from protected routes", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

export default async function globalTeardown() {
  const url       = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key       = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const testEmail = process.env.E2E_TEST_EMAIL;

  if (!url || !key || !testEmail) {
    console.warn("[e2e teardown] Missing env vars — skipping cleanup.");
    return;
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error("[e2e teardown] Could not list users:", listError.message);
    return;
  }

  const testUser = users.find((u) => u.email === testEmail);
  if (!testUser) {
    console.warn(`[e2e teardown] Test user not found: ${testEmail}`);
    return;
  }

  const { error, count } = await supabase
    .from("collection_items")
    .delete({ count: "exact" })
    .eq("user_id", testUser.id);

  if (error) {
    console.error("[e2e teardown] Cleanup failed:", error.message);
  } else {
    console.log(`[e2e teardown] Removed ${count} test card(s) for ${testEmail}`);
  }
}

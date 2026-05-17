import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { AccountSettingsForm } from "@/components/AccountSettingsForm";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const username = (user.user_metadata?.username as string) ?? "";
  const email    = user.email ?? "";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
        <p className="mt-1 text-sm text-foreground-muted">Manage your profile, password, and account.</p>
      </div>
      <AccountSettingsForm initialUsername={username} initialEmail={email} />
    </div>
  );
}

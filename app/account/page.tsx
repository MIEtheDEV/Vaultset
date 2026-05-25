import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { AccountSettingsForm } from "@/components/AccountSettingsForm";
import { SupporterBadge } from "@/components/SupporterBadge";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const username = (user.user_metadata?.username as string) ?? "";
  const email    = user.email ?? "";

  const { data: profile } = await supabase.from("profiles").select("is_supporter").eq("id", user.id).single();
  const isSupporter = profile?.is_supporter ?? false;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
          {isSupporter && <SupporterBadge />}
        </div>
        <p className="mt-1 text-sm text-foreground-muted">Manage your profile, password, and account.</p>
        {!isSupporter && (
          <Link href="/support" className="mt-1 inline-block text-xs text-foreground-muted hover:text-gold transition-colors">
            Help keep Vaultset free →
          </Link>
        )}
      </div>
      <AccountSettingsForm initialUsername={username} initialEmail={email} />
    </div>
  );
}

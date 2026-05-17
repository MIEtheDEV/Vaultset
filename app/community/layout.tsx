import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { AppNav } from "@/components/AppNav";

export default async function CommunityLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const username = user.user_metadata?.username as string;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <AppNav username={username} />
      <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
    </div>
  );
}

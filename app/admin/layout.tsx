import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { AppNav } from "@/components/AppNav";
import { AdminNav } from "@/components/AdminNav";
import { isUserAdmin } from "@/lib/auth/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const username = user.user_metadata?.username as string;
  if (!(await isUserAdmin(user.id))) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <AppNav username={username} />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin</h1>
          <p className="mt-1 text-sm text-foreground-muted">Platform management</p>
        </div>
        <AdminNav />
        {children}
      </main>
    </div>
  );
}

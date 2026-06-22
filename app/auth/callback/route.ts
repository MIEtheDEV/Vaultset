import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

// Only allow same-origin relative redirects. Reject absolute URLs, scheme-
// relative ("//evil.com") and backslash variants that browsers may treat as
// an external host, falling back to the dashboard.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/dashboard";
  }
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // OAuth users may not have a username yet — send them to profile setup
      const { data: { user } } = await supabase.auth.getUser();
      const hasUsername = !!user?.user_metadata?.username;
      if (!hasUsername) {
        return NextResponse.redirect(`${origin}/auth/setup?next=${encodeURIComponent(next)}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}

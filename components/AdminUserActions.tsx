"use client";

import { useTransition } from "react";
import { banUser, unbanUser, deleteUser } from "@/app/admin/users/actions";

export function AdminUserActions({
  userId,
  banned,
  username,
}: {
  userId: string;
  banned: boolean;
  username: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <button
        disabled={pending}
        onClick={() => startTransition(() => (banned ? unbanUser(userId) : banUser(userId)))}
        className={`flex-1 rounded-lg py-1.5 text-xs font-medium border transition-colors disabled:opacity-50 ${
          banned
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
            : "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
        }`}
      >
        {banned ? "Unban" : "Ban"}
      </button>
      <button
        disabled={pending}
        onClick={() => {
          if (confirm(`Delete account for @${username}? This cannot be undone.`)) {
            startTransition(() => deleteUser(userId));
          }
        }}
        className="flex-1 rounded-lg py-1.5 text-xs font-medium border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
      >
        Delete
      </button>
    </div>
  );
}

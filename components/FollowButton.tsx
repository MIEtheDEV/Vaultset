"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { followUser, unfollowUser } from "@/app/profile/actions";

export function FollowButton({
  profileId,
  initialIsFollowing,
  followsYouBack = false,
}: {
  profileId: string;
  initialIsFollowing: boolean;
  followsYouBack?: boolean;
}) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    const next = !isFollowing;
    setIsFollowing(next);
    startTransition(async () => {
      try {
        if (next) await followUser(profileId);
        else await unfollowUser(profileId);
        router.refresh();
      } catch {
        setIsFollowing(!next);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        onClick={handleClick}
        disabled={isPending}
        className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
          isFollowing
            ? "border-gold/40 bg-gold/10 text-gold hover:bg-gold/5 hover:border-gold/20"
            : "border-border text-foreground-muted hover:border-gold/40 hover:text-foreground"
        }`}
      >
        {isFollowing ? "Following" : "Follow"}
      </button>
      {followsYouBack && (
        <span className="text-[10px] text-foreground-muted leading-none">Follows you</span>
      )}
    </div>
  );
}

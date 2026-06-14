"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";
import { FeaturedCardPicker, type PickerItem } from "@/components/FeaturedCardPicker";
import { AvatarUpload } from "@/components/AvatarUpload";
import { AvatarColorPicker } from "@/components/AvatarColorPicker";
import { checkText } from "@/lib/moderation";
import { resolveAvatarColor, isHexColor } from "@/lib/avatarColors";

function inputClass() {
  return "w-full rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors";
}
function labelClass() {
  return "mb-1.5 block text-sm font-medium text-foreground-muted";
}

interface Props {
  initialUsername:           string;
  initialEmail:              string;
  pendingEmail:              string | null;
  initialBio:                string;
  initialSpecialty:          string;
  initialCity:               string;
  initialFeaturedItemId:     string | null;
  initialAvatarUrl:          string | null;
  initialAvatarColor:        string | null;
  initialFollowersOnlyOffers: boolean;
  userId:                    string;
  collectionItems:           PickerItem[];
  isAdmin?:                  boolean;
}

export function AccountSettingsForm({
  initialUsername,
  initialEmail,
  pendingEmail,
  initialBio,
  initialSpecialty,
  initialCity,
  initialFeaturedItemId,
  initialAvatarUrl,
  initialAvatarColor,
  initialFollowersOnlyOffers,
  userId,
  collectionItems,
  isAdmin = false,
}: Props) {
  const router = useRouter();
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  // Profile fields
  const [username,       setUsername]       = useState(initialUsername);
  const [email,          setEmail]          = useState(initialEmail);
  const [bio,            setBio]            = useState(initialBio);
  const [specialty,      setSpecialty]      = useState(initialSpecialty);
  const [city,           setCity]           = useState(initialCity);
  const [featuredItemId,       setFeaturedItemId]       = useState<string | null>(initialFeaturedItemId);
  const [followersOnlyOffers, setFollowersOnlyOffers] = useState(initialFollowersOnlyOffers);
  const [avatarColor,    setAvatarColor]    = useState<string>(
    initialAvatarColor ?? resolveAvatarColor(null, username)
  );

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Save state
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError,   setSaveError]   = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  // Delete state
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleteLoading,    setDeleteLoading]    = useState(false);
  const [deleteError,      setDeleteError]      = useState("");

  async function handleSaveAll(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    setSaveSuccess("");

    const authChanged          = username !== initialUsername || email !== initialEmail;
    const bioChanged           = bio.trim() !== initialBio.trim();
    const specialtyChanged     = specialty.trim() !== initialSpecialty.trim();
    const cityChanged          = city.trim() !== initialCity.trim();
    const featuredChanged          = featuredItemId !== initialFeaturedItemId;
    const initialColor             = initialAvatarColor ?? resolveAvatarColor(null, username);
    const colorChanged             = avatarColor !== initialColor;
    const followersOnlyChanged     = followersOnlyOffers !== initialFollowersOnlyOffers;
    const profilesChanged          = bioChanged || specialtyChanged || cityChanged || featuredChanged || colorChanged || followersOnlyChanged;
    const profileChanged       = authChanged || profilesChanged;
    const passwordAttempted    = !!(currentPassword || newPassword || confirmPassword);

    if (!profileChanged && !passwordAttempted) {
      setSaveSuccess("No changes to save.");
      return;
    }

    if (passwordAttempted) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        setSaveError("Fill in all three password fields to change your password.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setSaveError("New passwords do not match.");
        return;
      }
      if (newPassword.length < 8) {
        setSaveError("New password must be at least 8 characters.");
        return;
      }
    }

    const bioViolation       = bio.trim()       ? checkText(bio.trim())       : null;
    const specialtyViolation = specialty.trim() ? checkText(specialty.trim()) : null;
    const cityViolation      = city.trim()      ? checkText(city.trim())      : null;
    if (bioViolation)       { setSaveError(`Bio: ${bioViolation}`);       return; }
    if (specialtyViolation) { setSaveError(`Specialty: ${specialtyViolation}`); return; }
    if (cityViolation)      { setSaveError(`City: ${cityViolation}`);      return; }

    setSaveLoading(true);
    const supabase = createClient();

    // Check username uniqueness
    if (username !== initialUsername) {
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (existing) {
        setSaveError("This username is already taken.");
        setSaveLoading(false);
        return;
      }
    }

    // Verify current password before any writes
    if (passwordAttempted) {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: initialEmail,
        password: currentPassword,
      });
      if (verifyError) {
        setSaveError("Current password is incorrect.");
        setSaveLoading(false);
        return;
      }
    }

    // Update auth (email / username)
    if (authChanged) {
      const updates: Parameters<ReturnType<typeof createClient>["auth"]["updateUser"]>[0] = {};
      if (email    !== initialEmail)    updates.email = email;
      if (username !== initialUsername) updates.data  = { username, full_name: username };

      const { error } = await supabase.auth.updateUser(updates);
      if (error) {
        setSaveError(error.message);
        setSaveLoading(false);
        return;
      }
    }

    // Update profiles table (bio, specialty, featured card — one call)
    if (profilesChanged) {
      const patch: Record<string, unknown> = {};
      if (bioChanged)           patch.bio                   = bio.trim()             || null;
      if (specialtyChanged)     patch.specialty              = specialty.trim()        || null;
      if (cityChanged)          patch.city                   = city.trim()             || null;
      if (featuredChanged)      patch.featured_item_id       = featuredItemId          ?? null;
      if (colorChanged)         patch.avatar_color           = avatarColor;
      if (followersOnlyChanged) patch.followers_only_offers  = followersOnlyOffers;

      const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
      if (error) {
        setSaveError(error.message);
        setSaveLoading(false);
        return;
      }
    }

    // Update password
    if (passwordAttempted) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setSaveError(error.message);
        setSaveLoading(false);
        return;
      }
    }

    const saved: string[] = [];
    if (profileChanged)   saved.push("profile");
    if (passwordAttempted) saved.push("password");

    const emailChanged = email !== initialEmail;
    const label = saved.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" and ");

    setSaveSuccess(
      emailChanged
        ? `${label} updated. Check your inbox to confirm your new email address.`
        : `${label} updated successfully.`
    );

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    if (!emailChanged) router.refresh();
    setSaveLoading(false);
  }

  async function handleDelete() {
    setDeleteLoading(true);
    setDeleteError("");

    const res  = await fetch("/api/account/delete", { method: "POST" });
    const json = await res.json();

    if (!res.ok) {
      setDeleteError(json.error ?? "Failed to delete account.");
      setDeleteLoading(false);
      return;
    }

    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSaveAll} className="space-y-6">

        {/* Profile */}
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Profile</h2>

          <AvatarUpload
            userId={userId}
            username={username}
            initialUrl={initialAvatarUrl}
            onUpload={() => {}}
          />

          <AvatarColorPicker value={avatarColor} onChange={setAvatarColor} />

          <div className="border-t border-border" />

          <div>
            <label className={labelClass()}>Username</label>
            <input
              type="text"
              required
              minLength={3}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass()}
            />
          </div>

          {pendingEmail && (
            <div className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm space-y-1">
              <p className="font-medium text-gold">Email change pending</p>
              <p className="text-foreground-muted text-xs">
                Awaiting confirmation at <span className="text-foreground">{pendingEmail}</span>.
                Check your inbox or resend the link.
              </p>
              <button
                type="button"
                disabled={resendStatus === "sending" || resendStatus === "sent"}
                onClick={async () => {
                  setResendStatus("sending");
                  const supabase = createClient();
                  const { error } = await supabase.auth.resend({ type: "email_change", email: initialEmail });
                  setResendStatus(error ? "error" : "sent");
                }}
                className="text-xs text-gold hover:underline disabled:opacity-50"
              >
                {resendStatus === "sending" ? "Sending…" : resendStatus === "sent" ? "Sent!" : resendStatus === "error" ? "Failed — try again" : "Resend confirmation"}
              </button>
            </div>
          )}

          <div>
            <label className={labelClass()}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass()}
            />
            <p className="mt-1.5 text-xs text-foreground-muted">
              Changing your email sends a confirmation link to the new address.
            </p>
          </div>

          <div>
            <label className={labelClass()}>Specialty</label>
            <input
              type="text"
              maxLength={60}
              placeholder="e.g. Vintage Holo Hunter, Base Set Collector…"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className={inputClass()}
            />
            <p className="mt-1.5 text-xs text-foreground-muted">
              {specialty.length}/60 — shown as a badge on your public profile.
            </p>
          </div>

          <div>
            <label className={labelClass()}>City</label>
            <input
              type="text"
              maxLength={60}
              placeholder="e.g. Chicago, IL"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={inputClass()}
            />
            <p className="mt-1.5 text-xs text-foreground-muted">
              Shown on your public profile to help local collectors find you.
            </p>
          </div>

          <div>
            <label className={labelClass()}>Bio</label>
            <textarea
              maxLength={isAdmin ? 500 : 160}
              rows={isAdmin ? 6 : 3}
              placeholder="Tell other collectors about yourself…"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className={`${inputClass()} resize-none`}
            />
            <p className="mt-1.5 text-xs text-foreground-muted">
              {bio.length}/{isAdmin ? 500 : 160} — shown on your public profile.
            </p>
            {isAdmin && (
              <p className="mt-1 text-xs text-foreground-muted">
                Link syntax: <code className="font-mono bg-surface-raised px-1 rounded">[label](/path)</code> — e.g. <code className="font-mono bg-surface-raised px-1 rounded">[Contact](/contact)</code>
              </p>
            )}
          </div>

          <div>
            <label className={labelClass()}>Featured Card</label>
            <p className="mb-2 text-xs text-foreground-muted">
              Pinned to the top of your public profile as your crown jewel.
            </p>
            <FeaturedCardPicker
              value={featuredItemId}
              onChange={setFeaturedItemId}
              items={collectionItems}
            />
          </div>

          <div className="flex items-start justify-between gap-4 pt-1">
            <div>
              <p className="text-sm font-medium text-foreground">Followers-only offers</p>
              <p className="mt-0.5 text-xs text-foreground-muted">
                When enabled, only users who follow you can make offers on your listings.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={followersOnlyOffers}
              onClick={() => setFollowersOnlyOffers((v) => !v)}
              className={`relative mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors ${
                followersOnlyOffers
                  ? "border-gold bg-gold"
                  : "border-border bg-surface-raised"
              }`}
            >
              <span
                className={`h-4 w-4 rounded-full bg-background shadow transition-transform ${
                  followersOnlyOffers ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Password */}
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Change Password</h2>
          <p className="text-sm text-foreground-muted">Leave these blank to keep your current password.</p>

          <div>
            <label className={labelClass()}>Current Password</label>
            <PasswordInput
              autoComplete="new-password"
              placeholder="Enter your current password"
              value={currentPassword}
              onChange={setCurrentPassword}
            />
          </div>
          <div>
            <label className={labelClass()}>New Password</label>
            <PasswordInput
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              minLength={newPassword ? 8 : undefined}
              value={newPassword}
              onChange={setNewPassword}
            />
          </div>
          <div>
            <label className={labelClass()}>Confirm New Password</label>
            <PasswordInput
              autoComplete="new-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
            />
          </div>
        </div>

        {saveError && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
            {saveError}
          </p>
        )}
        {saveSuccess && (
          <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-400">
            {saveSuccess}
          </p>
        )}

        <button
          type="submit"
          disabled={saveLoading}
          className="rounded-full bg-gold px-8 py-3 text-sm font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
        >
          {saveLoading ? "Saving…" : "Save All Changes"}
        </button>
      </form>

      {/* Danger zone */}
      <div className="rounded-2xl border border-red-500/20 bg-surface p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-red-400">Danger Zone</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Permanently delete your account and all associated collection data. This cannot be undone.
          </p>
        </div>

        {deleteError && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
            {deleteError}
          </p>
        )}

        {!deleteConfirming ? (
          <button
            type="button"
            onClick={() => setDeleteConfirming(true)}
            className="rounded-full border border-red-500/40 px-6 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Delete Account
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteLoading}
              className="rounded-full bg-red-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60 transition-colors"
            >
              {deleteLoading ? "Deleting…" : "Yes, delete my account"}
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirming(false)}
              className="rounded-full border border-border px-6 py-2.5 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

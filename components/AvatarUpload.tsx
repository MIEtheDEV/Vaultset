"use client";

import { useRef, useState } from "react";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 2 * 1024 * 1024;

export function AvatarUpload({
  userId,
  username,
  initialUrl,
  onUpload,
}: {
  userId: string;
  username: string;
  initialUrl: string | null;
  onUpload: (url: string) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl);
  const [uploading, setUploading]   = useState(false);
  const [removing, setRemoving]     = useState(false);
  const [error, setError]           = useState("");
  const [dragging, setDragging]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const initial = username.charAt(0).toUpperCase();

  async function handleFile(file: File) {
    setError("");

    if (!ALLOWED_TYPES.has(file.type)) {
      setError("Please upload a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be under 2 MB.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setUploading(true);

    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/avatar/upload", { method: "POST", body: form });
    const json = await res.json();

    if (!res.ok) {
      setError(json.error ?? "Upload failed.");
      setPreviewUrl(initialUrl);
      setUploading(false);
      return;
    }

    URL.revokeObjectURL(objectUrl);
    setPreviewUrl(json.url);
    onUpload(json.url);
    setUploading(false);
  }

  async function handleRemove() {
    setRemoving(true);
    setError("");
    const res = await fetch("/api/avatar/upload", { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to remove photo.");
    } else {
      setPreviewUrl(null);
      onUpload("");
    }
    setRemoving(false);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={uploading}
        aria-label="Upload profile photo"
        className={`relative h-16 w-16 shrink-0 rounded-full overflow-hidden border-2 transition-colors ${
          dragging ? "border-gold" : "border-border hover:border-gold/40"
        }`}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-raised text-xl font-bold text-foreground-muted select-none">
            {initial}
          </div>
        )}

        <div
          className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${
            uploading ? "opacity-100" : "opacity-0 hover:opacity-100"
          }`}
        >
          {uploading ? (
            <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
              <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          )}
        </div>
      </button>

      <div>
        <p className="text-sm text-foreground">Profile photo</p>
        <p className="text-xs text-foreground-muted">Click or drag to upload · JPEG, PNG, WebP · Max 2 MB</p>
        {previewUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="mt-1.5 text-xs text-foreground-muted hover:text-red-400 transition-colors disabled:opacity-50"
          >
            {removing ? "Removing…" : "Remove photo"}
          </button>
        )}
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onInputChange}
      />
    </div>
  );
}

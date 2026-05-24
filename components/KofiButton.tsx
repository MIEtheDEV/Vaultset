const KOFI_URL = 'https://ko-fi.com/J5M22056SF'

interface KofiButtonProps {
  variant?: 'button' | 'icon'
  className?: string
}

export function KofiButton({ variant = 'button', className }: KofiButtonProps) {
  if (variant === 'icon') {
    return (
      <a
        href={KOFI_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Support Vaultset on Ko-fi"
        className={`inline-flex items-center justify-center h-9 w-9 rounded-lg text-foreground-muted hover:text-gold hover:bg-gold/5 transition-colors ${className ?? ''}`}
      >
        <HeartIcon />
        <span className="sr-only">Support Vaultset on Ko-fi</span>
      </a>
    )
  }

  return (
    <a
      href={KOFI_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/10 hover:border-gold/50 transition-colors ${className ?? ''}`}
    >
      <HeartIcon />
      Help keep it free
    </a>
  )
}

function HeartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

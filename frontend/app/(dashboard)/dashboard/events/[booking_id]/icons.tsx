/**
 * Phosphor-style (1.5 regular stroke) inline icons shared across the event
 * workspace components. Hand-drawn to match the locked design system — no icon
 * dependency. All take a numeric `size` and pass through `className`/`style`.
 */
type IconProps = { size?: number; className?: string; style?: React.CSSProperties };

const base = (size: number, stroke = 1.6) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: stroke,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function IconLock({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <rect x="5" y="11" width="14" height="9" rx="1.6" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IconBroadcast({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <circle cx="12" cy="12" r="2" />
      <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4" />
      <path d="M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" />
    </svg>
  );
}

export function IconWarning({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M12 3l9.5 17H2.5L12 3z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <circle cx="12" cy="17" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCaretDown({ size = 13, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function IconX({ size = 15, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </svg>
  );
}

export function IconCheck({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size, 2)} className={className} style={style}>
      <polyline points="5 12 10 17 19 7" />
    </svg>
  );
}

export function IconUpload({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <polyline points="7 9 12 4 17 9" />
      <line x1="12" y1="4" x2="12" y2="16" />
      <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}

export function IconPause({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPlay({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M7 5l12 7-12 7V5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconLink({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.5)} className={className} style={style}>
      <path d="M9 14a4 4 0 0 1 0-5l2-2a4 4 0 0 1 6 6l-1 1" />
      <path d="M15 10a4 4 0 0 1 0 5l-2 2a4 4 0 0 1-6-6l1-1" />
    </svg>
  );
}

export function IconCopy({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.5)} className={className} style={style}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

export function IconZoomIn({ size = 16, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.7)} className={className} style={style}>
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

export function IconZoomOut({ size = 16, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.7)} className={className} style={style}>
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

export function IconTrash({ size = 15, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.6)} className={className} style={style}>
      <polyline points="4 7 20 7" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export function IconChevronLeft({ size = 20, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.8)} className={className} style={style}>
      <polyline points="15 6 9 12 15 18" />
    </svg>
  );
}

export function IconChevronRight({ size = 20, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.8)} className={className} style={style}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

export function IconWhatsApp({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.6-1.2a.4.4 0 0 0 0-.4c0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1c0 1.3.9 2.5 1 2.7.2.2 1.9 2.9 4.6 4 1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.2-.3-.2-.5-.3z" />
    </svg>
  );
}

export function IconMail({ size = 15, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.5)} className={className} style={style}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

export function IconScanFace({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.5)} className={className} style={style}>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <circle cx="9.5" cy="11" r=".6" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="11" r=".6" fill="currentColor" stroke="none" />
      <path d="M9.5 14.5a3 3 0 0 0 5 0" />
    </svg>
  );
}

export function IconShieldCheck({ size = 15, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.5)} className={className} style={style}>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

export function IconInfo({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.6)} className={className} style={style}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <circle cx="12" cy="8" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconImage({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.5)} className={className} style={style}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M3 17l5-5 4 4 3-3 6 6" />
    </svg>
  );
}

export function IconFolder({ size = 16, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.5)} className={className} style={style}>
      <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function IconMonitor({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.5)} className={className} style={style}>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="16" x2="12" y2="20" />
    </svg>
  );
}

export function IconMobile({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.5)} className={className} style={style}>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  );
}

export function IconArrowRight({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.7)} className={className} style={style}>
      <line x1="4" y1="12" x2="19" y2="12" />
      <polyline points="13 6 19 12 13 18" />
    </svg>
  );
}

export function IconEdit({ size = 13, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.6)} className={className} style={style}>
      <path d="M16 4l4 4-11 11H5v-4z" />
      <line x1="13" y1="7" x2="17" y2="11" />
    </svg>
  );
}

export function IconDownload({ size = 15, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M12 3v12M7 11l5 5 5-5M5 20h14" />
    </svg>
  );
}

export function IconHeart({
  size = 14,
  className,
  style,
  filled,
}: IconProps & { filled?: boolean }) {
  return (
    <svg
      {...base(size, 1.6)}
      className={className}
      style={style}
      fill={filled ? "currentColor" : "none"}
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export function IconSearch({ size = 15, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.6)} className={className} style={style}>
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}

export function IconUsers({ size = 15, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.5)} className={className} style={style}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6a3 3 0 0 1 0 5.4M17 13.5a5.5 5.5 0 0 1 3.5 5.5" />
    </svg>
  );
}

export function IconStar({
  size = 14,
  className,
  style,
  filled,
}: IconProps & { filled?: boolean }) {
  return (
    <svg
      {...base(size, 1.6)}
      className={className}
      style={style}
      fill={filled ? "currentColor" : "none"}
    >
      <path d="M12 3.2l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.9l-5.2 2.31.99-5.79-4.21-4.1 5.82-.85L12 3.2z" />
    </svg>
  );
}

export function IconTarget({ size = 15, className, style }: IconProps) {
  return (
    <svg {...base(size, 1.6)} className={className} style={style}>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.6" />
      <line x1="12" y1="1.5" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22.5" />
      <line x1="1.5" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22.5" y2="12" />
    </svg>
  );
}

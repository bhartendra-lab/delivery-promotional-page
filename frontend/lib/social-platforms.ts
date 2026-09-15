/**
 * Every link platform a Studio can add — the social profiles and the listing
 * and review portals — in one registry. The Settings page, the Guest gallery's
 * chips, the required visit gate and link validation all read this; nothing
 * else keeps a platform list.
 *
 * To add a platform: a key in `SocialPlatformKey` and an entry in
 * `SOCIAL_PLATFORMS` here, and the key in the backend's SOCIAL_PLATFORMS
 * (utils/social.utils.js), which also builds the companies `social_links`
 * sub-schema. A portal's mark goes in /public/social/<key>.png — see the
 * README there before flipping `hasAsset`.
 */

import {
  IconFacebook,
  IconInstagram,
  IconPinterest,
  IconVimeo,
  IconXLogo,
  IconYoutube,
  type IconProps,
} from "@/components/ui/icons";
import type { DeliveryPreferences } from "./delivery-preferences";
import type { SocialLinks } from "./types";

export type SocialPlatformKey =
  | "instagram" | "facebook" | "youtube" | "vimeo" | "pinterest" | "x"
  | "wedmegood" | "weddingbazaar" | "justdial";

export type PlatformGroup = "social" | "portal";

export type SocialPlatformSpec = {
  key: SocialPlatformKey;
  /** Human name. Used as the accessible name, the hover label, and the Settings row label. */
  label: string;
  group: PlatformGroup;
  placeholder: string;
  /**
   * How the mark is drawn. "knockout" is the existing treatment: a white
   * react-icons glyph on a brand-coloured chip. "plate" is for the portals:
   * their official marks are full-colour artwork, and knocking one out to a
   * white silhouette would be both illegible and wrong, so the chip goes white
   * with a hairline ring and the real mark sits inside it.
   */
  treatment: "knockout" | "plate";
  /** Chip fill for "knockout". Ignored for "plate". */
  chip?: string;
  /** react-icons component, for the original six only. */
  glyph?: React.FC<IconProps>;
  /**
   * Path under /public for a "plate" mark, e.g. "/social/wedmegood.png".
   * These are RASTER PNGs, not SVGs — the portals do not publish vector marks —
   * so the chip renders them with object-fit: contain at an explicit size.
   */
  assetSrc?: string;
  /**
   * Flip to true only once the real PNG is actually committed at `assetSrc`.
   * With it false the chip renders the monogram fallback, so the feature ships
   * and works with zero assets present. Next cannot detect a missing file in
   * /public at build time, which is why this is an explicit flag and not an
   * existence check.
   */
  hasAsset: boolean;
  /**
   * Padding inside the chip, as a percentage of chip size, per axis. Exists
   * because these marks are not all the same shape: a mark that is already a
   * filled disc wants none, a rounded square needs enough to keep its corners
   * inside the circle, and a wide wordmark (Justdial) has to be letterboxed —
   * little horizontal inset so it uses the chip's width, a large vertical one
   * so it sits centred with clear space above and below. Tuned once per
   * platform here and never touched again at a call site.
   */
  markInset: { x: number; y: number };
  /** 1-2 letters, drawn on the brand colour when there is no asset. */
  monogram: string;
  /**
   * Brand colour, used for the monogram chip fill and the focus ring — and
   * nowhere else, because the "plate" treatment puts the real mark on a white
   * chip. For a portal this is SAMPLED FROM ITS OWN SUPPLIED PNG (the dominant
   * colour of the mark, not of any background), never recalled from memory,
   * and it lands in the same change that sets `hasAsset: true`.
   */
  brand: string;
  /**
   * Registrable domains this platform's links live on (www. and subdomains
   * match). Portals only, and used for one thing: catching a link pasted into
   * the wrong portal's field. An unknown host is never an error. Mirrors
   * PLATFORM_HOSTS in the backend's social.utils.js.
   */
  expectedHosts?: readonly string[];
  /** Whether a bare handle can be expanded into a URL (mirrors the backend's
   *  HANDLE_BASES). A portal listing is a long path, so portals cannot. */
  acceptsHandle: boolean;
};

/**
 * The monogram fill for a portal whose mark — and so its sampled colour — has
 * not landed yet: the design system's warm muted grey, deliberately not a
 * guessed brand colour.
 */
const PORTAL_PLACEHOLDER_BRAND = "#7A6F63";

/** Display order: the six socials exactly as before, then the portals. */
export const SOCIAL_PLATFORMS = [
  {
    key: "instagram",
    label: "Instagram",
    group: "social",
    placeholder: "@yourstudio or full URL",
    treatment: "knockout",
    // Signature gradient — the one chip that is not a flat fill.
    chip: "linear-gradient(45deg, #F58529, #DD2A7B 45%, #8134AF 75%, #515BD4)",
    glyph: IconInstagram,
    hasAsset: false,
    markInset: { x: 21, y: 21 },
    monogram: "IG",
    brand: "#DD2A7B",
    acceptsHandle: true,
  },
  {
    key: "facebook",
    label: "Facebook",
    group: "social",
    placeholder: "facebook.com/yourstudio",
    treatment: "knockout",
    chip: "#1877F2",
    glyph: IconFacebook,
    hasAsset: false,
    markInset: { x: 21, y: 21 },
    monogram: "FB",
    brand: "#1877F2",
    acceptsHandle: true,
  },
  {
    key: "youtube",
    label: "YouTube",
    group: "social",
    placeholder: "@yourstudio or full URL",
    treatment: "knockout",
    chip: "#FF0000",
    glyph: IconYoutube,
    hasAsset: false,
    markInset: { x: 21, y: 21 },
    monogram: "YT",
    brand: "#FF0000",
    acceptsHandle: true,
  },
  {
    key: "vimeo",
    label: "Vimeo",
    group: "social",
    placeholder: "vimeo.com/yourstudio",
    treatment: "knockout",
    chip: "#1AB7EA",
    glyph: IconVimeo,
    hasAsset: false,
    markInset: { x: 21, y: 21 },
    monogram: "V",
    brand: "#1AB7EA",
    acceptsHandle: true,
  },
  {
    key: "pinterest",
    label: "Pinterest",
    group: "social",
    placeholder: "pinterest.com/yourstudio",
    treatment: "knockout",
    chip: "#E60023",
    glyph: IconPinterest,
    hasAsset: false,
    markInset: { x: 21, y: 21 },
    monogram: "P",
    brand: "#E60023",
    acceptsHandle: true,
  },
  {
    key: "x",
    label: "X (Twitter)",
    group: "social",
    placeholder: "@yourstudio or full URL",
    treatment: "knockout",
    chip: "#0F1419",
    glyph: IconXLogo,
    hasAsset: false,
    markInset: { x: 21, y: 21 },
    monogram: "X",
    brand: "#0F1419",
    acceptsHandle: true,
  },
  {
    key: "wedmegood",
    label: "WedMeGood",
    group: "portal",
    placeholder: "wedmegood.com/profile/your-studio",
    treatment: "plate",
    assetSrc: "/social/wedmegood.png",
    hasAsset: true,
    // The mark is itself a filled disc, so it fills the chip edge to edge.
    markInset: { x: 0, y: 0 },
    monogram: "WM",
    // Sampled from /social/wedmegood.png.
    brand: "#E81C65",
    expectedHosts: ["wedmegood.com"],
    acceptsHandle: false,
  },
  {
    key: "weddingbazaar",
    label: "WeddingBazaar",
    group: "portal",
    placeholder: "Full link to your WeddingBazaar page",
    treatment: "plate",
    assetSrc: "/social/weddingbazaar.png",
    // Held back: the supplied file shows upscaling artefacts (a dark smudge
    // inside the square, soft edges). Flip once a press-page copy is confirmed.
    hasAsset: false,
    // A rounded square: enough inset to keep its corners inside the circle.
    markInset: { x: 11, y: 11 },
    monogram: "WB",
    brand: PORTAL_PLACEHOLDER_BRAND, // PLACEHOLDER — sample from the supplied PNG
    expectedHosts: ["weddingbazaar.com"],
    acceptsHandle: false,
  },
  {
    key: "justdial",
    label: "Justdial",
    group: "portal",
    placeholder: "Full link to your Justdial page",
    treatment: "plate",
    assetSrc: "/social/justdial.png",
    hasAsset: true,
    // A ~4:1 wordmark, letterboxed. It lands about 7px tall in a 32px chip —
    // recognition, not reading; the label names the platform.
    markInset: { x: 8, y: 30 },
    monogram: "JD",
    // Sampled from /social/justdial.png — the orange "dial", its largest colour.
    brand: "#FF6C00",
    // jsdl.in is Justdial's own short-link domain (it redirects to justdial.com).
    expectedHosts: ["justdial.com", "jsdl.in"],
    acceptsHandle: false,
  },
] as const satisfies readonly SocialPlatformSpec[];

// Compile-time guard: every key in the union has a registry entry. (The
// `satisfies` above already rejects an entry whose key is not in the union.)
type UnregisteredPlatform = Exclude<SocialPlatformKey, (typeof SOCIAL_PLATFORMS)[number]["key"]>;
const everyPlatformIsRegistered: [UnregisteredPlatform] extends [never] ? true : UnregisteredPlatform = true;
void everyPlatformIsRegistered;

export const SOCIAL_PLATFORM_BY_KEY = Object.fromEntries(
  SOCIAL_PLATFORMS.map((spec) => [spec.key, spec]),
) as Record<SocialPlatformKey, SocialPlatformSpec>;

export function isSocialPlatformKey(value: unknown): value is SocialPlatformKey {
  return typeof value === "string" && Object.hasOwn(SOCIAL_PLATFORM_BY_KEY, value);
}

function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url.replace(/^\/+/, "")}`;
}

/* ── the required visit gate ─────────────────────────────────────────────── */

export type SocialVisitGate = { platform: SocialPlatformKey; label: string; url: string };

/**
 * The link this Guest must open before entering, or null when there is no gate.
 * Null for every one of these reasons, and each one matters:
 *   - the event hides Studio branding (every Studio link is hidden from its
 *     Guests, so asking them to open one would undo that choice);
 *   - the Studio has set no required platform, or one this client doesn't know;
 *   - the Studio set one and then cleared that platform's URL (a gate with no
 *     destination would trap the Guest behind a button that can never enable);
 *   - this event has opted out.
 *
 * Mirrors resolveSocialVisitGate in the backend's deliverables.utils.js, which
 * the record endpoint uses to decide what a Guest may claim.
 */
export function resolveSocialVisitGate(args: {
  socialLinks: SocialLinks | undefined;
  mandatoryPlatform: string | null | undefined;
  preferences: DeliveryPreferences;
  /** The event's `include_company_branding`, read `=== true` like the gallery. */
  includeCompanyBranding: boolean | undefined;
}): SocialVisitGate | null {
  if (args.includeCompanyBranding !== true) return null;
  if (!isSocialPlatformKey(args.mandatoryPlatform)) return null;
  const url = args.socialLinks?.[args.mandatoryPlatform]?.trim();
  if (!url) return null;
  if (!args.preferences.require_social_visit) return null;
  const spec = SOCIAL_PLATFORM_BY_KEY[args.mandatoryPlatform];
  return { platform: spec.key, label: spec.label, url: withScheme(url) };
}

/* ── link validation (client mirror) ─────────────────────────────────────── */

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

function platformForHost(host: string): SocialPlatformSpec | null {
  if (!host) return null;
  return (
    SOCIAL_PLATFORMS.find((spec: SocialPlatformSpec) =>
      spec.expectedHosts?.some((domain) => host === domain || host.endsWith(`.${domain}`)),
    ) ?? null
  );
}

/**
 * Why this value cannot be saved in this platform's field, or null when it can.
 *
 * The client mirror of the backend's normalizeSocialLink, so the Studio sees
 * the problem on the row instead of as a failed save. Two rules only:
 *   - a handle for a platform that cannot expand one is not a link;
 *   - a link on ANOTHER registry platform's domain is in the wrong field.
 * An unrecognised host is always accepted.
 */
export function validateSocialLinkInput(platform: SocialPlatformKey, raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const spec = SOCIAL_PLATFORM_BY_KEY[platform];
  const looksLikeUrl = /^https?:\/\//i.test(value) || value.includes("/") || /\.[a-z]{2,}/i.test(value);
  if (!looksLikeUrl) {
    return spec.acceptsHandle ? null : `Paste the full link to your ${spec.label} page.`;
  }
  const owner = platformForHost(hostOf(withScheme(value)));
  if (owner && owner.key !== platform) {
    return `That looks like a ${owner.label} link. Paste it in the ${owner.label} field instead.`;
  }
  return null;
}

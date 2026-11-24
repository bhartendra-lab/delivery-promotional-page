/**
 * The two questions added to the first onboarding step: the studio's city and
 * how it heard about Vyavasth. Both required. The values are the same fixed
 * keys the backend stores (utils/acquisition.utils.js); the labels are what the
 * studio reads.
 */

export type AcquisitionSource =
  | "photo_fair_or_expo"
  | "whatsapp_message"
  | "referred_by_studio"
  | "instagram"
  | "google_search"
  | "ai_app"
  | "vyavasth_team_call"
  | "other";

export const ACQUISITION_OPTIONS: ReadonlyArray<{ value: AcquisitionSource; label: string }> = [
  { value: "photo_fair_or_expo", label: "Photo fair or expo" },
  { value: "whatsapp_message", label: "WhatsApp message" },
  { value: "referred_by_studio", label: "Referred by a studio" },
  { value: "instagram", label: "Instagram" },
  { value: "google_search", label: "Google search" },
  { value: "ai_app", label: "ChatGPT / Gemini / other AI app" },
  { value: "vyavasth_team_call", label: "Call from Vyavasth team" },
  { value: "other", label: "Other" },
];

export type StudioAbout = {
  city: string;
  acquisitionSource: AcquisitionSource | "";
  acquisitionSourceOther: string;
};

export const CITY_MAX = 80;
export const OTHER_MAX = 120;

const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

/** Per-field problems, in plain words; an empty object means both answers are fine. */
export function validateStudioAbout(about: StudioAbout): Partial<Record<"city" | "source" | "other", string>> {
  const errors: Partial<Record<"city" | "source" | "other", string>> = {};
  if (!collapse(about.city)) errors.city = "Tell us your city.";
  else if (collapse(about.city).length > CITY_MAX) errors.city = "That city name is too long.";
  if (!about.acquisitionSource) errors.source = "Tell us how you heard about Vyavasth.";
  else if (about.acquisitionSource === "other" && !collapse(about.acquisitionSourceOther)) {
    errors.other = "Tell us in a few words how you heard about Vyavasth.";
  }
  return errors;
}

/** What goes to the server: cleaned, and the free text only for "other". */
export function aboutPayload(about: StudioAbout): { city: string; acquisitionSource: AcquisitionSource; acquisitionSourceOther: string } {
  const source = (about.acquisitionSource || "other") as AcquisitionSource;
  return {
    city: collapse(about.city),
    acquisitionSource: source,
    acquisitionSourceOther: source === "other" ? collapse(about.acquisitionSourceOther).slice(0, OTHER_MAX) : "",
  };
}

/** Whether choosing this answer should move the studio to the optional Referral code field. */
export function sourceBringsReferralCode(source: AcquisitionSource | ""): boolean {
  return source === "referred_by_studio";
}

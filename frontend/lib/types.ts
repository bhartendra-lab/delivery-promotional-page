export type EventType =
  | "Wedding"
  | "Birthday"
  | "Anniversary"
  | "Pre-wedding"
  | "Engagement";

export const EVENT_TYPES: EventType[] = [
  "Wedding",
  "Birthday",
  "Anniversary",
  "Pre-wedding",
  "Engagement",
];

export type ContentType = "Images" | "Videos" | "Images & Videos";

export const CONTENT_TYPES: ContentType[] = [
  "Images",
  "Videos",
  "Images & Videos",
];

export type Provider =
  | "Kwikpic"
  | "Google Drive"
  | "WeTransfer"
  | "Samaro"
  | "Other";

export const PROVIDERS: Provider[] = [
  "Kwikpic",
  "Google Drive",
  "WeTransfer",
  "Samaro",
  "Other",
];

export type DeliveryUrl = {
  content_type: ContentType;
  url: string;
  provider: Provider;
};

export type TrackingType = "visit" | "delivery" | "review";

export type TrackingCounts = {
  visit?: number;
  delivery?: number;
  review?: number;
};

export type DeliveryLandingPageListItem = {
  _id: string;
  client_name: string;
  event_type: EventType;
  event_date?: number;
  createdAt: string;
  trackings: TrackingCounts;
};

export type DeliveryLandingPage = {
  _id: string;
  client_name: string;
  event_type: EventType;
  event_date?: number;
  custom_message?: string;
  delivery_urls: DeliveryUrl[];
  background_image?: string;
  trackings: TrackingCounts;
  createdAt: string;
};

export type ListResponse = {
  deliveryLandingPages: DeliveryLandingPageListItem[];
  totalPages: number;
  totalTrackings: number;
  reviewTrackings: number;
  deliveryTrackings: number;
  visitTrackings: number;
};

export type GetByIdResponse = {
  deliveryLandingPage: DeliveryLandingPage;
};

export type Company = {
  _id: string;
  name: string;
  address?: string;
  contact_number?: string;
  logo?: string;
  website?: string;
  gmb_link?: string;
  instagram_link?: string;
  facebook_link?: string;
  google_place_id?: string;
  createdAt: string;
  updatedAt: string;
};

export type LoginResponse = {
  token: string;
  user: Record<string, unknown>;
  company: Company;
};

export type KvData = {
  client_name: string;
  event_type: EventType;
  event_date?: number;
  custom_message?: string;
  delivery_urls: DeliveryUrl[];
  background_image?: string;
  company_name?: string;
  company_google_place_id?: string;
  company_address?: string;
  company_contact_number?: string;
  company_logo?: string;
  company_website?: string;
  company_gmb_link?: string;
  company_instagram_link?: string;
  company_facebook_link?: string;
  /** Optional, may be added by backend later. */
  brand_colors?: {
    primaryColor?: string;
    secondaryColor?: string;
    textOnPrimary?: string;
  };
};

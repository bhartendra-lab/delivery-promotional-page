# Dashboard analytics events (GA4 through GTM)

Everything here is pushed to the `dataLayer` by `trackEvent` in `lib/analytics.ts`. It is a no-op unless `NEXT_PUBLIC_GTM_ID` is set, and it never throws. **No personal data is ever sent**: no names, phones, emails, and no event or couple names. Only fixed words and buckets.

The guest gallery (`app/(client)/…`, `app/e/…`, `/event/…`) does not load GTM or call `trackEvent`, and nothing in this file fires there. The Gallery Design preview (a dashboard route that shows the guest screens) records nothing at all.

**TODO(abhishek): add the GA4 event tag and trigger in GTM.** GA4 custom events only reach Google if a GA4 Event tag in the GTM container forwards them: one tag whose trigger is a Custom Event matching these names (a regex trigger such as `^(onboarding_step_completed|free_event_claimed|coupon_plan_activated|event_created|upload_started|upload_completed|gallery_link_copied|invite_shared|passcode_shared|qr_downloaded|leads_exported|change_request_submitted|referral_link_shared|events_filter_changed|events_sort_changed|dashboard_attention_clicked)$`), with the parameters below as event parameters (Data Layer Variables for `step`, `event_type`, `plan_kind`, `tier`, `photo_count_bucket`, `channel`, `language`, `format`, `scope`, `type`, `location`, `coupon`, `filter`, `sort`, `kind`). Register the ones you want to report on as custom dimensions in GA4.

## New events

| Event | Parameters | Fired when |
| --- | --- | --- |
| `onboarding_step_completed` | `step`: `studio_details`, `whatsapp_verified` or `google_business` | A studio finishes an onboarding step: details sent (code requested), WhatsApp code verified, Google step done |
| `event_created` | `event_type`: the event type (Wedding, Birthday, …); `plan_kind`: `free`, `event_based`, `monthly`, `yearly` or `unknown`; `method`: `bought` (paid for on the spot) or `plan` | An event is created |
| `free_event_claimed` | `currency`, `value` (0), `coupon`, `items`, `purpose` | A 100% coupon pays for one event (the campaign's core conversion; mark it a GA4 key event) |
| `coupon_plan_activated` | `currency`, `value` (0), `coupon`, `items`, `purpose` | A 100% coupon activates a plan |
| `upload_started` | `tier`: `hd`, `4k` or `original`; `photo_count_bucket` | The studio presses Upload on step 2 |
| `upload_completed` | `photo_count_bucket` | An upload run finishes |
| `gallery_link_copied` | `location`: `access_tab` or `upload_done` | The gallery link is copied |
| `invite_shared` | `channel`: `whatsapp`, `email` or `copy`; `language`: `en`, `hi`, `hinglish`, `mr`, `gu`, `bn`, `pa`, `or`, `ta`, `te`, `kn`, `ml` | The invite message is sent or copied (Access & Sharing, and the upload done dialog) |
| `passcode_shared` | `channel`: `whatsapp` or `copy`; `language` (WhatsApp only) | The family passcode is sent or copied |
| `qr_downloaded` | `format`: `png` or `pptx` | The event QR (png) or the standee designs (pptx) is downloaded |
| `leads_exported` | `scope`: `event` or `all` | A guest list is exported (one event, or all events) |
| `change_request_submitted` | `type`: `event_name` or `cover_photo` | A studio asks to change a locked event name or cover |
| `referral_link_shared` | `channel`: `whatsapp` or `copy` | The studio's referral link is shared or copied |
| `events_filter_changed` | `filter`: `all`, `active`, `deactivated` or `archived` | The Events page filter is changed |
| `events_sort_changed` | `sort`: `created_desc`, `created_asc`, `date_desc` or `date_asc` | The Events page sort is changed |
| `dashboard_attention_clicked` | `kind`: `expiring`, `no_photos`, `deactivated`, `missing_number`, `change_request` or `upload` | A row of the Dashboard's Needs attention list is clicked |

`photo_count_bucket` is one of `1-50`, `51-200`, `201-500`, `501-1000`, `1001-2000`, `2000+` (`lib/analytics-params.ts`).

## Events that already existed (reused, not duplicated)

Checked against the codebase before adding anything. The names asked for in the brief that map onto them:

| Brief asked for | Existing event used | Parameters |
| --- | --- | --- |
| `onboarding_completed` | `onboarding_complete` | none |
| `checkout_started` | `begin_checkout` | `currency`, `value`, `items`, `purpose` (the standard GA4 e-commerce event) |
| `purchase_completed` | `purchase` | `transaction_id`, `currency`, `value`, `items`, `purpose` (the standard GA4 e-commerce event) |

Other existing events: `sign_up` and `login` (`method`: `google` or `email_otp`).

## Shared parameter keys

GTM keeps a parameter's last value, so a value set by one event could leak into the next. `trackEvent` therefore clears these keys at the start of every event: `location`, `method`, `plan`, `purpose`, `step`, `event_type`, `plan_kind`, `tier`, `photo_count_bucket`, `channel`, `language`, `format`, `scope`, `type`.

## PostHog (dashboard only)

The same events above also go to PostHog, with the same parameters, plus a `$pageview` on every dashboard page. It does nothing unless `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` are both set at build time.

- **Proxy.** The browser talks to `/ingest` on our own domain (a Next.js rewrite in `next.config.ts`), so an ad blocker that blocks posthog.com does not drop events.
- **Who.** A person is known by the company id only (`identify(company_id)`, no person properties). No name, email, phone, or event or couple name.
- **Pages.** Pageviews carry the path only; every URL field loses its query string and fragment before it is sent.
- **Replay.** Every input, all text and every image, video and canvas are hidden. No network bodies or headers, no clicks or element text (autocapture is off). It never runs on `/auth/callback` or `/reset-password` (the URL holds a sign-in token) or on the Gallery Design preview.
- **Consent.** Follows the cookie banner: Opt out stops capturing and the replay at once. A saved choice is read before PostHog loads. In Europe (judged by the device's time zone, erring towards asking) it waits for OK; elsewhere it is on until the visitor opts out.
- **Never on the guest gallery.** `PosthogProvider` sits in the dashboard layout; `app/(client)`, `app/e` and `/event/...` do not load it.

## Guest gallery

The guest gallery loads no third-party script and records no analytics events of its own (a test fails if a third-party script appears). How many guests opened a gallery comes from the guest records that already exist.

The "Powered by Vyavasth" link at the foot of the gallery opens `https://vyavasth.in/?utm_source=gallery&utm_medium=referral` in a new tab with `noopener noreferrer`. Those tags are the only tracking on it.

## Campaign sign ups (our CRM, not Google)

A tap on `deliver.vyavasth.in/w/<id>` sets the `vy_acq` cookie for 30 days and lands on `https://vyavasth.in/` with utm tags. If that browser then signs up, `POST /api/signup-attribution` (our server) confirms which studio is signed in and tells the CRM (`/webhooks/signup`). Settings: `CRM_CLICK_URL` and `CRM_CLICK_SECRET`. Nothing about it is stored in the product backend.

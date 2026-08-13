"use client";

import { useEffect, useRef, useState } from "react";

/* ── Google Places Autocomplete (address → place_id) ─────────────── */

type GoogleMapsAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type GoogleMapsPlace = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  address_components?: GoogleMapsAddressComponent[];
};

/**
 * Combines the business name with its formatted address so the field always
 * shows something to verify against. `formatted_address` alone is often
 * sparse for small/local establishment listings — sometimes barely more
 * than the name — so relying on it in isolation can leave the field
 * showing just "Kamal Productions" with no address at all. Guards against
 * duplicating the name when formatted_address already leads with it.
 */
function composeFullAddress(place: GoogleMapsPlace): string {
  const name = place.name?.trim();
  const address = place.formatted_address?.trim();
  if (!address) return name ?? "";
  if (!name || address.toLowerCase().startsWith(name.toLowerCase())) return address;
  return `${name}, ${address}`;
}

type GoogleAutocompleteInstance = {
  addListener: (event: string, handler: () => void) => void;
  getPlace: () => GoogleMapsPlace;
};

declare global {
  interface Window {
    google?: {
      maps: {
        places: {
          Autocomplete: new (
            input: HTMLInputElement,
            opts?: Record<string, unknown>,
          ) => GoogleAutocompleteInstance;
        };
      };
    };
  }
}

const PLACES_SCRIPT_ID = "google-places-script";

/**
 * Address input backed by the Google Places Autocomplete widget. As the
 * studio owner types, Google suggests matching businesses; selecting one
 * fills in the formatted address and hands back the `place_id`, which is
 * what powers the Google reviews link on delivery pages — no manual place
 * ID lookup required. Degrades to a plain text input if no
 * `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is configured, or while the script loads.
 */
export function AddressField({
  label = "Business address",
  value,
  onChange,
  onPlaceSelect,
  placeholder,
  className = "",
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  onPlaceSelect?: (place: { address: string; placeId: string; stateName?: string }) => void;
  placeholder?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<GoogleAutocompleteInstance | null>(null);
  // Lazy initializer so an already-loaded script (e.g. a second AddressField
  // on the page) doesn't need a synchronous setState from inside the effect.
  const [scriptReady, setScriptReady] = useState(
    () => typeof window !== "undefined" && !!window.google?.maps?.places,
  );

  useEffect(() => {
    if (scriptReady) return;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;
    const existing = document.getElementById(PLACES_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => setScriptReady(true));
      return;
    }
    // Classic bootstrap: `libraries=places` eagerly loads the Places library
    // alongside the core API, so it's available by the time `onload` fires —
    // no `loading=async` / `importLibrary` dance needed. Google still fully
    // supports this; it just logs a console suggestion to use the newer
    // async loader, which is harmless for a single settings-page widget.
    const script = document.createElement("script");
    script.id = PLACES_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => setScriptReady(true);
    document.head.appendChild(script);
  }, [scriptReady]);

  useEffect(() => {
    if (!scriptReady || !inputRef.current || autocompleteRef.current || !window.google?.maps?.places) return;
    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      fields: ["place_id", "name", "formatted_address", "address_components"],
      types: ["establishment"],
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const formatted = composeFullAddress(place) || inputRef.current?.value || "";
      onChange(formatted);
      if (place.place_id) {
        const stateName = place.address_components?.find((c) =>
          c.types.includes("administrative_area_level_1"),
        )?.long_name;
        onPlaceSelect?.({ address: formatted, placeId: place.place_id, stateName });
      }
    });
    autocompleteRef.current = autocomplete;
  }, [scriptReady, onChange, onPlaceSelect]);

  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-[var(--color-brand-muted)]">
        {label}
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="brand-focus h-10 w-full rounded-field border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60 focus:border-[var(--color-brand-outline)]"
      />
    </label>
  );
}

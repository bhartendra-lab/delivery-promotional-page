# Listing-portal marks

Official marks for the listing and review portals in `lib/social-platforms.ts`.
The Guest gallery draws them on a white circular chip at 28–36px.

| File | Portal | Status |
|---|---|---|
| `wedmegood.png` | WedMeGood | Live (`hasAsset: true`) |
| `justdial.png` | Justdial | Live (`hasAsset: true`) |
| `weddingbazaar.png` | WeddingBazaar | **Held back** (`hasAsset: false`, monogram). The file shows upscaling artefacts: a dark smudge inside the square and soft edges. Replace it with the copy from WeddingBazaar's own brand/press page, then flip the flag. |

## Where they come from

Each portal's own brand or press page. Never a screenshot, a search-result
image, or a redraw — these are third-party trademarks, and an approximation
ships someone else's mark in the wrong form to Guests.

## Requirements for every file

- **PNG, at least 120px on the long edge** (3× the largest chip). The chip is
  up to ~102 device pixels on a 3× phone, where most Guests see it; a smaller
  source looks soft.
- **Transparent background** where the portal provides one.
- **Tightly cropped to the mark, with no whitespace or transparent padding.**
  Padding is applied in code, per platform (`markInset`). A file that brings
  its own sits at a different visual size from its neighbours in the same row.
- Keep it reasonably light. These load on Guests' phones; a few hundred pixels
  on the long edge is plenty. (The two current files are ~1000px and several
  hundred KB — worth re-exporting smaller.)

## Naming

`<registry key>.png`, where the key is the platform's `key` in
`lib/social-platforms.ts` — lowercase, no separators (`wedmegood.png`, not
`wed-me-good.png`).

## Adding or replacing a mark

In the same change:

1. Commit the file here.
2. Set `hasAsset: true` on the platform in `lib/social-platforms.ts`.
3. Set its `brand` colour by sampling the PNG itself — the dominant colour of
   the mark, not of any background. Never from memory. (The brand colour shows
   on the monogram chip and the focus ring only.)
4. Check the chip at 30, 32 and 34px next to its neighbours, and tune
   `markInset` if the mark reads larger or smaller than the rest.

The colour and the file land together so they can never disagree. Until then
the chip renders a monogram, and a missing or broken file falls back to one at
runtime too.

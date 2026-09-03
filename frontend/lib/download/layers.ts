/**
 * Stacking order for the download surfaces.
 *
 * These have to sit above BOTH photo viewers, and the two viewers are nowhere
 * near each other numerically — the guest lightbox is `z-[70]` and the studio's
 * is `z-[210]`. A download can be started from inside either one (the lightbox
 * has its own download button), so a value picked to clear one of them silently
 * renders behind the other: the quality sheet at 90 cleared the guest viewer
 * and disappeared behind the studio's.
 *
 * Equal z-index is not good enough either. The modals portal to `document.body`
 * while the guest viewer renders inline, so at the same level the winner
 * depends on DOM order and on whether an ancestor happens to create a stacking
 * context — which is exactly the kind of thing that changes under an unrelated
 * layout edit and breaks this again.
 *
 * So: one place, numbers well clear of every existing overlay, and ordered
 * among themselves. Import these rather than writing a `z-[…]` class, so a grep
 * for the constant finds every surface that participates.
 */

/** The bulk pre-flight / progress modal. Above both photo viewers. */
export const Z_DOWNLOAD_MODAL = 300;

/** "Cancel this download?" — asked from inside the modal, so above it. */
export const Z_DOWNLOAD_CONFIRM = 310;

/**
 * The single-photo quality chooser. The topmost of the three: it is opened FROM
 * a photo viewer, and (unlike the pre-flight) can be opened while one is still
 * on screen.
 */
export const Z_QUALITY_SHEET = 320;

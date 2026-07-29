const CHECKOUT_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayInstance = {
  open: () => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
};

type RazorpayOptions = {
  key: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  subscription_id?: string;
  name: string;
  description: string;
  image?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color: string };
  handler: (response: { razorpay_payment_id: string }) => void;
  modal?: { ondismiss?: () => void; confirm_close?: boolean; escape?: boolean };
};

export type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let scriptPromise: Promise<RazorpayConstructor> | null = null;

/**
 * Loads https://checkout.razorpay.com/v1/checkout.js exactly once. Resolves
 * when window.Razorpay is available; rejects if the script fails (blocked,
 * offline). Callers fall back to `short_url` when available. Load lazily —
 * only on /checkout and when the UpgradeModal opens, never in the dashboard's
 * critical path.
 */
export function loadRazorpay(): Promise<RazorpayConstructor> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay can only be loaded in the browser"));
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT_URL}"]`);
    const script = existing ?? document.createElement("script");
    script.src = CHECKOUT_SCRIPT_URL;
    script.async = true;
    script.addEventListener(
      "load",
      () => {
        if (window.Razorpay) resolve(window.Razorpay);
        else reject(new Error("Razorpay script loaded but window.Razorpay is missing"));
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => {
        scriptPromise = null;
        reject(new Error("Failed to load the Razorpay checkout script"));
      },
      { once: true },
    );
    if (!existing) document.body.appendChild(script);
  });

  return scriptPromise;
}

export type OpenCheckoutArgs = {
  keyId: string;
  /** Mutually exclusive with subscriptionId at the call site. */
  orderId?: string;
  subscriptionId?: string;
  /** Display only when orderId is set — the server-issued order already carries the authoritative amount. */
  amountRupees?: number;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  onSuccess: (r: { razorpay_payment_id: string }) => void;
  onDismiss: () => void;
};

/** Opens Razorpay Checkout.js on either an order or a subscription mandate. */
export async function openCheckout(a: OpenCheckoutArgs): Promise<void> {
  const Razorpay = await loadRazorpay();

  const instance = new Razorpay({
    key: a.keyId,
    ...(a.orderId
      ? { order_id: a.orderId, amount: Math.round((a.amountRupees ?? 0) * 100), currency: "INR" }
      : { subscription_id: a.subscriptionId }),
    name: "Vyavasth",
    description: a.description,
    image: "/vyavasth-icon.svg",
    prefill: a.prefill,
    // Razorpay Checkout can't read CSS custom properties, so the accent is
    // hardcoded here — it must stay in sync with --color-brand-navy.
    theme: { color: "#C25A3A" },
    handler: (response) => a.onSuccess(response),
    modal: { ondismiss: a.onDismiss, confirm_close: true, escape: true },
  });

  instance.open();
}

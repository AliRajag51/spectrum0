import "server-only";

import { z } from "zod";
import { env } from "@/env";
import { CustomerFacingError } from "@/server/errors";

/* Transport for NVM Headless Core (`nvm/v1`).

   Every route is POST and gated on the `x-nvm-bridge-key` header, so the key
   never leaves the server and no bridge call can be made from a browser. The
   bridge is the only adapter allowed to hold a customer session: the Woo REST
   consumer key in `client.ts` is a store-wide credential and must never be
   used to answer "who is signed in". */

export class BridgeError extends CustomerFacingError {
  constructor(
    message: string,
    status: number,
    readonly code: string,
  ) {
    super(message, status);
    this.name = "BridgeError";
  }
}

const bridgeError = z.object({
  code: z.string(),
  message: z.string(),
  data: z.object({ status: z.number().int().optional() }).loose().optional(),
});

export type BridgeConfig = { baseUrl: string; key: string; timeoutMs: number };

export function bridgeConfig(): BridgeConfig | null {
  if (!env.WOOCOMMERCE_URL || !env.NVM_BRIDGE_KEY) return null;
  return {
    baseUrl: env.WOOCOMMERCE_URL,
    key: env.NVM_BRIDGE_KEY,
    timeoutMs: env.WOOCOMMERCE_API_TIMEOUT_MS,
  };
}

/** Whether customer accounts can be served at all. Drives the UI's empty state. */
export function accountsConfigured() {
  return bridgeConfig() !== null;
}

function bridgeUrl(baseUrl: string, route: string) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(`wp-json/nvm/v1/${route.replace(/^\//, "")}`, base);
  /* Credentials travel over plain HTTP only to a host that cannot be on the
     public internet: the loopback name, or a bare single-label name such as
     the `wordpress` service inside the local Docker network. */
  const internal = url.hostname === "localhost" || !url.hostname.includes(".");
  if (url.protocol !== "https:" && !internal) {
    throw new BridgeError(
      "Accounts require an HTTPS WordPress endpoint.",
      500,
      "nvm_insecure_endpoint",
    );
  }
  return url;
}

/** The routes that issue a storefront session (the agency contract, f1). */
export const SESSION_ROUTES: ReadonlySet<string> = new Set(["register", "signin", "redeem-auth", "facebook-signin"]);

/**
 * One bridge call.
 *
 * The bridge's own messages are written for customers, so a WP_Error body is
 * surfaced verbatim rather than replaced. Transport failures are not: they
 * would otherwise leak the upstream host into the browser.
 */
export async function bridgeRequest<T>(
  route: string,
  body: Record<string, unknown>,
  parse: (value: unknown) => T,
  options: {
    /** A shorter limit than the bridge's own, for calls that must not hold a page up. */
    timeoutMs?: number;
    /** Forward the visitor's privacy signals: Sec-GPC and the opt-out as `capi_optout`, nothing else. */
    /* `true` reads them from this request; an object carries ones read earlier,
       for a call made after the response (`after()`). */
    privacy?: boolean | Record<string, string>;
  } = {},
): Promise<T> {
  const config = bridgeConfig();
  if (!config) {
    throw new BridgeError(
      "Customer accounts are not connected yet.",
      503,
      "nvm_not_configured",
    );
  }
  const controller = new AbortController();
  // Every call that starts a storefront session runs WordPress's sign-up and
  // sign-in hooks (user_register, nvm_bridge_session_issued) within this
  // server request. The signed campaign snapshot is needed there; never
  // forward arbitrary cookies.
  const marketingHeaders: Record<string, string> =
    typeof options.privacy === "object" && options.privacy ? options.privacy : {};
  const timer = setTimeout(
    () => controller.abort(),
    Math.min(config.timeoutMs, options.timeoutMs ?? config.timeoutMs),
  );
  let response: Response;
  let text: string;
  try {
    response = await fetch(bridgeUrl(config.baseUrl, route), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-nvm-bridge-key": config.key,
        ...marketingHeaders,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    throw new BridgeError(
      error instanceof Error && error.name === "AbortError"
        ? "Your account service timed out. Please try again."
        : "Your account service could not be reached. Please try again shortly.",
      503,
      "nvm_unreachable",
    );
  } finally {
    clearTimeout(timer);
  }

  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new BridgeError(
        "Your account service returned an unreadable response.",
        502,
        "nvm_bad_json",
      );
    }
  }

  if (!response.ok) {
    const parsed = bridgeError.safeParse(payload);
    throw new BridgeError(
      parsed.success
        ? parsed.data.message
        : "That request could not be completed.",
      parsed.success
        ? (parsed.data.data?.status ?? response.status)
        : response.status,
      parsed.success ? parsed.data.code : "nvm_error",
    );
  }

  try {
    return parse(payload);
  } catch {
    throw new BridgeError(
      "Your account service returned an unexpected response.",
      502,
      "nvm_bad_shape",
    );
  }
}

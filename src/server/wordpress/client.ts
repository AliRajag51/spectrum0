import "server-only";

import { env } from "@/env";

export class WordPressRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "WordPressRequestError";
  }
}

type WooClientOptions = {
  baseUrl: string;
  consumerKey?: string;
  consumerSecret?: string;
  timeoutMs?: number;
};

export function joinUrl(baseUrl: string, path: string) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ""), base).toString();
}

function authHeader(key?: string, secret?: string) {
  if (!key || !secret) return undefined;
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}

export function createWooClient(options: WooClientOptions) {
  const timeoutMs = options.timeoutMs ?? env.WOOCOMMERCE_API_TIMEOUT_MS;
  return {
    async request<T>(
      path: string,
      init: RequestInit & { requestId?: string } = {},
      parse: (value: unknown) => T,
    ): Promise<T> {
      const { requestId, ...requestInit } = init;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers = new Headers(requestInit.headers);
        headers.set("accept", "application/json");
        const authorization = authHeader(
          options.consumerKey,
          options.consumerSecret,
        );
        if (authorization) headers.set("authorization", authorization);
        const response = await fetch(joinUrl(options.baseUrl, path), {
          ...requestInit,
          headers,
          signal: controller.signal,
          cache: "no-store",
        });
        const body = await response.text();
        let payload: unknown = null;
        if (body) {
          try {
            payload = JSON.parse(body) as unknown;
          } catch {
            throw new WordPressRequestError(
              "WordPress returned an invalid JSON response.",
              response.status,
              requestId,
            );
          }
        }
        if (!response.ok) {
          throw new WordPressRequestError(
            "The commerce service rejected the request.",
            response.status,
            requestId,
          );
        }
        return parse(payload);
      } catch (error) {
        if (error instanceof WordPressRequestError) throw error;
        throw new WordPressRequestError(
          error instanceof Error && error.name === "AbortError"
            ? "The commerce service timed out."
            : "The commerce service could not be reached.",
          503,
          requestId,
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/* `next build` starts every worker cold, and each one reads the catalogue and
   the lab reports at the same moment. Live WordPress, behind the agency's gate
   and Cloudflare, answered that pile-up slower than 5 s and failed the
   production deploy (Oct 26). A build can wait; a shopper cannot, so only the
   build gets the longer limit. */
export const BUILD_READ_TIMEOUT_MS = 20_000;

export const inProductionBuild = () => process.env.NEXT_PHASE === "phase-production-build";

/** The upstream read limit: the configured one, or the build's longer one. */
export function readTimeoutMs(configured: number = env.WOOCOMMERCE_API_TIMEOUT_MS) {
  return inProductionBuild() ? Math.max(configured, BUILD_READ_TIMEOUT_MS) : configured;
}

/* The catalogue uses the NVM bridge with the site URL and bridge key.
   The consumer key stays with `wooConfig()` for the `wc/v3` and plugin
   routes that still authenticate: orders, restock alerts, locations. */
export function wooStoreConfig() {
  if (!env.WOOCOMMERCE_URL) return null;
  return {
    baseUrl: env.WOOCOMMERCE_URL,
    timeoutMs: readTimeoutMs(),
  };
}

/* The bridge key on Store API calls. With the store's access gate closed,
   WordPress refuses anonymous catalogue and cart reads; NVM Headless Core
   (2.4.0+) admits the storefront server on the strength of this header. With
   the gate open, or on an older bridge, it is simply ignored. */
export function storeApiHeaders(): Record<string, string> {
  return env.NVM_BRIDGE_KEY ? { "x-nvm-bridge-key": env.NVM_BRIDGE_KEY } : {};
}

export function wooConfig() {
  if (
    !env.WOOCOMMERCE_URL ||
    !env.WOOCOMMERCE_CONSUMER_KEY ||
    !env.WOOCOMMERCE_CONSUMER_SECRET
  ) {
    return null;
  }
  return {
    baseUrl: env.WOOCOMMERCE_URL,
    consumerKey: env.WOOCOMMERCE_CONSUMER_KEY,
    consumerSecret: env.WOOCOMMERCE_CONSUMER_SECRET,
    timeoutMs: env.WOOCOMMERCE_API_TIMEOUT_MS,
  };
}

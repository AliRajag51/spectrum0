import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import type { ContactInput, NewsletterInput } from "@/lib/forms";
import { contactInput, newsletterInput } from "@/lib/forms";
import { CustomerFacingError } from "@/server/errors";
import {
  bridgeConfig,
  bridgeRequest,
  BridgeError,
} from "@/server/wordpress/bridge";

const contactAnswer = z.object({ status: z.literal("sent") });
const subscribeAnswer = z.object({ status: z.literal("queued") });

function fingerprint(caller: string) {
  const config = bridgeConfig();
  if (!config)
    throw new CustomerFacingError("Forms are not connected yet.", 503);
  return createHmac("sha256", config.key).update(caller).digest("hex");
}

function friendlyBridgeFailure(error: unknown, fallback: string): never {
  if (error instanceof BridgeError && [400, 429].includes(error.status))
    throw error;
  throw new CustomerFacingError(fallback, 503);
}

export async function sendContactMessage(input: ContactInput, caller: string) {
  const value = contactInput.parse(input);
  try {
    await bridgeRequest(
      "site/contact",
      {
        name: value.name,
        email: value.email,
        subject: value.subject,
        message: value.message,
        website: value.website,
        turnstile_token: value.turnstileToken,
        client_key: fingerprint(caller),
        idempotency_key: randomUUID(),
      },
      (answer) => contactAnswer.parse(answer),
    );
    return { status: "sent" as const };
  } catch (error) {
    friendlyBridgeFailure(
      error,
      "We couldn't send your message. Please try again shortly.",
    );
  }
}

export async function subscribeNewsletter(
  input: NewsletterInput,
  caller: string,
) {
  const value = newsletterInput.parse(input);
  try {
    await bridgeRequest(
      "site/subscribe",
      {
        email: value.email,
        locale: value.locale,
        source: value.source,
        client_key: fingerprint(caller),
        idempotency_key: randomUUID(),
      },
      (answer) => subscribeAnswer.parse(answer),
    );
    return {
      status: "subscribed" as const,
      message:
        value.locale === "es"
          ? "Revisa tu correo para recibir tu oferta de bienvenida."
          : "Check your email for your welcome offer.",
    };
  } catch (error) {
    friendlyBridgeFailure(
      error,
      "We couldn't subscribe you. Please try again shortly.",
    );
  }
}

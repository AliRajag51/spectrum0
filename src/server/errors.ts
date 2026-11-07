import "server-only";

/**
 * An error whose message is written for the customer.
 *
 * Domain services stay free of transport vocabulary, so they raise this and the
 * tRPC layer turns the status into the right code. Anything that is not one of
 * these is a fault the customer cannot act on and stays a generic 500.
 */
export class CustomerFacingError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "CustomerFacingError";
  }
}

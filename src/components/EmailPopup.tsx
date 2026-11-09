"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Bell, Check, FlaskConical, Mail, PackageCheck, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type CSSProperties, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTRPC } from "@/trpc/react";
import styles from "./EmailPopup.module.css";

/* Ported from Omega Peptides' research-updates card, in Spectrum's palette.
   Signups go through the existing `newsletter.subscribe` route to WordPress,
   where Spectrum Commerce keeps them as private subscriber records. */

/** The research-use gate's own flag; the gate reloads the page once it is set. */
const GATE_KEY = "spectrum-researcher-verified-v1";
const OPENED_KEY = "spectrum:newsletter-opened:v1"; // per session
const SUBSCRIBED_KEY = "spectrum:newsletter-subscribed:v1"; // per browser

/* Seconds after the gate clears before the card offers itself. */
const AUTO_OPEN_DELAY_MS = 14000;

/* Never interrupt a purchase in progress. */
const QUIET_ROUTES = ["/cart", "/checkout", "/account"];

const VIALS = [
  { src: "/products/BPC-157.webp", tilt: -12, delay: 0 },
  { src: "/products/tb-500.webp", tilt: 12, delay: -2.1 },
] as const;

const read = (storage: () => Storage, key: string) => {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
};
const write = (storage: () => Storage, key: string) => {
  try {
    storage().setItem(key, "true");
  } catch {
    // Private mode: the card simply behaves as a first visit next time.
  }
};
const local = () => window.localStorage;
const session = () => window.sessionStorage;

let openedInMemory = false;

export default function EmailPopup() {
  const pathname = usePathname();
  const trpc = useTRPC();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [subscribed, setSubscribed] = useState(true); // until storage is read
  const [error, setError] = useState("");
  const quiet = QUIET_ROUTES.some((route) => pathname?.startsWith(route));

  const subscribe = useMutation(
    trpc.newsletter.subscribe.mutationOptions({
      onSuccess: () => {
        write(local, SUBSCRIBED_KEY);
        setSubscribed(true);
      },
      onError: (failure) => setError(failure.message || "We couldn't add that address. Try again in a moment."),
    }),
  );

  const show = useCallback(() => {
    openedInMemory = true;
    write(session, OPENED_KEY);
    setOpen(true);
  }, []);

  useEffect(() => {
    setSubscribed(read(local, SUBSCRIBED_KEY) === "true");
  }, []);

  /* One unprompted opening per session, only once the gate is out of the way. */
  useEffect(() => {
    if (quiet || subscribed || openedInMemory || read(session, OPENED_KEY) === "true") return;
    if (read(local, GATE_KEY) !== "accepted") return;
    const timer = window.setTimeout(show, AUTO_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [quiet, subscribed, show]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (subscribe.isPending) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    // A bot fills every field; a person never sees this one.
    if (String(data.get("company") ?? "")) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      inputRef.current?.focus();
      return;
    }
    if (data.get("consent") !== "yes") {
      setError("Tick the box to agree to receive research updates by email.");
      return;
    }
    setError("");
    subscribe.mutate({ email, source: "popup", locale: "en" });
  };

  if (quiet) return null;
  const done = subscribe.isSuccess;

  return (
    <>
      {!open && !subscribed && (
        <button className={styles.tab} type="button" onClick={show} aria-haspopup="dialog">
          <Mail aria-hidden="true" size={20} strokeWidth={1.7} />
          <span className="sr-only">Research updates</span>
        </button>
      )}

      <div
        aria-hidden={!open}
        className={`${styles.overlay} ${open ? styles.overlayOpen : ""}`}
        inert={!open}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <section aria-labelledby="email-popup-title" aria-modal="true" className={styles.card} role="dialog">
          <button className={styles.close} type="button" aria-label="Close" onClick={() => setOpen(false)}>
            <X aria-hidden="true" size={20} strokeWidth={1.6} />
          </button>

          <div className={styles.hero} aria-hidden="true">
            {VIALS.map((vial, index) => (
              <span
                key={vial.src}
                className={`${styles.vial} ${index === 0 ? styles.vialLeft : styles.vialRight}`}
                style={{ "--tilt": `${vial.tilt}deg`, animationDelay: `${vial.delay}s` } as CSSProperties}
              >
                <Image alt="" src={vial.src} width={240} height={240} sizes="72px" draggable={false} />
              </span>
            ))}
          </div>

          {done ? (
            <div className={styles.done}>
              <span className={styles.doneMark}>
                <Check aria-hidden="true" size={18} strokeWidth={3} />
              </span>
              <h2 id="email-popup-title">
                You’re on the <em>list.</em>
              </h2>
              <p className={styles.copy}>New compounds, restocks and offers will reach your inbox first.</p>
            </div>
          ) : (
            <>
              <div className={styles.headline}>
                <span className={styles.chip}>
                  <i>
                    <FlaskConical size={12} />
                  </i>
                  New Compounds
                </span>
                <span className={styles.chip}>
                  <i>
                    <PackageCheck size={12} />
                  </i>
                  Restock Alerts
                </span>
                <h2 id="email-popup-title">
                  Join Our <em>Research Updates</em>
                </h2>
                <span className={styles.chip}>
                  <i>
                    <Bell size={12} />
                  </i>
                  Exclusive Offers
                </span>
              </div>
              <p className={styles.copy}>Be the first to know about new compounds, restocks, and exclusive offers.</p>

              <form className={styles.form} onSubmit={submit} noValidate>
                <label className={styles.field}>
                  <Mail aria-hidden="true" size={18} strokeWidth={1.6} />
                  <span className="sr-only">Email address</span>
                  <input
                    ref={inputRef}
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="Enter your email address"
                    required
                    onChange={() => error && setError("")}
                  />
                </label>
                <label className={styles.consent}>
                  <input type="checkbox" name="consent" value="yes" required onChange={() => error && setError("")} />
                  <span>
                    I agree to receive research updates, restock alerts and offers from Spectrum Biosciences by
                    email. I can unsubscribe at any time. See our <Link href="/privacy-policy">Privacy Policy</Link>.
                  </span>
                </label>
                <input className={styles.trap} name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                <button className={styles.submit} type="submit" disabled={subscribe.isPending}>
                  {subscribe.isPending ? "Subscribing" : "Subscribe"}
                  <ArrowRight aria-hidden="true" size={17} />
                </button>
              </form>
              <p className={error ? styles.error : styles.fine} role={error ? "alert" : undefined}>
                {error || "No spam. Unsubscribe anytime."}
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}

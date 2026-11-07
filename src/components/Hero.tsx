"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import AOS from "aos";
import "aos/dist/aos.css";
import {
  ArrowUpRight,
  ArrowRight,
  FlaskConical,
  ShieldCheck,
  Microscope,
} from "lucide-react";

import { useProducts } from "@/components/providers/ProductsProvider";
import type { StorefrontProduct } from "@/lib/storefront";

const features = [
  { icon: FlaskConical, title: "Research", subtitle: "Focused" },
  { icon: ShieldCheck, title: "Quality", subtitle: "Standards" },
  { icon: Microscope, title: "Scientific", subtitle: "Exploration" },
];

function HeroHeadings() {
  return (
    <div className="relative z-10 grid grid-cols-2 gap-2 px-3 pt-8 pb-4 sm:gap-4 sm:px-8 sm:pt-12 lg:px-14 lg:pt-16">
      <div data-aos="fade-right" className="min-w-0">
        <h1 id="hero-title" className="flex flex-col items-start">
          <span className="font-heading text-text text-[clamp(17px,4vw,25px)] leading-[1.15] font-bold tracking-[-0.06em] italic lg:text-[clamp(25px,2.3vw,34px)]">
            Define Your
          </span>
          <span className="font-heading text-primary text-[clamp(27px,6.4vw,52px)] leading-none font-extrabold tracking-[-0.08em] sm:text-[clamp(38px,5.8vw,60px)] lg:text-[clamp(48px,4.8vw,72px)]">
            RESEARCH
          </span>
        </h1>
      </div>

      <div data-aos="fade-left" className="min-w-0 text-right">
        <h2 className="flex flex-col items-end">
          <span className="font-heading text-text text-[clamp(17px,4vw,25px)] leading-[1.15] font-bold tracking-[-0.06em] italic lg:text-[clamp(25px,2.3vw,34px)]">
            Own Your
          </span>
          <span className="font-heading text-primary text-[clamp(27px,6.4vw,52px)] leading-none font-extrabold tracking-[-0.08em] sm:text-[clamp(38px,5.8vw,60px)] lg:text-[clamp(48px,4.8vw,72px)]">
            DISCOVERY
          </span>
        </h2>
      </div>
    </div>
  );
}

function HeroProduct({
  desktop = false,
  product,
}: {
  desktop?: boolean;
  product?: StorefrontProduct;
}) {
  const image = product?.image || "/assets/5-amino-hero.png";

  return (
    <div
      className={
        desktop
          ? "pointer-events-none absolute top-1/2 left-1/2 z-20 hidden w-[clamp(200px,23vw,300px)] -translate-x-1/2 -translate-y-1/2 lg:block"
          : "pointer-events-none relative z-20 mx-auto -mb-80 w-[190px] sm:-mb-[150px] sm:w-[250px] md:-mb-120 md:w-[280px] lg:hidden"
      }
    >
      <div data-aos="zoom-in-up" data-aos-duration="1100">
        <Image
          src={image}
          alt={`${product?.name || "Spectrum Biosciences"} research product`}
          width={500}
          height={700}
          priority
          sizes={
            desktop
              ? "(max-width: 1280px) 250px, 300px"
              : "(max-width: 640px) 190px, (max-width: 1024px) 280px"
          }
          className="product-float h-auto w-full object-contain drop-shadow-[0_25px_30px_rgba(40,0,45,0.25)]"
        />
      </div>
    </div>
  );
}

function HeroIntro() {
  return (
    <div data-aos="fade-up" className="relative z-10 max-w-[390px]">
      <span className="mb-3 inline-block font-sans text-[11px] font-semibold tracking-[0.2em] text-white/75 uppercase">
        Welcome to Spectrum
      </span>
      <h3 className="font-heading text-[clamp(29px,3vw,43px)] leading-[1.12] font-semibold tracking-[-0.055em] text-white">
        Where Science
        <br />
        Meets Discovery
      </h3>
      <p className="text-md mt-4 max-w-[340px] font-sans text-white/80">
        Explore a new standard in research peptides, where scientific curiosity
        meets a commitment to quality and precision.
      </p>
      <Link
        href="/shop"
        className="group bg-primary hover:bg-primary-dark mt-6 inline-flex items-center gap-4 rounded-full px-5 py-2.5 font-sans text-[13px] font-semibold text-white transition-all duration-300"
      >
        Explore Collection
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-300 group-hover:rotate-45">
          <ArrowUpRight size={17} />
        </span>
      </Link>
      {/* <div className="mt-7 flex items-center gap-3">
        <div className="flex -space-x-2">
          {["01", "02", "03"].map((item) => (
            <span
              key={item}
              className="font-heading text-primary flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#A35DB5] bg-[#F5E8F7] text-[10px] font-bold"
            >
              {item}
            </span>
          ))}
        </div>
        <div>
          <p className="font-sans text-[12px] font-semibold text-white">
            Research-focused products
          </p>
          <p className="font-sans text-[11px] text-white/65">
            Explore the Spectrum collection
          </p>
        </div>
      </div> */}
    </div>
  );
}

function HeroFeatures() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {features.map((feature) => {
        const Icon = feature.icon;
        return (
          <div
            key={feature.title}
            className="group flex flex-col items-center text-center"
          >
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-white backdrop-blur-md transition-all duration-300 group-hover:-translate-y-1 group-hover:bg-white/25 sm:h-14 sm:w-14">
              <Icon size={26} strokeWidth={1.7} />
            </div>
            <h4 className="font-heading text-[13px] leading-tight font-semibold text-white sm:text-[15px]">
              {feature.title}
            </h4>
            <p className="mt-1 font-sans text-[12px] leading-tight text-white/80 sm:text-[13px]">
              {feature.subtitle}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function FeaturedProduct({ product }: { product?: StorefrontProduct }) {
  if (!product) return null;

  const variant = product.variants[product.defaultVariant];

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group relative mt-5 flex w-full items-center gap-4 overflow-hidden rounded-[22px] border border-white/25 bg-white/15 p-3 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/40 hover:bg-white/20 hover:shadow-[0_20px_45px_rgba(40,0,50,0.15)] sm:gap-5 sm:p-4"
    >
      <div className="relative h-[125px] w-[105px] shrink-0 overflow-hidden rounded-[16px] bg-white/15 sm:h-[145px] sm:w-[125px]">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 105px, 125px"
            className="object-cover drop-shadow-[0_10px_15px_rgba(35,0,40,0.2)] transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <FlaskConical size={45} className="text-white/50" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <span className="bg-secondary inline-flex rounded-full px-3 py-1 font-sans text-[9px] font-bold tracking-[0.1em] text-white uppercase sm:text-[10px]">
          {product.badge || "Featured Product"}
        </span>

        <h4 className="font-heading mt-2 text-[17px] leading-tight font-semibold tracking-[-0.04em] text-white">
          {product.name}
        </h4>

        <p className="mt-1 font-sans text-[12px] leading-relaxed text-white/75 sm:text-[13px]">
          {variant?.label || "Research Product"} · Research Use Only
        </p>

        <span className="mt-3 inline-flex items-center gap-2 font-sans text-[12px] font-semibold text-white sm:text-[13px]">
          Discover Product
          <ArrowRight
            size={16}
            className="transition-transform duration-300 group-hover:translate-x-1"
          />
        </span>
      </div>
    </Link>
  );
}

export default function Hero() {
  const products = useProducts();
  const featuredProduct =
    products.find((product) => product.badge === "Featured") || products[0];

  useEffect(() => {
    AOS.init({
      duration: 900,
      easing: "ease-out-cubic",
      once: true,
      offset: 30,
    });
    AOS.refresh();
  }, []);

  return (
    <section
      aria-labelledby="hero-title"
      className="relative w-full bg-white px-3 py-4 sm:px-5 sm:py-5 lg:px-6"
    >
      <div className="relative mx-auto w-full max-w-7xl">
        <HeroHeadings />
        <div className="relative lg:hidden">
          <HeroProduct />
        </div>
        <div className="relative rounded-[28px] bg-[linear-gradient(115deg,#AD43B5_0%,#92269D_45%,#790087_100%)] px-5 pt-86 pb-9 sm:rounded-[36px] sm:px-10 sm:pt-44 sm:pb-12 md:pt-128 lg:px-14 lg:py-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 h-[250px] w-[250px] rounded-full bg-white/10 blur-[90px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 bottom-0 h-[300px] w-[300px] rounded-full bg-[#D763D5]/20 blur-[90px]"
          />
          <div className="relative z-10 grid grid-cols-1 gap-10 sm:grid-cols-2 sm:items-start sm:gap-8 lg:items-center lg:gap-14">
            <HeroIntro />
            <div
              data-aos="fade-up"
              data-aos-delay="150"
              className="relative z-10 flex w-full min-w-0 flex-col items-center lg:items-end lg:pl-12 xl:pl-16"
            >
              <div className="mx-auto w-full max-w-[350px] lg:mx-0">
                <HeroFeatures />
                <FeaturedProduct product={featuredProduct} />
              </div>
            </div>
          </div>
        </div>
        <HeroProduct desktop />
      </div>
    </section>
  );
}

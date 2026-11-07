import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type LegalSection = {
  title: string;
  paragraphs?: string[];
  items?: string[];
};

type LegalPageProps = {
  title: string;
  description?: string;
  sections: LegalSection[];
};

export default function LegalPage({ title, sections }: LegalPageProps) {
  return (
    <main className="min-h-screen bg-white">
      <section className="px-5 pt-6 sm:px-8">
        <div className="mx-auto flex min-h-[180px] max-w-6xl items-center justify-center rounded-[24px] bg-[linear-gradient(115deg,#35143E_0%,#55205F_55%,#843C83_100%)] px-6 py-12 text-center">
          <h1 className="font-heading text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
            {title}
          </h1>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="space-y-10">
          {sections.map((section, index) => (
            <section
              key={section.title}
              aria-labelledby={`legal-section-${index}`}
            >
              <h2
                id={`legal-section-${index}`}
                className="font-heading text-primary mb-4 text-xl font-semibold sm:text-2xl"
              >
                {section.title}
              </h2>
              <div className="space-y-4">
                {section.paragraphs?.map((paragraph, i) => (
                  <p key={i} className="text-md font-sans text-[#655B69]">
                    {paragraph}
                  </p>
                ))}
                {section.items && (
                  <ul className="list-disc space-y-2 pl-5">
                    {section.items.map((item, i) => (
                      <li key={i} className="text-md font-sans text-[#655B69]">
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

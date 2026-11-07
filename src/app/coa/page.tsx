import type { Metadata } from "next";
import CoALibrary from "@/components/coa/CoALibrary";
import { getLabReports } from "@/server/lab-reports";

export const metadata: Metadata = {
  title: "Certificates of Analysis | Spectrum Biosciences",
  description: "Browse available batch-specific Certificates of Analysis for Spectrum Biosciences research products.",
};

export default async function CoAPage() {
  const { reports } = await getLabReports();
  return <CoALibrary reports={reports} />;
}

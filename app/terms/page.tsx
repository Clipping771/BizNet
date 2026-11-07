import { LegalPage } from "@/components/marketing/LegalPage";

export default function TermsPage() {
  return <LegalPage titleKey="legal.terms.title" sections={["legal.terms.s1", "legal.terms.s2", "legal.terms.s3", "legal.terms.s4", "legal.terms.s5"]} />;
}

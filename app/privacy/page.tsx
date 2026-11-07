import { LegalPage } from "@/components/marketing/LegalPage";

export default function PrivacyPage() {
  return <LegalPage titleKey="legal.privacy.title" sections={["legal.privacy.s1", "legal.privacy.s2", "legal.privacy.s3", "legal.privacy.s4"]} />;
}

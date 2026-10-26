import { getRequestConfig } from "next-intl/server";
import { getTranslations } from "@/lib/i18n";
import { cookies } from "next/headers";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = cookieStore.get("biznet_lang")?.value || "bn";
  const messages = await getTranslations(locale);

  return {
    locale,
    messages,
  };
});

import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { isLocale, LOCALE_COOKIE, defaultLocale } from "./config";
import { loadMessages } from "./load-messages";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale)
    ? cookieLocale
    : defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
  };
});

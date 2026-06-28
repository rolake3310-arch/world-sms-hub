import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicSettings } from "@/lib/sms.functions";

/**
 * Returns a formatter function `fmt(usdAmount)` that converts and displays
 * the value in the site currency (USD or NGN) based on admin settings.
 */
export function useCurrency() {
  const getSettings = useServerFn(getPublicSettings);
  const { data } = useQuery({
    queryKey: ["public-settings"],
    queryFn: () => getSettings(),
    staleTime: 60_000,
  });

  const currency: string = (data?.settings as any)?.site_currency ?? "USD";
  const rate: number = Number((data?.settings as any)?.usd_to_ngn ?? 1600);

  function fmt(usd: number, decimals?: number): string {
    if (currency === "NGN") {
      const ngn = usd * rate;
      const d = decimals ?? (ngn < 10 ? 2 : 0);
      return `₦${ngn.toLocaleString("en-NG", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
    }
    const d = decimals ?? (usd < 1 ? 4 : 2);
    return `$${usd.toFixed(d)}`;
  }

  function fmtLabel(usd: number): string {
    return fmt(usd);
  }

  return { fmt, currency, rate, symbol: currency === "NGN" ? "₦" : "$" };
}

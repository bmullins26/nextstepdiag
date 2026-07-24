import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyEntitlements, type Entitlements } from "@/lib/billing.functions";

export function useEntitlements() {
  const fn = useServerFn(getMyEntitlements);
  return useQuery<Entitlements>({
    queryKey: ["my-entitlements"],
    queryFn: () => fn(),
    staleTime: 30_000,
  });
}
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "../lib/wagmi";
import { MarketTypeProvider } from "./marketType";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Chain/market data is short-lived; refetch on focus keeps balances fresh.
      staleTime: 10_000,
      retry: 1,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <MarketTypeProvider>{children}</MarketTypeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

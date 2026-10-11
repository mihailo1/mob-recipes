"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
        // Always attempt the request, even when the browser reports offline:
        // the service worker may answer it from its cache.
        networkMode: "offlineFirst",
      },
    },
  });
}

export default function Providers({ children }) {
  // One client per browser session (per request on the server).
  const [client] = useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

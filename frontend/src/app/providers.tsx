import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#00b47d",
          colorInfo: "#00b47d",
          colorLink: "#008f68",
          borderRadius: 6,
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
        components: {
          Layout: {
            bodyBg: "#f4f7f5",
            headerBg: "#ffffff",
            siderBg: "#16171a",
          },
          Menu: {
            darkItemBg: "#16171a",
            darkItemColor: "#b7c4be",
            darkItemHoverBg: "rgba(255, 255, 255, 0.08)",
            darkItemHoverColor: "#ffffff",
            darkItemSelectedBg: "#00b47d",
            darkItemSelectedColor: "#071f17",
          },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConfigProvider>
  );
}

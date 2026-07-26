import type { ReactNode } from "react";
import "./animations.css";
import NetworkBanner from "../components/NetworkBanner";

export const metadata = { title: "WorkloadGovernor" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NetworkBanner />
        <main>{children}</main>
      </body>
    </html>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AKYMUN'26 Zonguldak",
  description: "AK Youth Model United Nations Zonguldak 2026 başvuru",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}

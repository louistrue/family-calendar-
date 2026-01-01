export const metadata = {
  title: 'Family Calendar API',
  description: 'ICS aggregation API for family calendar display',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

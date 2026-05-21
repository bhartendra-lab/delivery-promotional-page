export default function ClientGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex min-h-screen flex-col">{children}</div>;
}

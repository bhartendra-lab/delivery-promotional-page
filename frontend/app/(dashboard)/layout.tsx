import { ReferralCapture } from "@/components/onboarding/ReferralCapture";

export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <ReferralCapture />
      {children}
    </div>
  );
}

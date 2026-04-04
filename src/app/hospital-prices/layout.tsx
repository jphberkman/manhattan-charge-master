import { Navbar } from "@/components/hospital-prices/Navbar";
import { EditModeProvider } from "@/lib/contexts/edit-mode-context";
import { EditModeToggle } from "@/components/hospital-prices/EditModeToggle";
import { EditableFooter } from "@/components/hospital-prices/EditableFooter";

export default function HospitalPricesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <EditModeProvider>
      <div className="flex min-h-screen flex-col bg-[#0a0820]">
        <EditModeToggle />
        <Navbar />
        <main className="flex-1">{children}</main>
        <EditableFooter />
      </div>
    </EditModeProvider>
  );
}

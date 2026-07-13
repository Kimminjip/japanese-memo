import { Link, useLocation } from "wouter";
import { BookOpen, Layers, PlusCircle, Gamepad2, AlertTriangle, Menu, GraduationCap, BarChart3 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: BookOpen },
  { href: "/cards", label: "카드 목록", icon: Layers },
  { href: "/add", label: "추가하기", icon: PlusCircle },
  { href: "/study", label: "공부하기", icon: GraduationCap },
  { href: "/quiz", label: "퀴즈", icon: Gamepad2 },
  { href: "/stats", label: "학습 통계", icon: BarChart3 },
  { href: "/weak", label: "취약 항목", icon: AlertTriangle },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  const NavLinks = () => (
    <nav className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href}>
            <div
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                isActive
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </div>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Nav */}
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-card sticky top-0 z-40 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link href="/" className="flex items-center gap-2 text-primary font-serif font-bold text-xl">
          <BookOpen className="h-6 w-6" />
          <span>日本語勉強</span>
        </Link>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[240px] bg-sidebar border-r-0" showOverlay={false}>
            <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2 text-primary font-serif font-bold text-xl mb-8 mt-4">
              <BookOpen className="h-6 w-6" />
              <span>日本語勉強</span>
            </Link>
            <NavLinks />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 flex-col bg-sidebar border-r border-sidebar-border p-4 h-screen sticky top-0">
        <Link href="/" className="flex items-center gap-2 text-primary font-serif font-bold text-2xl mb-8 mt-4 px-2">
          <BookOpen className="h-7 w-7" />
          <span>日本語勉強</span>
        </Link>
        <NavLinks />
      </div>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}

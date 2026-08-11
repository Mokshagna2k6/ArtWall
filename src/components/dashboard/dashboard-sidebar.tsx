"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Image,
  FolderOpen,
  MapPin,
  Users,
  CreditCard,
  FileText,
  BarChart3,
  DoorOpen,
  User,
  Settings,
  Calendar,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Menu,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { duration, ease } from "@/lib/motion";

interface NavSection {
  title: string;
  items: NavItem[];
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const navigation: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Insights", href: "/dashboard/insights", icon: BarChart3 },
      { label: "Calendar", href: "/dashboard/calendar", icon: Calendar },
    ],
  },
  {
    title: "Artwork",
    items: [
      { label: "All Artwork", href: "/dashboard/artwork", icon: Image },
      { label: "Collections", href: "/dashboard/collections", icon: FolderOpen },
      { label: "Exhibitions", href: "/dashboard/exhibitions", icon: Sparkles },
      { label: "Locations", href: "/dashboard/locations", icon: MapPin },
    ],
  },
  {
    title: "Network",
    items: [
      { label: "Contacts", href: "/dashboard/contacts", icon: Users },
      { label: "Private Rooms", href: "/dashboard/rooms", icon: DoorOpen },
    ],
  },
  {
    title: "Sales & Docs",
    items: [
      { label: "Pipeline", href: "/dashboard/sales/pipeline", icon: CreditCard },
      { label: "Invoices", href: "/dashboard/sales/invoices", icon: FileText },
      { label: "Documents", href: "/dashboard/documents", icon: FileText },
      { label: "Reports", href: "/dashboard/reports", icon: BarChart3 },
    ],
  },
];

const bottomNav: NavItem[] = [
  { label: "My Profile", href: "/dashboard/profile", icon: User },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    Overview: true,
    Artwork: true,
    Network: true,
    "Sales & Docs": true,
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSection = (title: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="border-border flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="font-heading text-xl font-semibold tracking-tight">
            ArtWall
          </span>
          <span className="text-muted-foreground text-xs">Studio</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navigation.map((section) => (
          <div key={section.title} className="mb-4">
            <button
              onClick={() => toggleSection(section.title)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              {section.title}
              {expandedSections[section.title] ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
            </button>

            <AnimatePresence>
              {expandedSections[section.title] && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: duration.fast, ease: ease.standard }}
                  className="overflow-hidden"
                >
                  <ul className="space-y-0.5 pt-1">
                    {section.items.map((item) => {
                      const active = isActive(item.href);
                      const Icon = item.icon;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={cn(
                              "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                              active
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                            )}
                          >
                            <Icon
                              className={cn(
                                "size-4 shrink-0 transition-colors",
                                active
                                  ? "text-primary"
                                  : "text-muted-foreground group-hover:text-foreground"
                              )}
                            />
                            <span className="flex-1">{item.label}</span>
                            {item.badge && (
                              <span className="bg-primary text-primary-foreground text-xs rounded-full px-2 py-0.5">
                                {item.badge}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </nav>

      {/* Bottom Navigation */}
      <div className="border-border space-y-1 border-t px-3 py-4">
        {bottomNav.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-50 inline-flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-md md:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      {/* Desktop Sidebar */}
      <aside className="hidden dark md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:border-r md:border-border md:bg-card">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: duration.fast }}
              className="fixed inset-0 z-50 bg-black/50 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: duration.moderate, ease: ease.standard }}
              className="fixed inset-y-0 left-0 z-50 w-72 bg-card shadow-xl md:hidden"
            >
              <div className="flex h-16 items-center justify-between border-b border-border px-6">
                <span className="font-heading text-lg font-semibold">Menu</span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
                  aria-label="Close menu"
                >
                  <X className="size-5" />
                </button>
              </div>
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
  className?: string;
}

/**
 * ArtWall 2.0 Dashboard Layout
 *
 * Professional art-management platform layout with:
 * - Fixed left sidebar navigation (256px desktop)
 * - Sticky top header (64px)
 * - Scrollable content area with light background
 * - Mobile-responsive with slide-out menu
 *
 * Apply the `dashboard-theme` class to get the light professional SaaS styling
 * while keeping the existing dark theme for public/marketing pages.
 */
export function DashboardLayout({ children, className }: DashboardLayoutProps) {
  return (
    <div className={cn("dashboard-theme min-h-screen", className)}>
      {/* Sidebar and main content will be composed in individual dashboard pages */}
      {children}
    </div>
  );
}

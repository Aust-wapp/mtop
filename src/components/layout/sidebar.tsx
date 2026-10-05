"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { usePermissions } from "@/lib/hooks/use-permissions"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import {
  Bike,
  LayoutDashboard,
  FileText,
  AlertTriangle,
  BarChart3,
  Users,
  Settings,
  Building2,
  Printer,
  ContactRound,
} from "lucide-react"

interface NavItem {
  title: string
  href: string
  icon: React.ElementType
  permissions?: string[]
}

const navItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Applications", href: "/dashboard/applications", icon: FileText },
  {
    title: "MTOP Operators",
    href: "/dashboard/operators",
    icon: ContactRound,
  },
  {
    title: "Negative List",
    href: "/dashboard/negative-list",
    icon: AlertTriangle,
    permissions: ["negative_list.manage"],
  },
  {
    title: "Reports",
    href: "/dashboard/reports",
    icon: BarChart3,
    permissions: ["reports.view"],
  },
]

const adminItems: NavItem[] = [
  {
    title: "Users",
    href: "/dashboard/admin/users",
    icon: Users,
    permissions: ["admin.manage"],
  },
  {
    title: "Associations",
    href: "/dashboard/admin/associations",
    icon: Building2,
    permissions: ["admin.manage"],
  },
  {
    title: "Printable Forms",
    href: "/dashboard/admin/printable-forms",
    icon: Printer,
    permissions: ["admin.manage"],
  },
  {
    title: "Settings",
    href: "/dashboard/admin/settings",
    icon: Settings,
    permissions: ["admin.manage"],
  },
]

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname()
  const isActive =
    item.href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(item.href)

  return (
    <SidebarMenuItem>
      <Link
        href={item.href}
        className={cn(
          "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all relative",
          isActive
            ? "bg-white/8 text-white"
            : "text-white/55 hover:bg-white/5 hover:text-white/90"
        )}
      >
        {/* Amber active indicator */}
        <span
          className={cn(
            "absolute left-0 inset-y-1.5 w-0.5 rounded-r-full transition-all",
            isActive ? "bg-amber-400 opacity-100" : "opacity-0"
          )}
        />
        <item.icon
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            isActive
              ? "text-amber-400"
              : "text-white/40 group-hover:text-white/70"
          )}
        />
        <span>{item.title}</span>
      </Link>
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  const { canAny } = usePermissions()

  const filteredNavItems = navItems.filter(
    (item) => !item.permissions || canAny(...item.permissions)
  )
  const filteredAdminItems = adminItems.filter(
    (item) => !item.permissions || canAny(...item.permissions)
  )

  return (
    <Sidebar>
      {/* Logo */}
      <SidebarHeader>
        <div className="flex h-14 items-center gap-3 border-b border-white/8 px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 ring-1 ring-amber-400/30">
            <Bike className="h-4 w-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-white tracking-wide">
              MTOP
            </p>
            <p className="truncate text-[10px] leading-tight text-white/40 tracking-wide">
              Ozamiz City
            </p>
          </div>
        </div>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {filteredNavItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {filteredAdminItems.length > 0 && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Admin</SidebarGroupLabel>
              <SidebarMenu>
                {filteredAdminItems.map((item) => (
                  <NavLink key={item.href} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
    </Sidebar>
  )
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Music, ListMusic, Disc, UserCog, User } from "lucide-react";

const navItems = [
  { name: "Albums", href: "/admin", icon: Disc },
  { name: "Songs", href: "/admin/songs", icon: Music },
  { name: "Artists", href: "/admin/artists", icon: ListMusic },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Admins", href: "/admin/admins", icon: UserCog },
];

export default function TopNavigation() {
  const pathname = usePathname();

  return (
    <nav className="w-full bg-black text-purple-200 border-b border-purple-700 px-4 py-3 flex items-center justify-center gap-4 overflow-x-auto">
      {navItems.map(({ name, href, icon: Icon }) => {
        const isActive =
          href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(href);

        return (
          <Link key={name} href={href}>
            <button
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition
                ${
                  isActive
                    ? "bg-purple-600 text-white shadow"
                    : "hover:bg-purple-800 hover:text-white"
                }`}
            >
              <Icon className="w-5 h-5" />
              <span>{name}</span>
            </button>
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Music, ListMusic, Disc, UserCog, Menu, X } from "lucide-react";
import { useState } from "react";

const navItems = [
  { name: "Albums", href: "/admin", icon: Disc },
  { name: "Songs", href: "/admin/songs", icon: Music },
  { name: "Artists", href: "/admin/artists", icon: ListMusic },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Admins", href: "/admin/admins", icon: UserCog },
];

export default function TopNavigation() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="w-full bg-black border-b border-purple-700 px-4 py-3">
      {/* Mobile Hamburger Button */}
      <div className="flex items-center justify-between md:hidden">
        <span className="text-purple-200 font-bold text-lg">Admin</span>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-purple-200 focus:outline-none"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Menu */}
      <ul
        className={`
          mt-2 md:mt-0 md:flex md:justify-center md:items-center md:flex-wrap gap-2
          ${isOpen ? "flex flex-col items-center" : "hidden md:flex"}
        `}
      >
        {navItems.map(({ name, href, icon: Icon }) => {
          const isActive =
            href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

          return (
            <li key={name} className="flex-shrink-0">
              <Link
                href={href}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg transition
                  ${isActive
                    ? "bg-purple-600 text-white shadow"
                    : "text-purple-200 hover:bg-purple-800 hover:text-white"
                  }
                `}
                onClick={() => setIsOpen(false)} // close menu on click
              >
                <Icon className="w-5 h-5" />
                <span>{name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

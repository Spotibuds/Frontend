"use client";
import { Dialog as HeadlessDialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";

export default function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <HeadlessDialog open={open} onClose={onClose} className="relative z-[80]">
      <div className="fixed inset-0 bg-black/70" aria-hidden="true" />
      <div className="fixed inset-0 overflow-y-auto p-4 sm:p-8">
        <div className="flex min-h-full items-center justify-center">
          <DialogPanel className="dialog-surface w-full max-w-lg p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <DialogTitle className="text-xl font-semibold text-white">{title}</DialogTitle>
              <button
                type="button"
                aria-label={`Close ${title.toLowerCase()}`}
                onClick={onClose}
                className="icon-button shrink-0"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            {children}
          </DialogPanel>
        </div>
      </div>
    </HeadlessDialog>
  );
}

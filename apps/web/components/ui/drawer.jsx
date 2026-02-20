"use client";

import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function Drawer({ isOpen, onOpenChange, title, children, footer = null }) {
  return (
    <Sheet open={Boolean(isOpen)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">{title}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">{children}</div>
        {footer ? <SheetFooter>{footer({ onClose: () => onOpenChange?.(false) })}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}

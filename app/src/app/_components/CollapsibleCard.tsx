"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export function CollapsibleCard({
  title,
  icon,
  defaultOpen = false,
  badge,
  children,
  footer,
  className,
  contentClassName,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle>
          <button
            onClick={() => setOpen(!open)}
            className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            <span className="flex items-center gap-2">
              {icon}
              {title}
            </span>
            <span className="flex items-center gap-2">
              {badge && (
                <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                  {badge}
                </span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </span>
          </button>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className={contentClassName}>
          {children}
          {footer && (
            <>
              <div className="my-3 border-t border-border" />
              {footer}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

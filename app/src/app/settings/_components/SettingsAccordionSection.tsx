"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  icon: ReactNode;
  title: string;
  className?: string;
  titleClassName?: string;
  children: ReactNode;
};

export function SettingsAccordionSection({ icon, title, className, titleClassName, children }: Props) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <Card className={`mb-6 ${className ?? ""}`}>
      <CardHeader className="pb-3">
        <CardTitle>
          <span
            className={`hidden items-center gap-2 text-sm font-semibold uppercase tracking-widest lg:flex ${titleClassName ?? "text-muted-foreground"}`}
          >
            {icon}
            {title}
          </span>
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls={contentId}
            className={`flex w-full items-center justify-between text-sm font-semibold uppercase tracking-widest lg:hidden ${titleClassName ?? "text-muted-foreground"}`}
          >
            <span className="flex items-center gap-2">
              {icon}
              {title}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent id={contentId} className={`${open ? "" : "hidden"} lg:block`}>
        {children}
      </CardContent>
    </Card>
  );
}

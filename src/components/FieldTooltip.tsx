import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { FieldDef } from "@/lib/fields";
import type { ReactNode } from "react";

export function FieldTooltip({ field, children }: { field: FieldDef; children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs bg-popover text-popover-foreground border border-rule shadow-md text-xs leading-relaxed"
        >
          <div className="font-medium mb-1 text-foreground">
            {field.label}
            {field.unit ? <span className="text-muted-foreground"> ({field.unit})</span> : null}
          </div>
          <div className="text-muted-foreground">{field.definition}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

import * as React from "react";

import { cn } from "../../lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[120px] w-full rounded-lg border border-border/40 bg-[hsl(0_0%_15%)] px-3 py-2 text-sm shadow-none transition-all placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:border-border/50 focus-visible:bg-[hsl(0_0%_0%)] focus-visible:shadow-sm disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };

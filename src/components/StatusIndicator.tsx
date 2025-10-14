import { cn } from "../lib/utils";

export type StatusType = 
  | "idle"       // Connected and ready
  | "offline"    // Backend not connected
  | "thinking"   // AI is processing/generating response
  | "executing"  // Running a command or tool
  | "waiting"    // Tool needs user approval
  | "streaming"  // AI is streaming text response
  | "error";     // Something went wrong

interface StatusIndicatorProps {
  status: StatusType;
  compact?: boolean;
  className?: string;
}

const statusConfig: Record<StatusType, {
  color: string;
  bgColor: string;
  label: string;
  animation?: string;
  tooltip: string;
}> = {
  idle: {
    color: "bg-green-500",
    bgColor: "bg-green-500/10",
    label: "Online",
    tooltip: "Connected and ready to assist",
  },
  offline: {
    color: "bg-red-500",
    bgColor: "bg-red-500/10",
    label: "Offline",
    tooltip: "Backend is not connected",
  },
  thinking: {
    color: "bg-blue-500",
    bgColor: "bg-blue-500/10",
    label: "Thinking",
    animation: "animate-pulse",
    tooltip: "Processing your request...",
  },
  executing: {
    color: "bg-yellow-500",
    bgColor: "bg-yellow-500/10",
    label: "Executing",
    animation: "animate-pulse",
    tooltip: "Running command or tool...",
  },
  waiting: {
    color: "bg-orange-500",
    bgColor: "bg-orange-500/10",
    label: "Waiting",
    animation: "animate-pulse-slow",
    tooltip: "Waiting for your approval",
  },
  streaming: {
    color: "bg-purple-500",
    bgColor: "bg-purple-500/10",
    label: "Responding",
    animation: "animate-breathing",
    tooltip: "Streaming response...",
  },
  error: {
    color: "bg-red-500",
    bgColor: "bg-red-500/10",
    label: "Error",
    animation: "animate-pulse-slow",
    tooltip: "An error occurred",
  },
};

export function StatusIndicator({ status, compact = false, className }: StatusIndicatorProps) {
  const config = statusConfig[status];

  if (compact) {
    return (
      <div 
        className={cn("flex items-center gap-1.5 text-xs", className)}
        title={config.tooltip}
      >
        <div 
          className={cn(
            "h-2 w-2 rounded-full",
            config.color,
            config.animation
          )}
        />
        <span className="text-gray-400">{config.label}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5 py-1 rounded-full transition-colors",
        config.bgColor,
        className
      )}
      title={config.tooltip}
    >
      <div 
        className={cn(
          "h-2 w-2 rounded-full",
          config.color,
          config.animation
        )}
      />
      <span className="text-xs font-medium">{config.label}</span>
    </div>
  );
}

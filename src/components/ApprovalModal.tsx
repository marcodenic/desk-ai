import { useEffect } from "react";
import type { ApprovalRequest } from "../types";

interface ApprovalModalProps {
  request: ApprovalRequest | null;
  busy: boolean;
  onApprove: (request: ApprovalRequest) => void;
  onReject: (request: ApprovalRequest) => void;
}

function ApprovalModal({ request, busy, onApprove, onReject }: ApprovalModalProps) {
  if (!request || request.autoApproved) {
    return null;
  }

  const handleApprove = () => {
    console.log("Approve clicked", request);
    onApprove(request);
  };

  const handleReject = () => {
    console.log("Reject clicked", request);
    onReject(request);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Prevent backdrop clicks from closing the modal
    e.stopPropagation();
  };

  const handleModalClick = (e: React.MouseEvent) => {
    // Stop propagation to prevent backdrop handler from firing
    e.stopPropagation();
  };

  // Add keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !busy) {
        e.preventDefault();
        handleApprove();
      } else if (e.key === "Escape" && !busy) {
        e.preventDefault();
        handleReject();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [request, busy]);

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal" onClick={handleModalClick}>
        <header>
          <h3>Approve tool action?</h3>
          <p>This action requires your permission.</p>
        </header>

        <div className="modal-body">
          {request.elevated && (
            <div className="elevated-warning">
              <div className="elevated-warning-icon">⚠️</div>
              <div className="elevated-warning-content">
                <strong>Elevated Privileges Required</strong>
                <p>
                  This command requires administrator/root privileges. You may be prompted for
                  your password or authorization by your operating system.
                </p>
              </div>
            </div>
          )}

          <dl>
            <div>
              <dt>Action</dt>
              <dd>{formatAction(request.action)}</dd>
            </div>

            {request.command && (
              <div>
                <dt>Command</dt>
                <dd>
                  <code>{request.command}</code>
                </dd>
              </div>
            )}

            {request.path && (
              <div>
                <dt>Path</dt>
                <dd>
                  <code>{request.path}</code>
                </dd>
              </div>
            )}

            {typeof request.bytes === "number" && (
              <div>
                <dt>Size</dt>
                <dd>{request.bytes} bytes</dd>
              </div>
            )}

            {request.description && (
              <div>
                <dt>Details</dt>
                <dd>{request.description}</dd>
              </div>
            )}
          </dl>
        </div>

        <footer className="modal-footer">
          <button className="secondary" onClick={handleReject} disabled={busy}>
            Deny
          </button>
          <button className="primary" onClick={handleApprove} disabled={busy} autoFocus>
            Allow
          </button>
        </footer>
      </div>
    </div>
  );
}

function formatAction(action: ApprovalRequest["action"]) {
  switch (action) {
    case "shell":
      return "Run shell command";
    case "read":
      return "Read file";
    case "write":
      return "Write file";
    case "delete":
      return "Delete file";
    case "list":
      return "List directory";
    default:
      return action;
  }
}

export default ApprovalModal;

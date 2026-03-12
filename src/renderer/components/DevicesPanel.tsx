import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Monitor,
  Plus,
  RefreshCw,
  MoreVertical,
  Mic,
  SlidersHorizontal,
  CheckCircle2,
  Circle,
  PauseCircle,
  AlertCircle,
  Clock3,
  XCircle,
} from "lucide-react";
import type { NodeInfo, Task } from "../../shared/types";
import { isActiveSessionStatus, isAwaitingSessionStatus } from "./Sidebar";
import { getPlatformVisualIcon } from "./DeviceIcons";

interface DevicesPanelProps {
  onOpenTask: (taskId: string) => void;
  onNewTaskForDevice?: (nodeId: string, prompt: string) => Promise<void>;
}

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return "Just now";
  const diff = Date.now() - timestamp;
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function DevicesPanel({
  onOpenTask,
  onNewTaskForDevice,
}: DevicesPanelProps) {
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [deviceTasks, setDeviceTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [taskPrompt, setTaskPrompt] = useState("");
  const [submittingTask, setSubmittingTask] = useState(false);
  const [settingsMenuOpenFor, setSettingsMenuOpenFor] = useState<string | null>(null);

  const loadNodes = useCallback(async () => {
    try {
      const result = await window.electronAPI?.nodeList?.();
      if (result?.ok && result.nodes) {
        setNodes(result.nodes);
      } else {
        setNodes([]);
      }
    } catch (error) {
      console.error("Failed to load nodes:", error);
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNodes();

    const unsubscribe = window.electronAPI?.onNodeEvent?.((event) => {
      if (
        event.type === "connected" ||
        event.type === "disconnected" ||
        event.type === "capabilities_changed"
      ) {
        loadNodes();
      }
    });

    const interval = setInterval(loadNodes, 10000);

    return () => {
      unsubscribe?.();
      clearInterval(interval);
    };
  }, [loadNodes]);

  const activeNodeId = selectedNodeId || (nodes.length > 0 ? nodes[0].id : null);

  const activeNode = useMemo(
    () => nodes.find((n: NodeInfo) => n.id === activeNodeId) || null,
    [nodes, activeNodeId]
  );

  const loadDeviceTasks = useCallback(async (nodeId: string | null) => {
    if (!nodeId || !window.electronAPI?.deviceListTasks) {
      setDeviceTasks([]);
      return;
    }
    try {
      const result = await window.electronAPI.deviceListTasks(nodeId);
      if (result?.ok && Array.isArray(result.tasks)) {
        setDeviceTasks(result.tasks as Task[]);
      } else {
        setDeviceTasks([]);
      }
    } catch (error) {
      console.error("Failed to load device tasks:", error);
      setDeviceTasks([]);
    }
  }, []);

  useEffect(() => {
    if (!activeNodeId) {
      setDeviceTasks([]);
      return;
    }

    void loadDeviceTasks(activeNodeId);
    const interval = window.setInterval(() => {
      void loadDeviceTasks(activeNodeId);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [activeNodeId, loadDeviceTasks]);

  const visibleDeviceTasks = useMemo(() => deviceTasks.slice(0, 4), [deviceTasks]);

  const handleAssignTask = async () => {
    if (!activeNodeId || !taskPrompt.trim() || submittingTask) return;
    setSubmittingTask(true);
    try {
      await onNewTaskForDevice?.(activeNodeId, taskPrompt.trim());
      await loadDeviceTasks(activeNodeId);
      setTaskPrompt("");
    } catch (error) {
      console.error("Failed to assign task:", error);
    } finally {
      setSubmittingTask(false);
    }
  };

  const getTaskBadge = (task: Task) => {
    if (task.status === "completed") {
      return {
        className: "done",
        label: "Completed",
        icon: <CheckCircle2 size={12} />,
      };
    }

    if (task.status === "failed" || task.status === "cancelled") {
      return {
        className: "failed",
        label: task.status === "failed" ? "Failed" : "Cancelled",
        icon: <XCircle size={12} />,
      };
    }

    if (
      task.status === "blocked" ||
      task.terminalStatus === "needs_user_action" ||
      task.terminalStatus === "awaiting_approval"
    ) {
      return {
        className: "attention",
        label:
          task.terminalStatus === "awaiting_approval"
            ? "Waiting for approval"
            : "Waiting for input",
        icon: <AlertCircle size={12} />,
      };
    }

    if (task.status === "paused" || isAwaitingSessionStatus(task.status)) {
      return {
        className: "paused",
        label: "Paused",
        icon: <PauseCircle size={12} />,
      };
    }

    if (task.status === "queued" || task.status === "pending" || task.status === "planning") {
      return {
        className: "pending",
        label: task.status === "planning" ? "Planning" : task.status === "queued" ? "Queued" : "Pending",
        icon: <Clock3 size={12} />,
      };
    }

    if (isActiveSessionStatus(task.status) || task.status === "interrupted") {
      return {
        className: "running",
        label: "Running",
        icon: <Circle size={12} className="dp-pulse" />,
      };
    }

    return {
      className: "pending",
      label: task.status,
      icon: <Clock3 size={12} />,
    };
  };

  if (loading) {
    return (
      <div className="devices-panel">
        <div className="devices-loading">Loading devices...</div>
      </div>
    );
  }

  return (
    <div className="devices-panel">
      {/* Header */}
      <div className="dp-header">
        <h1 className="dp-title">Devices</h1>
        <button className="dp-add-link" onClick={() => setShowOnboarding(true)}>
          Add new device &gt;
        </button>
      </div>

      {nodes.length === 0 ? (
        <div className="dp-empty-state">
          <button className="dp-empty-btn" onClick={() => setShowOnboarding(true)}>
            <Plus size={36} />
          </button>
          <h2>No devices connected</h2>
          <p>Add a device to start assigning tasks.</p>
        </div>
      ) : (
        <>
          {/* ── 1. Task Input ── */}
          <div className="dp-input-box">
            <div className="dp-input-row">
              <Monitor size={20} className="dp-input-icon" />
              <input
                className="dp-input"
                placeholder={submittingTask ? 'Creating task...' : `Start a task on ${activeNode?.displayName || 'device'}...`}
                value={taskPrompt}
                disabled={submittingTask}
                onChange={(e) => setTaskPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAssignTask();
                  }
                }}
              />
            </div>
            <div className="dp-input-actions">
              <button className="dp-input-action-btn"><Plus size={20} /></button>
              <span className="dp-input-spacer" />
              <button className="dp-input-action-btn"><Mic size={20} /></button>
              <button className="dp-input-action-btn"><SlidersHorizontal size={20} /></button>
            </div>
          </div>

          {/* ── 2. Running Tasks ── */}
          <div className="dp-section">
            <div className="dp-section-header">
              <span className="dp-section-label">Running Tasks</span>
              <button className="dp-section-link">View all tasks &gt;</button>
            </div>
            {visibleDeviceTasks.length > 0 ? (
              <div className="dp-tasks-grid">
                {visibleDeviceTasks.map((task: Task) => {
                  const badge = getTaskBadge(task);
                  return (
                    <button
                      key={task.id}
                      className="dp-task-card"
                      onClick={() => onOpenTask(task.id)}
                    >
                      <span className="dp-task-title">{task.title || task.prompt}</span>
                      <div className="dp-task-meta">
                        <span className={`dp-task-badge ${badge.className}`}>
                          {badge.icon}
                          {badge.label}
                        </span>
                        <span className="dp-task-time">{formatRelativeTime(task.updatedAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="dp-placeholder">
                No tasks have been run on this device yet. Start one above!
              </div>
            )}
          </div>

          {/* ── 3. Devices ── */}
          <div className="dp-section">
            <div className="dp-section-header">
              <span className="dp-section-label">Devices</span>
              <button className="dp-section-link" onClick={() => setShowOnboarding(true)}>Add new device &gt;</button>
            </div>
            <div className="dp-devices-list">
              {nodes.map((node: NodeInfo) => {
                const isActive = node.id === activeNodeId;
                return (
                  <div key={node.id} className="dp-device-wrap">
                    <button
                      className={`dp-device-card${isActive ? ' active' : ''}`}
                      onClick={() => setSelectedNodeId(node.id)}
                    >
                      <div className="dp-device-icon">
                        {getPlatformVisualIcon(node.platform, "dp-device-svg")}
                      </div>
                      <div className="dp-device-info">
                        <span className="dp-device-name">{node.displayName}</span>
                        <span className={`dp-device-status ${node.isForeground ? 'online' : 'off'}`}>
                          {node.isForeground ? 'Connected' : 'Offline'}
                        </span>
                      </div>
                      <span
                        className="dp-device-more"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSettingsMenuOpenFor(settingsMenuOpenFor === node.id ? null : node.id);
                        }}
                      >
                        <MoreVertical size={18} />
                      </span>
                    </button>
                    {settingsMenuOpenFor === node.id && (
                      <div className="dp-device-menu">
                        <div className="dp-device-menu-item">Settings &amp; Configuration</div>
                        <div className="dp-device-menu-item">View Technical Details</div>
                        <div className="dp-device-menu-item danger">Remove Device</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 4. Files ── */}
          <div className="dp-section">
            <div className="dp-section-header">
              <span className="dp-section-label">Files</span>
              <button className="dp-section-link">View all files &gt;</button>
            </div>
            <div className="dp-placeholder">
              No files are currently synced with this device.
            </div>
          </div>
        </>
      )}

      {showOnboarding && (
        <DeviceOnboardingOverlay onClose={() => setShowOnboarding(false)} onRefresh={loadNodes} />
      )}
    </div>
  );
}

/* ── Inline onboarding overlay ── */
function DeviceOnboardingOverlay({
  onClose,
  onRefresh,
}: {
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [step, setStep] = useState<"instructions" | "waiting" | "connected">("instructions");
  const [discoveredNode, setDiscoveredNode] = useState<NodeInfo | null>(null);

  useEffect(() => {
    if (step !== "waiting") return;

    const unsubscribe = window.electronAPI?.onNodeEvent?.((event) => {
      if (event.type === "connected" && event.node) {
        setDiscoveredNode(event.node);
        setStep("connected");
        onRefresh();
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [step, onRefresh]);

  return (
    <div className="devices-onboarding-overlay" onClick={onClose}>
      <div className="devices-onboarding-modal" onClick={(e) => e.stopPropagation()}>
        {step === "instructions" && (
          <>
            <h2>Add a device</h2>
            <p>Install CoWork OS on the remote device and ensure its Control Plane is running.</p>
            <div className="devices-onboarding-steps">
              <ol>
                <li>Install CoWork OS on the remote machine</li>
                <li>Open Settings &rarr; Control Plane &rarr; Enable</li>
                <li>
                  Find the remote machine&apos;s reachable IP:
                  <div>
                    Same network: run <code>ifconfig | grep "inet "</code> and use the private IP
                    such as <code>192.168.x.x</code> or <code>10.x.x.x</code>
                  </div>
                  <div>
                    External network: use Tailscale, SSH tunnel, or a public IP with secure
                    network rules
                  </div>
                </li>
                <li>
                  Note the gateway URL (for example <code>ws://192.168.1.x:18789</code>)
                </li>
                <li>Enter that URL and the auth token on this machine to connect</li>
              </ol>
            </div>
            <div className="devices-onboarding-actions">
              <button className="button-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="devices-add-btn" onClick={() => setStep("waiting")}>
                I've set it up — start listening
              </button>
            </div>
          </>
        )}

        {step === "waiting" && (
          <>
            <h2>Waiting for device...</h2>
            <div className="devices-onboarding-spinner">
              <RefreshCw size={32} className="spinning" />
            </div>
            <p>Listening for incoming connections. Make sure the remote device's Control Plane is enabled and pointed at this machine.</p>
            <div className="devices-onboarding-actions">
              <button className="button-secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {step === "connected" && discoveredNode && (
          <>
            <h2>Device connected!</h2>
            <div className="devices-onboarding-actions">
              <button className="devices-add-btn" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

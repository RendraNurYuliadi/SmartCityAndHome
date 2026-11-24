import type { ChatRouteAction } from "@/lib/chat-command-routing";
import type { AuthRole } from "@/lib/auth";

export function canRoleUpdateDeviceCommands(
  role: AuthRole,
  updates: Record<string, unknown>,
) {
  const keys = Object.keys(updates);
  if (keys.length !== 1) return false;

  if (role === "admin") {
    return (
      keys[0] === "streetLightOverride" &&
      (typeof updates.streetLightOverride === "boolean" ||
        updates.streetLightOverride === null)
    );
  }

  return (
    (keys[0] === "rgbLedOn" && typeof updates.rgbLedOn === "boolean") ||
    (keys[0] === "temperatureServoOverride" &&
      (typeof updates.temperatureServoOverride === "boolean" ||
        updates.temperatureServoOverride === null))
  );
}

export function canRoleExecuteChatAction(
  role: AuthRole,
  action: ChatRouteAction,
) {
  return role === "admin"
    ? action.type === "set-street-light"
    : action.type === "set-rgb-led";
}

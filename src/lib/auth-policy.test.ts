import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canRoleUpdateDeviceCommands,
  canRoleExecuteChatAction,
} from "./auth-policy";

describe("manual device permissions", () => {
  it("allows public users to control RGB and the temperature servo only", () => {
    assert.equal(canRoleUpdateDeviceCommands("public", { rgbLedOn: false }), true);
    assert.equal(canRoleUpdateDeviceCommands("public", { rgbLedOn: true }), true);
    assert.equal(
      canRoleUpdateDeviceCommands("public", { temperatureServoOverride: false }),
      true,
    );
    assert.equal(
      canRoleUpdateDeviceCommands("public", { temperatureServoOverride: true }),
      true,
    );
    assert.equal(
      canRoleUpdateDeviceCommands("public", { temperatureServoOverride: null }),
      true,
    );
    assert.equal(
      canRoleUpdateDeviceCommands("public", { streetLightOverride: false }),
      false,
    );
    assert.equal(
      canRoleUpdateDeviceCommands("public", { streetLightOverride: null }),
      false,
    );
    assert.equal(
      canRoleUpdateDeviceCommands("public", { rgbLedOn: false, temperatureServoOverride: true }),
      false,
    );
  });

  it("allows admins to control the street light only", () => {
    assert.equal(
      canRoleUpdateDeviceCommands("admin", { streetLightOverride: false }),
      true,
    );
    assert.equal(
      canRoleUpdateDeviceCommands("admin", { streetLightOverride: null }),
      true,
    );
    assert.equal(
      canRoleUpdateDeviceCommands("admin", { rgbLedOn: false }),
      false,
    );
    assert.equal(
      canRoleUpdateDeviceCommands("admin", { temperatureServoOverride: true }),
      false,
    );
  });

  it("lets public chat control RGB and admins chat control the street light only", () => {
    assert.equal(
      canRoleExecuteChatAction("public", { type: "set-rgb-led", on: false }),
      true,
    );
    assert.equal(
      canRoleExecuteChatAction("public", { type: "set-rgb-led", on: true }),
      true,
    );
    assert.equal(
      canRoleExecuteChatAction("admin", { type: "set-rgb-led", on: true }),
      false,
    );
    assert.equal(
      canRoleExecuteChatAction("admin", { type: "set-street-light", on: false }),
      true,
    );
    assert.equal(
      canRoleExecuteChatAction("public", { type: "set-street-light", on: true }),
      false,
    );
  });
});

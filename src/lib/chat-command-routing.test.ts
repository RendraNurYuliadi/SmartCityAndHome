import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getLightCommandClarification,
  getLightCommandIntent,
  getLightStatusAnswer,
  getParkingStatusAnswer,
  isServoControlRequest,
  needsLightCommandClarification,
} from "./chat-command-routing";

describe("getLightCommandIntent", () => {
  it("routes explicit RGB/LED on/off commands", () => {
    assert.deepEqual(getLightCommandIntent("Tolong nyalakan lampu RGB"), {
      type: "rgb",
      on: true,
    });
    assert.deepEqual(getLightCommandIntent("Matikan RGB sekarang"), {
      type: "rgb",
      on: false,
    });
    assert.deepEqual(getLightCommandIntent("Tolong nyalakan lampu LED"), {
      type: "rgb",
      on: true,
    });
    assert.deepEqual(getLightCommandIntent("Lampu LED web ON"), {
      type: "rgb",
      on: true,
    });
    assert.deepEqual(getLightCommandIntent("Matikan lampu rumah"), {
      type: "rgb",
      on: false,
    });
    assert.deepEqual(
      getLightCommandIntent("sekarnag nayalakn lampu rumah rgb"),
      { type: "rgb", on: true },
    );
  });

  it("routes street-light commands directly to web ON/OFF", () => {
    assert.deepEqual(getLightCommandIntent("Nyalakan lampu jalan"), {
      type: "street-light",
      on: true,
    });
    assert.deepEqual(getLightCommandIntent("Matikan lampu jalan"), {
      type: "street-light",
      on: false,
    });
    assert.deepEqual(getLightCommandIntent("Lampu jalan web OFF"), {
      type: "street-light",
      on: false,
    });
    assert.deepEqual(
      getLightCommandIntent("tlong matikan lampu jalan LED nya"),
      { type: "street-light", on: false },
    );
  });

  it("leaves questions, ambiguous lamps, and conflicting targets for RAG", () => {
    assert.equal(getLightCommandIntent("Apakah lampu RGB menyala?"), null);
    assert.equal(getLightCommandIntent("Bagaimana cara menyalakan lampu LED?"), null);
    assert.equal(getLightCommandIntent("Matikan lampu"), null);
    assert.equal(
      getLightCommandIntent("Nyalakan lampu RGB dan lampu jalan"),
      null,
    );
    assert.equal(getLightCommandIntent("Nyalakan lampu jalan otomatis"), null);
  });

  it("uses the last user-mentioned light target for short follow-up commands", () => {
    const history = [
      {
        role: "user" as const,
        content: "konisi lam[u jalan skrnag",
      },
      {
        role: "assistant" as const,
        content: "Lampu jalan sedang hidup.",
      },
    ];
    assert.deepEqual(getLightCommandIntent("tolong matikan", history), {
      type: "street-light",
      on: false,
    });
    assert.equal(getLightCommandIntent("matikan kipas", history), null);
  });

  it("asks for clarification instead of inventing or executing an ambiguous command", () => {
    assert.equal(needsLightCommandClarification("tolong matikan"), true);
    assert.equal(needsLightCommandClarification("matikan lampu"), true);
    assert.equal(
      needsLightCommandClarification("matikan lampu RGB dan lampu jalan"),
      true,
    );
    assert.equal(
      needsLightCommandClarification("bagaimana cara mematikan lampu LED?"),
      false,
    );
    assert.match(getLightCommandClarification(), /Belum ada perintah yang diubah/);
  });
});

describe("isServoControlRequest", () => {
  it("recognizes servo commands for a manual-control-only response", () => {
    assert.equal(isServoControlRequest("Tolong buka servo suhu"), true);
    assert.equal(isServoControlRequest("Matikan servo sekarang"), true);
  });

  it("does not treat servo questions as commands", () => {
    assert.equal(isServoControlRequest("Bagaimana cara kerja servo suhu?"), false);
    assert.equal(isServoControlRequest("Atur servo ke otomatis"), true);
  });
});

describe("direct sensor answers", () => {
  const reading = {
    recordedAt: new Date("2026-11-17T07:01:00.000Z"),
    rgbLedOn: false,
    streetLightOn: true,
    parking: {
      slotAOccupied: true,
      slotBOccupied: false,
      slotCOccupied: true,
    },
  };

  it("answers typoed parking status queries from dashboard-mapped slots", () => {
    const answer = getParkingStatusAnswer("slot parkiran sekanrag", reading);
    assert.match(answer ?? "", /telemetri/);
    assert.match(answer ?? "", /Slot A: Kosong/);
    assert.match(answer ?? "", /Slot B: Terisi/);
    assert.match(answer ?? "", /2 terisi, 1 kosong/);
  });

  it("reports physical light state and distinguishes a pending web command", () => {
    const history = [
      { role: "user" as const, content: "lampu jalan sekarang bagaimana?" },
    ];
    const answer = getLightStatusAnswer(
      "konisi lam[u jalan skrnag",
      reading,
      {
        rgbLedOn: false,
        streetLightOverride: false,
        updatedAt: new Date("2026-11-17T07:02:00.000Z"),
      },
      history,
    );
    assert.match(answer ?? "", /Status fisik terakhir lampu jalan: \*\*HIDUP\*\*/);
    assert.match(answer ?? "", /Perintah Web OFF tersimpan/);
    assert.match(
      getLightStatusAnswer("statusnya?", reading, null, history) ?? "",
      /lampu jalan: \*\*HIDUP\*\*/,
    );
    assert.equal(
      getLightStatusAnswer(
        "lampu jalan pakai pin berapa?",
        reading,
        null,
      ),
      null,
    );
    assert.equal(
      getLightStatusAnswer("kondisi sensor sekarang", reading, null, history),
      null,
    );
  });
});

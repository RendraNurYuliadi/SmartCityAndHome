import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLightCommandIntent } from "./chat-command-routing";

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
});

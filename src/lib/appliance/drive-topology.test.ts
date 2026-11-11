import { describe, it, expect } from "vitest";
import { classifyDriveTopology, filterForTopology } from "./drive-topology";

describe("drive topology", () => {
  it("Maytag MTW6205RW1 is direct-drive stator", () => {
    expect(classifyDriveTopology("Top-Load Washer", "MTW6205RW1").topology).toBe("direct_drive_stator");
  });
  it("Whirlpool WTW5000DW1 is belt drive", () => {
    expect(classifyDriveTopology("Top-Load Washer", "WTW5000DW1").topology).toBe("belt_drive");
  });
  it("strips belt, capacitor and shifter for direct drive", () => {
    const info = classifyDriveTopology("Top-Load Washer", "MTW6205RW1");
    const out = filterForTopology(["Drive belt", "Motor capacitor", "Shift actuator", "Stator assembly"], info, (s) => s);
    expect(out).toEqual(["Stator assembly"]);
  });
  it("non-washers are unknown", () => {
    expect(classifyDriveTopology("Dishwasher", "WTW6000").topology).toBe("unknown");
  });
});

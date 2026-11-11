import { describe, expect, test } from "bun:test";
import { parsePartsTable, usefulParts, matchToCatalog, parseDiagramLinks } from "./parse";

const md = `[![d](x)](https://www.vvapplianceparts.com/lookup/366823/2466460 "Gearcase, Motor And Pump Parts")
| 1 | [W11807607](https://www.vvapplianceparts.com/parts/W11807607 "Part W11807607") |  | Drive Assembly   (Replaces: W11754447) |  | ![In-Stock](i/in-stock.gif) |  | $ 248.99 |  |  |
| 2 | [WPW10249633](https://www.vvapplianceparts.com/parts/WPW10249633 "Part WPW10249633") |  | Screw |  | ![In-Stock](i/in-stock.gif) | Immediately | $ 4.99 |  |  |
| 6 | [W10915700](https://www.vvapplianceparts.com/parts/W10915700 "Part W10915700") |  | Stator, Motor   (Replaces: W10006483) |  | ![In-Stock](i/in-stock.gif) | Immediately | $ 172.99 |  |  |
| 11 | [W10915701](https://www.vvapplianceparts.com/parts/W10915701 "Part W10915701") |  | Rotor, Motor   (Replaces: W10006482) |  | ![In-Stock](i/in-stock.gif) | Immediately | $ 140.99 |  |  |`;

describe("V&V parts catalog", () => {
  const cat = usefulParts(parsePartsTable(md, "Gearcase"));
  test("parses diagrams and part rows with price", () => {
    expect(parseDiagramLinks(md)[0].title).toBe("Gearcase, Motor And Pump Parts");
    expect(cat.find((p) => p.partNumber === "W10915700")?.price).toBe(172.99);
  });
  test("drops screws", () => expect(cat.some((p) => p.partNumber === "WPW10249633")).toBe(false));
  test("snaps a stator suggestion to the model's real stator", () =>
    expect(matchToCatalog("Motor stator", "", cat)?.partNumber).toBe("W10915700"));
  test("superseded number maps to current part", () =>
    expect(matchToCatalog("Stator", "W10006483", cat)?.partNumber).toBe("W10915700"));
  test("a belt does not match a direct-drive catalog", () =>
    expect(matchToCatalog("Drive belt", "", cat)).toBeNull());
});

import { describe, expect, test } from "bun:test";
import { parsePartSelectParts } from "./parse";
const md = `[![Drive Belt – Part Number: 6602-001655](https://x/a.jpg?w=1)](https://www.partselect.com/PS4133825-Samsung-6602-001655-Drive-Belt.htm?SourceCode=21 "Drive Belt")

$55.18

In Stock

[![Heating Element - 5300W – Part Number: DC47-00019A](https://x/b.jpg)](https://www.partselect.com/PS4205218-Samsung-DC47-00019A.htm?x=1 "H")

$82.61

On Order`;
describe("partselect parse", () => {
  const p = parsePartSelectParts(md);
  test("reads part numbers and prices", () => {
    expect(p.map((x) => x.partNumber)).toEqual(["6602-001655", "DC47-00019A"]);
    expect(p[1].price).toBe(82.61);
    expect(p[1].description).toBe("Heating Element - 5300W");
  });
});

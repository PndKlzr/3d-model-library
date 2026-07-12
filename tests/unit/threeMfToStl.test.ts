import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { convertThreeMfToStl } from "../../src/lib/threeMfToStl";

describe("convertThreeMfToStl", () => {
  it("exports 3MF mesh geometry as ASCII STL", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0" />
          <vertex x="10" y="0" z="0" />
          <vertex x="0" y="10" z="0" />
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2" />
        </triangles>
      </mesh>
    </object>
  </resources>
</model>`;
    const zipped = zipSync({ "3D/3dmodel.model": strToU8(xml) });

    const stl = convertThreeMfToStl(zipped.buffer as ArrayBuffer);

    expect(stl).toContain("solid exported");
    expect(stl).toContain("facet normal");
    expect(stl).toContain("endsolid exported");
  });

  it("reports conversion stages in increasing order", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources><object id="1" type="model"><mesh>
    <vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices>
    <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
  </mesh></object></resources>
</model>`;
    const zipped = zipSync({ "3D/3dmodel.model": strToU8(xml) });
    const progress: number[] = [];

    convertThreeMfToStl(zipped.buffer as ArrayBuffer, (value) => progress.push(value));

    expect(progress).toEqual([10, 70, 100]);
  });
});

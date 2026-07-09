import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import * as THREE from "three";
import { parseThreeMfPreview } from "../../src/lib/threeMfPreview";

describe("parseThreeMfPreview", () => {
  it("renders mesh objects and ignores 3MF objects without mesh", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model" />
    <object id="2" type="model">
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
    const group = parseThreeMfPreview(zipped.buffer as ArrayBuffer);

    expect(group.children).toHaveLength(1);
  });

  it("reports a readable error when no mesh can be rendered", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model" />
  </resources>
</model>`;
    const zipped = zipSync({ "3D/3dmodel.model": strToU8(xml) });

    expect(() => parseThreeMfPreview(zipped.buffer as ArrayBuffer)).toThrow(
      "3MF sem malhas renderizáveis."
    );
  });

  it("loads meshes from nested 3MF object model files", () => {
    const rootXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model" />
  </resources>
</model>`;
    const objectXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="2" type="model">
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

    const zipped = zipSync({
      "3D/3dmodel.model": strToU8(rootXml),
      "3D/Objects/object_1.model": strToU8(objectXml)
    });

    expect(parseThreeMfPreview(zipped.buffer as ArrayBuffer).children).toHaveLength(1);
  });

  it("keeps 3MF build item transforms so separate parts do not collapse together", () => {
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
  <build>
    <item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0" />
    <item objectid="1" transform="1 0 0 0 1 0 0 0 1 80 0 0" />
  </build>
</model>`;

    const zipped = zipSync({ "3D/3dmodel.model": strToU8(xml) });
    const group = parseThreeMfPreview(zipped.buffer as ArrayBuffer);
    const box = new THREE.Box3().setFromObject(group);

    expect(group.children).toHaveLength(2);
    expect(box.getSize(new THREE.Vector3()).x).toBeGreaterThan(80);
  });

  it("uses the final three 3MF transform values as translation", () => {
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
  <build>
    <item objectid="1" transform="1 0 0 0 1 0 0 0 1 120 30 5" />
  </build>
</model>`;

    const zipped = zipSync({ "3D/3dmodel.model": strToU8(xml) });
    const group = parseThreeMfPreview(zipped.buffer as ArrayBuffer, { center: false });
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());

    expect(center.x).toBeGreaterThan(120);
    expect(center.y).toBeGreaterThan(30);
    expect(center.z).toBe(5);
  });

  it("applies component transforms inside composite 3MF objects", () => {
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
    <object id="2" type="model">
      <components>
        <component objectid="1" />
        <component objectid="1" transform="1 0 0 0 1 0 0 0 1 50 0 0" />
      </components>
    </object>
  </resources>
  <build>
    <item objectid="2" />
  </build>
</model>`;

    const zipped = zipSync({ "3D/3dmodel.model": strToU8(xml) });
    const group = parseThreeMfPreview(zipped.buffer as ArrayBuffer);
    const box = new THREE.Box3().setFromObject(group);

    expect(group.children).toHaveLength(1);
    expect(box.getSize(new THREE.Vector3()).x).toBeGreaterThan(50);
  });
});

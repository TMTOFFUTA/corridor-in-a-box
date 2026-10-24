import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAdapter, ADAPTER_ID_PATTERN } from "../scripts/create-adapter.js";

describe("create-adapter scaffold", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "create-adapter-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("generates a package with the expected files", () => {
    const res = createAdapter({ id: "demo", dir: "out", root });
    expect(res.files).toEqual(
      expect.arrayContaining(["package.json", "src/index.ts", "tests/adapter.test.ts", "README.md"]),
    );
    const pkg = JSON.parse(readFileSync(join(root, "out", "package.json"), "utf8"));
    expect(pkg.name).toBe("@corridor/adapter-demo");
  });

  it("generated source declares the custom protocol and class", () => {
    createAdapter({ id: "demo", dir: "out", root });
    const src = readFileSync(join(root, "out", "src", "index.ts"), "utf8");
    expect(src).toContain("export class DemoAdapter implements AnchorAdapter");
    expect(src).toContain('protocol: "custom:demo"');
  });

  it("type-checks the generated source against the workspace types", async () => {
    const ts = await import("typescript");
    const dir = join(root, "out");
    createAdapter({ id: "demo", dir: "out", root });
    const src = join(dir, "src", "index.ts");
    const program = ts.createProgram([src], {
      noEmit: true,
      strict: true,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
      skipLibCheck: true,
      baseUrl: process.cwd(),
      paths: {
        "@corridor/adapter-kit": ["packages/adapter-kit/src/index.ts"],
        "@corridor/manifest": ["packages/manifest/src/index.ts"],
        "@corridor/types": ["packages/types/src/index.ts"],
      },
    });
    const diags = ts.getPreEmitDiagnostics(program).map((d) =>
      ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    );
    expect(diags).toEqual([]);
  });

  it("refuses to overwrite an existing directory", () => {
    mkdirSync(join(root, "out"));
    writeFileSync(join(root, "out", "keep.txt"), "x");
    expect(() => createAdapter({ id: "demo", dir: "out", root })).toThrow(/refusing to overwrite/);
    expect(existsSync(join(root, "out", "package.json"))).toBe(false);
  });

  it.each(["Demo", "has_underscore", "sp ace", ""])("rejects invalid id %j", (id) => {
    expect(() => createAdapter({ id, dir: "out", root })).toThrow(/invalid adapter id/);
  });

  it("accepts lowercase slugs matching the manifest rule", () => {
    expect(ADAPTER_ID_PATTERN.test("acme-bank-2")).toBe(true);
  });
});

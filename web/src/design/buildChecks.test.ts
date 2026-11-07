import { describe, expect, it } from "vitest";
import { REFERENCE_PAGE_MARKER, findBuildProblems } from "./buildChecks";

const font = { path: "assets/inter-latin-wght-normal.woff2", text: "" };

describe("findBuildProblems (AC-4, AC-10)", () => {
  it("passes a build with a bundled font and no external hosts", () => {
    const files = [
      font,
      { path: "index.html", text: '<link rel="stylesheet" href="/assets/index.css">' },
      { path: "assets/index.css", text: "@font-face{src:url(/assets/inter.woff2)}" },
      { path: "assets/index.js", text: 'createElementNS("http://www.w3.org/2000/svg","svg")' },
    ];
    expect(findBuildProblems(files)).toEqual([]);
  });

  it("flags Google Fonts and other external font hosts", () => {
    const files = [
      font,
      {
        path: "assets/index.css",
        text: "@import url(https://fonts.googleapis.com/css2?family=X);",
      },
      { path: "index.html", text: '<link href="https://fonts.gstatic.com/s/x.woff2">' },
    ];
    expect(findBuildProblems(files)).toHaveLength(2);
  });

  it("flags an external stylesheet link or CSS import", () => {
    const files = [
      font,
      { path: "index.html", text: '<link rel="stylesheet" href="https://cdn.example.com/a.css">' },
      { path: "assets/a.css", text: '@import "https://cdn.example.com/b.css";' },
    ];
    expect(findBuildProblems(files)).toHaveLength(2);
  });

  it("flags a build with no bundled font file", () => {
    const problems = findBuildProblems([{ path: "index.html", text: "" }]);
    expect(problems).toEqual([expect.stringMatching(/font/i)]);
  });

  it("flags the reference page marker in production output", () => {
    const files = [font, { path: "assets/index.js", text: `x="${REFERENCE_PAGE_MARKER}"` }];
    expect(findBuildProblems(files)).toEqual([expect.stringMatching(/reference page/i)]);
  });

  describe("external URLs not on the known-host list (F4)", () => {
    it.each([
      [
        "a font URL on any external host in CSS",
        "assets/a.css",
        "@font-face{src:url(https://cdn.example.net/x.woff2)}",
      ],
      [
        "a quoted external CSS url()",
        "assets/a.css",
        'a{background:url("https://img.example.com/a.png")}',
      ],
      [
        "a protocol-relative CSS url()",
        "assets/a.css",
        "@font-face{src:url(//cdn.example.net/x.woff2)}",
      ],
      ["an external script", "index.html", '<script src="https://cdn.example.com/a.js"></script>'],
      [
        "a protocol-relative link",
        "index.html",
        '<link rel="stylesheet" href="//cdn.example.com/a.css">',
      ],
    ])("flags %s", (_, path, text) => {
      expect(findBuildProblems([font, { path, text }])).toHaveLength(1);
    });

    it("allows same-origin and data URLs", () => {
      const files = [
        font,
        {
          path: "assets/a.css",
          text: "a{background:url(/assets/a.png)}b{background:url(data:image/png;base64,AA==)}",
        },
        { path: "index.html", text: '<script type="module" src="/assets/index.js"></script>' },
      ];
      expect(findBuildProblems(files)).toEqual([]);
    });
  });

  describe("required color variables (F1)", () => {
    const css = (body: string) => ({ path: "assets/index.css", text: `:root,:host{${body}}` });

    it("passes when the built CSS defines every declared color variable", () => {
      const files = [font, css("--color-fg:#142433;--color-chart-1:#2563a6;")];
      expect(findBuildProblems(files, ["fg", "chart-1"])).toEqual([]);
    });

    it("flags each declared color variable missing from the built CSS", () => {
      const files = [font, css("--color-fg:#142433;")];
      expect(findBuildProblems(files, ["fg", "chart-1", "brand-teal"])).toEqual([
        expect.stringMatching(/--color-chart-1/),
        expect.stringMatching(/--color-brand-teal/),
      ]);
    });

    it("does not count a variable that is only referenced, not defined", () => {
      const files = [font, css("color:var(--color-chart-1);")];
      expect(findBuildProblems(files, ["chart-1"])).toHaveLength(1);
    });
  });
});

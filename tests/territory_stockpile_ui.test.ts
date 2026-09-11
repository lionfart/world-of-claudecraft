// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RESOURCE_KINDS = ["wood", "iron", "grain", "labor"] as const;

function entryView(path: "index.html" | "play.html"): DocumentFragment {
  const markup = readFileSync(path, "utf8").replace(/<link\b[^>]*>/gi, "");
  const document = new DOMParser().parseFromString(markup, "text/html");
  const template = document.getElementById(
    "game-ui-template",
  ) as HTMLTemplateElement | null;
  if (!template) throw new Error(`${path} is missing the game UI template`);
  return template.content;
}

describe.each(["index.html", "play.html"] as const)(
  "%s territory stockpile markup",
  (path) => {
    it("shows every resource at once instead of using a selector", () => {
      const view = entryView(path);
      expect(view.querySelector("#territory-stockpile-resource")).toBeNull();
      expect(
        view.querySelectorAll(".territory-stockpile-resource-card"),
      ).toHaveLength(4);

      for (const resource of RESOURCE_KINDS) {
        const card = view.querySelector(
          `.territory-stockpile-resource-card[data-resource="${resource}"]`,
        );
        expect(card).not.toBeNull();
        expect(
          card?.querySelector(
            `img[src="/ui/items/territory_${resource}.webp"]`,
          ),
        ).not.toBeNull();
        expect(
          card?.querySelector(`#territory-stockpile-${resource}-stored`),
        ).not.toBeNull();
        expect(
          card?.querySelector(`#territory-stockpile-${resource}-bags`),
        ).toBeNull();
        expect(
          card?.querySelector(`#territory-stockpile-${resource}-total`),
        ).toBeNull();
        expect(
          card?.querySelector(`#territory-stockpile-${resource}-rate`),
        ).toBeNull();
        expect(
          card?.querySelector(
            `[data-territory-stockpile-withdraw="${resource}"]`,
          ),
        ).not.toBeNull();
      }
    });

    it("puts hourly production inside each corresponding resource-building button", () => {
      const view = entryView(path);
      expect(view.querySelector("#territory-production-grid")).toBeNull();
      const resourceSlots = ["granary", "forester", "mine", "house"] as const;
      for (const slot of resourceSlots) {
        const button = view.querySelector(`[data-territory-slot="${slot}"]`);
        expect(
          button?.querySelector(`#territory-slot-${slot}-production`),
        ).not.toBeNull();
      }
    });
  },
);

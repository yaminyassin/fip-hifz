import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { QuranViewer } from "./QuranViewer";
import { buildQuranPageUrl } from "@/hooks/useQuranPage";

// QuranViewer only needs a `t` that returns keys; avoid pulling in the real
// i18n init.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

describe("buildQuranPageUrl", () => {
  it("builds the static page URL for a page number", () => {
    expect(buildQuranPageUrl(27)).toBe("/quran/mushaf-v1/27.webp");
  });
});

describe("QuranViewer", () => {
  it("renders an <img> pointing at the static WebP page (no data-uri prefix)", () => {
    const { container } = render(<QuranViewer pageNumber={27} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("/quran/mushaf-v1/27.webp");
    expect(img!.getAttribute("src")).not.toContain("data:image");
  });

  it("falls back to the no-participant message when the image fails to load", () => {
    const { container } = render(<QuranViewer pageNumber={27} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("randomizer.messages.noParticipant");
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { JuryPagePeek } from "./JuryPagePeek";
import type { Participant } from "@/models/models";

// Only a `t` that echoes keys is needed; avoid pulling in the real i18n init.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.number === undefined ? key : `${key}:${options.number}`,
  }),
}));

afterEach(cleanup);

const participant = {
  id: "participant-active",
  name: "Ahmad",
  age: 14,
  category: "CAT_A",
  assignedQuestions: [27, 76],
  activeQuestion: 27,
} as Participant;

const toggle = () => screen.getByRole("button");
const panel = () => screen.getByRole("dialog", { hidden: true });

describe("JuryPagePeek", () => {
  it("starts closed, with the toggle owning the panel", () => {
    render(
      <JuryPagePeek
        participant={participant}
        selectedQuestion={1}
        activeQuestionNumber={1}
      />
    );

    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().getAttribute("aria-controls")).toBe(panel().id);
    expect(panel().className).toContain("invisible");
  });

  it("the same button opens and closes the panel", () => {
    render(
      <JuryPagePeek
        participant={participant}
        selectedQuestion={1}
        activeQuestionNumber={1}
      />
    );

    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(panel().className).toContain("visible");

    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(panel().className).toContain("invisible");
  });

  it("Escape closes the panel and hands focus back to the button", () => {
    render(
      <JuryPagePeek
        participant={participant}
        selectedQuestion={1}
        activeQuestionNumber={1}
      />
    );

    fireEvent.click(toggle());
    fireEvent.keyDown(window, { key: "Escape" });

    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle());
  });

  // The whole point of following `selectedQuestion` rather than
  // `activeQuestion`: a juror revising question 2 must see page 76, not the
  // page the reciter happens to be on.
  it("shows the page for the question being scored, not the active one", () => {
    render(
      <JuryPagePeek
        participant={participant}
        selectedQuestion={2}
        activeQuestionNumber={1}
      />
    );

    expect(panel().querySelector("img")!.getAttribute("src")).toBe(
      "/quran/mushaf-v1/76.webp"
    );
    expect(panel().textContent).toContain("jury.pagePeek.reciterOn:1");
    expect(panel().textContent).not.toContain("jury.pagePeek.recitingNow");
  });

  it("marks the page as live when it is the question being recited", () => {
    render(
      <JuryPagePeek
        participant={participant}
        selectedQuestion={1}
        activeQuestionNumber={1}
      />
    );

    expect(panel().textContent).toContain("jury.pagePeek.recitingNow");
  });

  // `assignedQuestions` is written one page at a time by the randomizer.
  it("says so when the question has no page assigned yet", () => {
    render(
      <JuryPagePeek
        participant={{ ...participant, assignedQuestions: [27] } as Participant}
        selectedQuestion={2}
        activeQuestionNumber={1}
      />
    );

    expect(panel().querySelector("img")).toBeNull();
    expect(panel().textContent).toContain("jury.pagePeek.noPage");
  });

  it("renders nothing without a participant", () => {
    const { container } = render(
      <JuryPagePeek
        participant={null}
        selectedQuestion={1}
        activeQuestionNumber={null}
      />
    );

    expect(container.textContent).toBe("");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("reports a page that fails to load instead of leaving a broken image", () => {
    render(
      <JuryPagePeek
        participant={participant}
        selectedQuestion={1}
        activeQuestionNumber={1}
      />
    );

    fireEvent.error(panel().querySelector("img")!);

    expect(panel().querySelector("img")).toBeNull();
    expect(panel().textContent).toContain("jury.pagePeek.loadFailed:27");
  });
});

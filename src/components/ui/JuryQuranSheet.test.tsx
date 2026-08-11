import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JuryQuranSheet } from "./JuryQuranSheet";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/ui/QuranViewer", () => ({
  QuranViewer: ({
    pageNumber,
    questionNumber,
  }: {
    pageNumber?: number;
    questionNumber?: number;
  }) => (
    <div
      data-testid="quran-viewer"
      data-page-number={pageNumber}
      data-question-number={questionNumber}
    />
  ),
}));

afterEach(cleanup);

describe("JuryQuranSheet", () => {
  const participant = {
    activeQuestion: 27,
    assignedQuestions: [27, 76],
  };

  it("opens and closes the active Quran page with the same button", () => {
    render(<JuryQuranSheet participant={participant} />);

    const openButton = screen.getByRole("button", {
      name: "jury.quran.open",
    });
    const sheet = screen.getByLabelText("jury.quran.title", {
      selector: "aside",
    });

    expect(openButton.getAttribute("aria-expanded")).toBe("false");
    expect(sheet.getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(openButton);

    const closeButton = screen.getByRole("button", {
      name: "jury.quran.close",
    });
    expect(closeButton.getAttribute("aria-expanded")).toBe("true");
    expect(sheet.getAttribute("aria-hidden")).toBe("false");
    expect(
      screen.getByTestId("quran-viewer").getAttribute("data-page-number")
    ).toBe("27");
    expect(
      screen.getByTestId("quran-viewer").getAttribute("data-question-number")
    ).toBe("1");

    fireEvent.click(closeButton);

    expect(
      screen
        .getByRole("button", { name: "jury.quran.open" })
        .getAttribute("aria-expanded")
    ).toBe("false");
    expect(sheet.getAttribute("aria-hidden")).toBe("true");
  });

  it("follows the participant's active page while open", () => {
    const { rerender } = render(
      <JuryQuranSheet participant={participant} />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "jury.quran.open" })
    );

    rerender(
      <JuryQuranSheet
        participant={{ ...participant, activeQuestion: 76 }}
      />
    );

    expect(
      screen.getByTestId("quran-viewer").getAttribute("data-page-number")
    ).toBe("76");
    expect(
      screen.getByTestId("quran-viewer").getAttribute("data-question-number")
    ).toBe("2");
  });

  it("closes on Escape", () => {
    render(<JuryQuranSheet participant={participant} />);
    fireEvent.click(
      screen.getByRole("button", { name: "jury.quran.open" })
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen
        .getByRole("button", { name: "jury.quran.open" })
        .getAttribute("aria-expanded")
    ).toBe("false");
  });

  it("disables the control when no Quran page is active", () => {
    render(
      <JuryQuranSheet
        participant={{ activeQuestion: 0, assignedQuestions: [] }}
      />
    );

    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "jury.quran.unavailable",
      }).disabled
    ).toBe(true);
  });
});

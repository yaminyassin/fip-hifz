import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Jury } from "@/models/models";
import { JuryLogin } from "./JuryLogin";

const mocks = vi.hoisted(() => ({
  authenticateJury: vi.fn(),
  setAuthenticatedJury: vi.fn(),
}));

const juryMembers = [
  {
    id: "jury-nazim",
    name: "Qari Nazim Patel",
    currentQuestion: 1,
    hasFinishedEvaluating: false,
    isActive: true,
  },
  {
    id: "jury-ubaidullah",
    name: "Maulana Ubaidullah Imtiaz",
    currentQuestion: 1,
    hasFinishedEvaluating: false,
    isActive: true,
  },
  {
    id: "jury-saad",
    name: "Mufti Saad Gulam Mustafa",
    currentQuestion: 1,
    hasFinishedEvaluating: false,
    isActive: true,
  },
  {
    id: "jury-suleiman",
    name: "Hafiz Suleiman",
    currentQuestion: 1,
    hasFinishedEvaluating: false,
    isActive: true,
  },
] satisfies Jury[];

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) => {
      if (key === "jury.login.selectMember") {
        return `Select ${options?.name}`;
      }
      if (key === "jury.login.confirmTitle") {
        return `Continue as ${options?.name}?`;
      }
      return key;
    },
  }),
}));

vi.mock("@/contexts/EventContext", () => ({
  useEvent: () => ({
    currentEvent: "mozambique-2026",
  }),
}));

vi.mock("@/hooks/useJuryMembers", () => ({
  useJuryMembers: () => ({
    data: juryMembers,
    isLoading: false,
  }),
}));

vi.mock("@/services/juryAuth", () => ({
  authenticateJury: mocks.authenticateJury,
  setAuthenticatedJury: mocks.setAuthenticatedJury,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("JuryLogin", () => {
  it("filters the jury roster by name", () => {
    render(<JuryLogin onLoginSuccess={vi.fn()} />);

    fireEvent.change(
      screen.getByRole("searchbox", { name: "jury.login.searchLabel" }),
      { target: { value: "sule" } }
    );

    expect(screen.getByText("Hafiz Suleiman")).toBeTruthy();
    expect(screen.queryByText("Qari Nazim Patel")).toBeNull();
    expect(screen.queryByText("Maulana Ubaidullah Imtiaz")).toBeNull();
  });

  it("requires confirmation before logging in as the selected juror", async () => {
    const onLoginSuccess = vi.fn();
    const selectedJury = juryMembers[1];
    mocks.authenticateJury.mockResolvedValue(selectedJury);

    render(<JuryLogin onLoginSuccess={onLoginSuccess} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Select Maulana Ubaidullah Imtiaz",
      })
    );

    expect(mocks.authenticateJury).not.toHaveBeenCalled();
    expect(
      screen.getByText("Continue as Maulana Ubaidullah Imtiaz?")
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "jury.login.continue" })
    );

    await waitFor(() => {
      expect(mocks.authenticateJury).toHaveBeenCalledWith(
        "mozambique-2026",
        "jury-ubaidullah"
      );
    });
    expect(mocks.setAuthenticatedJury).toHaveBeenCalledWith(
      "mozambique-2026",
      "jury-ubaidullah"
    );
    expect(onLoginSuccess).toHaveBeenCalledWith(selectedJury);
  });

  it("does not store a jury session when the selected member disappeared", async () => {
    mocks.authenticateJury.mockResolvedValue(null);

    render(<JuryLogin onLoginSuccess={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Select Hafiz Suleiman" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "jury.login.continue" })
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "jury.login.error.invalidDesc"
    );
    expect(mocks.setAuthenticatedJury).not.toHaveBeenCalled();
  });
});

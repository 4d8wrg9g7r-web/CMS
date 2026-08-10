import { describe, expect, it, vi } from "vitest";
import { ConsoleEmailProvider } from "../ConsoleEmailProvider";
import { getEmailProvider } from "../index";

describe("ConsoleEmailProvider", () => {
  it("logs the email instead of sending it over the network", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const provider = new ConsoleEmailProvider();

    await provider.sendEmail({ to: "someone@example.org", subject: "Test", text: "Hello" });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [line] = logSpy.mock.calls[0]!;
    expect(line).toContain("someone@example.org");
    expect(line).toContain("Test");
    logSpy.mockRestore();
  });
});

describe("getEmailProvider", () => {
  it("returns the console stub and caches the instance", () => {
    const first = getEmailProvider();
    const second = getEmailProvider();
    expect(first).toBeInstanceOf(ConsoleEmailProvider);
    expect(first).toBe(second);
  });
});

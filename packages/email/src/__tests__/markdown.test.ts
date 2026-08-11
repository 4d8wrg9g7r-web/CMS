import { describe, expect, it } from "vitest";
import { markdownToEmailBody, renderEmailHtml } from "../markdown";

describe("markdownToEmailBody", () => {
  it("escapes raw HTML so injected markup never survives", () => {
    const html = markdownToEmailBody('<script>alert("x")</script>\n\n<img src=x onerror=alert(1)>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders headings, bold, italic, and paragraphs", () => {
    const html = markdownToEmailBody("# Big News\n\nWe are **excited** to *announce* this.");
    expect(html).toContain("<h1");
    expect(html).toContain(">Big News</h1>");
    expect(html).toContain("<strong>excited</strong>");
    expect(html).toContain("<em>announce</em>");
    expect(html).toContain("<p ");
  });

  it("renders lists, blockquotes, and rules", () => {
    const html = markdownToEmailBody("- one\n- two\n\n1. first\n2. second\n\n> a quote\n\n---");
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
    expect((html.match(/<li/g) ?? []).length).toBe(4);
    expect(html).toContain("<blockquote");
    expect(html).toContain("<hr");
  });

  it("allows only http(s)/mailto links; others stay plain text", () => {
    const html = markdownToEmailBody(
      "[ok](https://example.org) [mail](mailto:hi@example.org) [bad](javascript:alert(1))",
    );
    expect(html).toContain('href="https://example.org"');
    expect(html).toContain('href="mailto:hi@example.org"');
    expect(html).not.toContain('href="javascript');
    expect(html).toContain("[bad](javascript:alert(1))");
  });

  it("turns single newlines into <br /> within a paragraph", () => {
    expect(markdownToEmailBody("line one\nline two")).toContain("line one<br />line two");
  });
});

describe("renderEmailHtml", () => {
  it("wraps the body in a 600px column and escapes the org name in the footer", () => {
    const html = renderEmailHtml("Hello **world**", { organizationName: "First & <Best> Church" });
    expect(html).toContain("max-width:600px");
    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain("First &amp; &lt;Best&gt; Church");
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });
});

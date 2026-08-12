import { describe, expect, it } from "vitest";
import { videoEmbedUrl } from "../site/video-embed";

describe("videoEmbedUrl", () => {
  it("embeds youtube watch URLs via the nocookie host", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
    );
  });

  it("embeds youtu.be short links", () => {
    expect(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("embeds youtube shorts, live, and embed paths", () => {
    expect(videoEmbedUrl("https://youtube.com/shorts/abc123XYZ_-")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123XYZ_-"
    );
    expect(videoEmbedUrl("https://www.youtube.com/live/abc123XYZ_-")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123XYZ_-"
    );
    expect(videoEmbedUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
    );
  });

  it("embeds vimeo page and player URLs", () => {
    expect(videoEmbedUrl("https://vimeo.com/76979871")).toBe("https://player.vimeo.com/video/76979871");
    expect(videoEmbedUrl("https://player.vimeo.com/video/76979871")).toBe("https://player.vimeo.com/video/76979871");
  });

  it("rejects unknown hosts", () => {
    expect(videoEmbedUrl("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(videoEmbedUrl("https://facebook.com/video/123")).toBeNull();
  });

  it("rejects malformed ids so arbitrary strings never become iframe sources", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=<script>")).toBeNull();
    expect(videoEmbedUrl('https://youtu.be/abc"onload')).toBeNull();
    expect(videoEmbedUrl("https://vimeo.com/not-digits")).toBeNull();
    expect(videoEmbedUrl("https://youtube.com/watch")).toBeNull();
  });

  it("rejects non-http protocols and non-URLs", () => {
    expect(videoEmbedUrl("javascript:alert(1)")).toBeNull();
    expect(videoEmbedUrl("not a url")).toBeNull();
    expect(videoEmbedUrl("")).toBeNull();
    expect(videoEmbedUrl(null)).toBeNull();
    expect(videoEmbedUrl(undefined)).toBeNull();
  });
});

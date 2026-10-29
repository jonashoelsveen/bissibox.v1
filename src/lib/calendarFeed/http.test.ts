import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rejectDisallowedOrigin } from "./http.ts";

function request(origin: string | null, url = "http://127.0.0.1:3000/api/calendar/subscriptions", host = "127.0.0.1:3000"): Request {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  headers.set("host", host);
  return new Request(url, { method: "POST", headers });
}

describe("subscription request origin", () => {
  it("allows the app hosts and the host the page was opened on", async () => {
    for (const origin of [
      null,
      "http://localhost:3000",
      "http://account.localhost:3000",
      "https://bissibox.com",
      "https://account.bissibox.com",
      "https://bissiboxcloud.com",
    ]) {
      assert.equal(await rejectDisallowedOrigin(request(origin))?.status ?? 200, 200, String(origin));
    }
    const lan = request("http://192.168.1.20:3000", "http://192.168.1.20:3000/api/calendar/subscriptions", "192.168.1.20:3000");
    assert.equal(await rejectDisallowedOrigin(lan), null);
  });

  it("rejects a different site", async () => {
    const response = await rejectDisallowedOrigin(request("https://evil.example"));
    assert.equal(response?.status, 403);
    assert.equal(await response?.json().then((body: { error?: string }) => body.error), "Origin not allowed");
  });
});

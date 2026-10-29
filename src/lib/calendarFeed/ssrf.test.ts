import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchCalendarFeed, isBlockedIp, safeLookup, type ResolvedAddress } from "./ssrf.ts";
import { FeedError } from "./types.ts";

const SECRET = "https://calendar.example/secret/feed.ics?token=super-secret";

function addresses(ips: string[]): ResolvedAddress[] {
  return ips.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
}

function resolveOf(map: Record<string, string[]>) {
  return async (hostname: string): Promise<ResolvedAddress[]> => addresses(map[hostname] ?? ["1.1.1.1"]);
}

function calendarResponse(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/calendar", ...headers },
  });
}

describe("feed fetch SSRF", () => {
  it("answers undici with the full address list", async () => {
    const lookup = safeLookup(async () => [{ address: "1.1.1.1", family: 4 }]);
    const listed = await new Promise<unknown>((resolve, reject) => {
      lookup("example.com", { all: true }, (error, address) => {
        if (error) reject(error);
        else resolve(address);
      });
    });
    assert.deepEqual(listed, [{ address: "1.1.1.1", family: 4 }]);
  });

  it("blocks private, loopback, mapped, and reserved addresses", () => {
    for (const ip of [
      "10.1.2.3",
      "127.0.0.1",
      "169.254.1.1",
      "192.168.1.1",
      "172.16.0.1",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "fd00::1",
      "fe80::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:10.0.0.1",
    ]) {
      assert.equal(isBlockedIp(ip), true, ip);
    }
    assert.equal(isBlockedIp("1.1.1.1"), false);
    assert.equal(isBlockedIp("8.8.8.8"), false);
    assert.equal(isBlockedIp("2606:4700:4700::1111"), false);
  });

  it("rejects a DNS answer that points at a private address and never logs the URL", async () => {
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      await assert.rejects(
        () =>
          fetchCalendarFeed({
            url: SECRET,
            resolve: resolveOf({ "calendar.example": ["10.0.0.5"] }),
            fetchImpl: async () => calendarResponse("BEGIN:VCALENDAR"),
          }),
        (error: unknown) => {
          assert.ok(error instanceof FeedError);
          assert.equal(error.code, "forbidden_host");
          assert.equal(error.message.includes("secret"), false);
          assert.equal(error.message.includes("calendar.example"), false);
          return true;
        },
      );
    } finally {
      console.error = original;
    }
    assert.equal(JSON.stringify(errors).includes("secret"), false);
    assert.equal(JSON.stringify(errors).includes(SECRET), false);
  });

  it("rejects private IPv6 and IPv4-mapped answers", async () => {
    for (const ip of ["fd12:3456::1", "::ffff:192.168.0.9"]) {
      await assert.rejects(
        () =>
          fetchCalendarFeed({
            url: "https://calendar.example/feed.ics",
            resolve: async () => addresses([ip]),
            fetchImpl: async () => calendarResponse("BEGIN:VCALENDAR"),
          }),
        (error: unknown) => error instanceof FeedError && error.code === "forbidden_host",
      );
    }
  });

  it("rejects a redirect onto a private host and a fourth redirect", async () => {
    const seen: string[] = [];
    await assert.rejects(
      () =>
        fetchCalendarFeed({
          url: "https://calendar.example/start.ics",
          resolve: resolveOf({
            "calendar.example": ["1.1.1.1"],
            "internal.example": ["192.168.1.20"],
          }),
          fetchImpl: async (url) => {
            seen.push(url);
            return new Response(null, { status: 302, headers: { location: "https://internal.example/hidden.ics" } });
          },
        }),
      (error: unknown) => error instanceof FeedError && error.code === "forbidden_host",
    );
    assert.equal(seen.length, 1);

    let hops = 0;
    await assert.rejects(
      () =>
        fetchCalendarFeed({
          url: "https://calendar.example/start.ics",
          resolve: resolveOf({ "calendar.example": ["1.1.1.1"] }),
          fetchImpl: async (url) => {
            hops += 1;
            const next = new URL(url);
            next.searchParams.set("hop", String(hops));
            return new Response(null, { status: 302, headers: { location: next.toString() } });
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof FeedError);
        assert.equal(error.code, "unreachable");
        assert.equal(error.message, "Too many redirects.");
        return true;
      },
    );
    assert.equal(hops, 4);
  });

  it("stops a body over 10 MB", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const limit = 10 * 1024 * 1024 + chunk.byteLength;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= limit) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
        sent += chunk.byteLength;
      },
    });
    await assert.rejects(
      () =>
        fetchCalendarFeed({
          url: "https://calendar.example/big.ics",
          resolve: resolveOf({ "calendar.example": ["1.1.1.1"] }),
          fetchImpl: async () => new Response(stream, { status: 200, headers: { "content-type": "text/calendar" } }),
        }),
      (error: unknown) => error instanceof FeedError && error.code === "too_large",
    );
  });

  it("times out a slow response", async () => {
    await assert.rejects(
      () =>
        fetchCalendarFeed({
          url: "https://calendar.example/slow.ics",
          timeoutMs: 30,
          resolve: resolveOf({ "calendar.example": ["1.1.1.1"] }),
          fetchImpl: (_url, init) =>
            new Promise((_resolve, reject) => {
              const abort = () => reject(Object.assign(new Error("timed out"), { name: "TimeoutError" }));
              if (init.signal?.aborted) abort();
              init.signal?.addEventListener("abort", abort);
            }),
        }),
      (error: unknown) => error instanceof FeedError && error.code === "timeout",
    );
  });

  it("rejects a body that is not a calendar", async () => {
    await assert.rejects(
      () =>
        fetchCalendarFeed({
          url: "https://calendar.example/page",
          resolve: resolveOf({ "calendar.example": ["1.1.1.1"] }),
          fetchImpl: async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
        }),
      (error: unknown) => error instanceof FeedError && error.code === "not_calendar",
    );
  });
});

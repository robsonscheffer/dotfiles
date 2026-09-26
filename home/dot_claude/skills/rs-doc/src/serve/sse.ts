// A tiny server-sent-events hub for live reload. One broadcast fans out to
// every connected client.
export interface SseHub {
  subscribe(): Response;
  broadcast(event: string): void;
  clientCount(): number;
  closeAll(): void;
}

export function createSseHub(): SseHub {
  const controllers = new Set<ReadableStreamDefaultController<Uint8Array>>();

  function subscribe(): Response {
    let ctrl: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        ctrl = controller;
        controllers.add(controller);
        controller.enqueue(new TextEncoder().encode(": connected\n\n"));
      },
      cancel() {
        controllers.delete(ctrl);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  function broadcast(event: string): void {
    const payload = new TextEncoder().encode(`data: ${event}\n\n`);
    for (const controller of controllers) {
      try {
        controller.enqueue(payload);
      } catch {
        controllers.delete(controller);
      }
    }
  }

  function clientCount(): number {
    return controllers.size;
  }

  function closeAll(): void {
    for (const controller of controllers) {
      try {
        controller.close();
      } catch {
        // already closed
      }
    }
    controllers.clear();
  }

  return { subscribe, broadcast, clientCount, closeAll };
}

export const LIVE_RELOAD_PATH = "/__mate-doc/events";

export function liveReloadClientScript(): string {
  return `<script>
(function () {
  var es = new EventSource(${JSON.stringify(LIVE_RELOAD_PATH)});
  es.onmessage = function (e) {
    if (e.data === "reload") location.reload();
  };
})();
</script>`;
}

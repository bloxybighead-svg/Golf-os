// Web Worker that ranks the clubs off the page's main thread, so the map
// never stutters while 13 clubs x 61 aim offsets are simulated. All the
// logic is in rankRequest.ts; this file only connects it to postMessage.

import { createRankHandler, type RankMessage, type RankReply } from "./rankRequest"

// The DOM typings describe `self` as a Window; inside a worker it's the worker scope.
const scope = self as unknown as {
  onmessage: ((e: { data: RankMessage }) => void) | null
  postMessage: (reply: RankReply) => void
}

const handle = createRankHandler()

scope.onmessage = (e) => {
  const reply = handle(e.data)
  if (reply) scope.postMessage(reply)
}

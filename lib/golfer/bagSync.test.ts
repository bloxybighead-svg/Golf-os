import { describe, expect, it } from "vitest"
import { DEFAULT_BAG } from "./bag"
import { decideSync, mergeRemote, settingsFromRow, settingsToRow, stampMs, type SyncedSettings } from "./bagSync"

const local: SyncedSettings = {
  source: "handicap",
  handicap: 10,
  driverCarry: "250",
  sevenIronCarry: "150",
  carries: { PW: 120 },
  tendency: { side: "auto", strength: "moderate" },
  bags: { calibrated: DEFAULT_BAG, handicap: DEFAULT_BAG },
}

describe("decideSync: newest wins", () => {
  it("takes the account on a fresh device", () => {
    expect(decideSync(null, 1000)).toBe("use-remote")
    expect(decideSync(0, 1000)).toBe("use-remote")
  })
  it("pushes a device edit made after the account's last change", () => {
    expect(decideSync(2000, 1000)).toBe("push-local")
  })
  it("takes the account when it changed after the device", () => {
    expect(decideSync(1000, 2000)).toBe("use-remote")
  })
  it("is in sync on a tie, or when neither ever changed", () => {
    expect(decideSync(1500, 1500)).toBe("in-sync")
    expect(decideSync(null, null)).toBe("in-sync")
  })
})

describe("stampMs", () => {
  it("reads an ISO time and rejects junk", () => {
    expect(stampMs("2026-10-01T12:00:00.000Z")).toBe(Date.parse("2026-10-01T12:00:00.000Z"))
    expect(stampMs("nope")).toBeNull()
    expect(stampMs(null)).toBeNull()
  })
})

describe("settings <-> row", () => {
  it("round-trips through the columns", () => {
    const row = settingsToRow({ ...local, bags: { calibrated: ["Driver", "7-Iron"], handicap: ["Driver", "PW"] } })
    expect(row.carries).toMatchObject({ Driver: 250, "7-Iron": 150, PW: 120 })
    const back = settingsFromRow({ ...row })
    expect(back.driverCarry).toBe("250")
    expect(back.sevenIronCarry).toBe("150")
    expect(back.carries).toEqual({ PW: 120 })
    expect(back.bags).toEqual({ calibrated: ["Driver", "7-Iron"], handicap: ["Driver", "PW"] })
    expect(back.tendency).toEqual(local.tendency)
    expect(back.source).toBe("handicap")
  })
  it("leaves out what an older row does not have, so the device values stay", () => {
    const remote = settingsFromRow({ handicap_index: 4.2, carries: { Driver: 262 } })
    expect(remote.bags).toBeUndefined()
    expect(remote.tendency).toBeUndefined()
    const merged = mergeRemote(local, remote)
    expect(merged.handicap).toBe(4.2)
    expect(merged.driverCarry).toBe("262")
    expect(merged.sevenIronCarry).toBe("") // the account's carries are the whole truth for carries
    expect(merged.bags).toEqual(local.bags)
    expect(merged.tendency).toEqual(local.tendency)
  })
  it("ignores junk values", () => {
    const r = settingsFromRow({ source: "evil", tendency: { side: "up", strength: "x" }, bag: { calibrated: ["Putter"], handicap: [] }, carries: { Driver: 9000 } })
    expect(r.source).toBeUndefined()
    expect(r.tendency).toBeUndefined()
    expect(r.bags).toBeUndefined()
    expect(r.driverCarry).toBe("")
  })
})

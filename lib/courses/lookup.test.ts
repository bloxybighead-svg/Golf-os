import { describe, expect, it } from "vitest"
import { parseCourseLocation } from "./lookup"

describe("parseCourseLocation", () => {
  it("reads lat, lng and name from an OpenGolfAPI course record", () => {
    expect(parseCourseLocation({ lat: 36.5685, lng: -121.949, course_name: "Pebble Beach Golf Links" })).toEqual({
      lat: 36.5685,
      lng: -121.949,
      name: "Pebble Beach Golf Links",
    })
  })
  it("rejects records without usable coordinates", () => {
    expect(parseCourseLocation({ course_name: "X" })).toBeNull()
    expect(parseCourseLocation({ lat: null, lng: null })).toBeNull()
    expect(parseCourseLocation({ lat: 123, lng: 0 })).toBeNull()
    expect(parseCourseLocation(null)).toBeNull()
  })
})

import { describe, expect, it } from "vitest"
import { formFromPayload, parsePayload, wifiPayload } from "../src/lib/payload.js"

describe("wifiPayload", () => {
  it("builds the WIFI: format", () => {
    expect(wifiPayload({ ssid: "casa", password: "1234" })).toBe("WIFI:T:WPA;S:casa;P:1234;;")
  })

  it("escapes the reserved characters", () => {
    expect(wifiPayload({ ssid: 'a;b,c:d"e\\f', password: "p;w" })).toBe('WIFI:T:WPA;S:a\\;b\\,c\\:d\\"e\\\\f;P:p\\;w;;')
  })

  it("leaves the password out of open networks and marks hidden ones", () => {
    expect(wifiPayload({ ssid: "bar", password: "ignored", security: "nopass", hidden: true })).toBe(
      "WIFI:T:nopass;S:bar;H:true;;",
    )
  })

  it("round trips through parsePayload", () => {
    const wifi = { ssid: 'a;b,c:d"e\\f', password: "p;w:x", security: "WEP", hidden: true }
    expect(parsePayload(wifiPayload(wifi))).toMatchObject({ type: "wifi", ...wifi })
  })
})

describe("parsePayload", () => {
  it("recognises links", () => {
    expect(parsePayload("https://example.com/a?b=1")).toMatchObject({ type: "url", href: "https://example.com/a?b=1" })
    expect(parsePayload("www.example.com")).toMatchObject({ type: "url", href: "https://www.example.com/" })
  })

  it("never turns a script into a link", () => {
    for (const text of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,<b>x</b>", "vbscript:x"]) {
      const result = parsePayload(text)
      expect(result.type).toBe("text")
      expect(result.href).toBeUndefined()
    }
  })

  it("recognises WiFi networks", () => {
    expect(parsePayload("WIFI:S:Mi red;T:WPA;P:clave;H:false;;")).toMatchObject({
      type: "wifi",
      ssid: "Mi red",
      password: "clave",
      security: "WPA",
      hidden: false,
    })
    expect(parsePayload("WIFI:S:abierta;;")).toMatchObject({ type: "wifi", security: "nopass", password: "" })
  })

  it("recognises email, phone and SMS", () => {
    expect(parsePayload("mailto:hola@example.com?subject=Hi")).toMatchObject({
      type: "email",
      address: "hola@example.com",
      href: "mailto:hola@example.com?subject=Hi",
    })
    expect(parsePayload("tel:+34 600 11 22 33")).toMatchObject({ type: "tel", href: "tel:+34600112233" })
    expect(parsePayload("SMSTO:+34600112233:Hola: qué tal")).toMatchObject({
      type: "sms",
      number: "+34600112233",
      body: "Hola: qué tal",
      href: "sms:+34600112233?body=Hola%3A%20qu%C3%A9%20tal",
    })
    expect(parsePayload("sms:600112233?body=hey")).toMatchObject({ type: "sms", href: "sms:600112233?body=hey" })
  })

  it("recognises locations and contacts", () => {
    expect(parsePayload("geo:40.4168,-3.7038")).toMatchObject({ type: "geo", lat: "40.4168", lon: "-3.7038" })
    expect(parsePayload("BEGIN:VCARD\nVERSION:3.0\nFN:Ada Lovelace\nEND:VCARD")).toMatchObject({
      type: "contact",
      name: "Ada Lovelace",
    })
  })

  it("falls back to plain text", () => {
    expect(parsePayload("hola mundo")).toEqual({ type: "text", label: "Texto" })
    expect(parsePayload("tel:")).toMatchObject({ type: "text" })
  })
})

describe("formFromPayload", () => {
  it("fills in the WiFi fields with a network", () => {
    expect(formFromPayload("WIFI:S:casa;T:WEP;P:1234;H:true;;")).toEqual({
      mode: "wifi",
      wifi: { ssid: "casa", password: "1234", security: "WEP", hidden: true },
    })
    expect(formFromPayload("WIFI:S:abierta;;")).toEqual({
      mode: "wifi",
      wifi: { ssid: "abierta", password: "", security: "nopass", hidden: false },
    })
  })

  it("takes every flavour of WPA as the form's WPA", () => {
    for (const security of ["WPA", "wpa", "WPA2", "WPA3", "SAE"]) {
      expect(formFromPayload(`WIFI:T:${security};S:casa;P:1234;;`).wifi).toMatchObject({ security: "WPA" })
    }
  })

  it("keeps as text what the WiFi fields can't hold", () => {
    const enterprise = "WIFI:T:WPA2-EAP;S:empresa;E:PEAP;I:ada;P:1234;;"
    expect(formFromPayload(enterprise)).toEqual({ mode: "text", text: enterprise })
  })

  it("puts anything else in the text, as it is", () => {
    expect(formFromPayload("https://example.com")).toEqual({ mode: "text", text: "https://example.com" })
    expect(formFromPayload("  hola\n")).toEqual({ mode: "text", text: "  hola\n" })
  })
})

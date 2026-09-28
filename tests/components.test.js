// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { Component79 } from "jq79"
import Workspace from "../src/components/Workspace.html"
import ScanResult from "../src/components/ScanResult.html"
import { qrMatrix, qrPath } from "../src/lib/qr.js"
import { wifiPayload } from "../src/lib/payload.js"
import { scanImageFile } from "../src/lib/scan.js"

// jsdom can't load images: what a picture holds is up to each test
vi.mock("../src/lib/scan.js", async importOriginal => ({ ...(await importOriginal()), scanImageFile: vi.fn() }))

const mounted = []

const mount = async (definition, data) => {
  const host = document.createElement("div")
  document.body.append(host)
  const component = new Component79(definition).mount(host, data)
  mounted.push(component)
  // setup scripts await their imports before the first render
  await vi.waitFor(() => expect(host.children.length).toBeGreaterThan(0))
  return { host, component }
}

const type = (element, value) => {
  element.value = value
  element.dispatchEvent(new Event("input", { bubbles: true }))
}

// jsdom has no DataTransfer: the event only needs the files
const pasteInto = (target, ...files) => {
  const event = new Event("paste", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "clipboardData", { value: { files } })
  target.dispatchEvent(event)
  return event
}

const paste = (...files) => pasteInto(document.body, ...files)

const image = () => new File(["png"], "qr.png", { type: "image/png" })

const drawn = content => qrPath(qrMatrix(content, { ecc: "M" }))

beforeAll(() => {
  // not in jsdom
  Element.prototype.scrollIntoView = () => {}
})

afterEach(() => {
  mounted.splice(0).forEach(component => component.destroy())
  document.body.innerHTML = ""
  localStorage.clear()
  vi.mocked(scanImageFile).mockReset()
})

describe("Workspace", () => {
  it("draws the code for the text as it is typed", async () => {
    const { host } = await mount(Workspace)
    expect(host.querySelector("svg.qr")).toBeNull()
    expect(host.querySelector(".btn.primary").disabled).toBe(true)

    type(host.querySelector("textarea"), "hola")

    await vi.waitFor(() => expect(host.querySelector("svg.qr path")).not.toBeNull())
    expect(host.querySelector("svg.qr path").getAttribute("d")).toBe(drawn("hola"))
    expect(host.querySelector(".btn.primary").disabled).toBe(false)
    expect(host.querySelector(".meta").textContent).toContain("21×21")
  })

  it("encodes a WiFi network", async () => {
    const { host } = await mount(Workspace)
    ;[...host.querySelectorAll(".segmented button")].find(button => button.textContent === "WiFi").click()

    await vi.waitFor(() => expect(host.querySelector("input[name=ssid]")).not.toBeNull())
    type(host.querySelector("input[name=ssid]"), "casa")
    type(host.querySelector("input[name=password]"), "1234")

    const expected = drawn(wifiPayload({ ssid: "casa", password: "1234" }))
    await vi.waitFor(() => expect(host.querySelector("svg.qr path")?.getAttribute("d")).toBe(expected))
  })

  it("explains when the content doesn't fit", async () => {
    const { host } = await mount(Workspace)
    type(host.querySelector("textarea"), "x".repeat(5000))

    await vi.waitFor(() => expect(host.querySelector(".message.error")).not.toBeNull())
    expect(host.querySelector("svg.qr")).toBeNull()
  })

  it("fills in the form with a pasted code and draws it there", async () => {
    vi.mocked(scanImageFile).mockResolvedValue("https://example.com")
    const { host } = await mount(Workspace)

    expect(paste(image()).defaultPrevented).toBe(true)

    await vi.waitFor(() => expect(host.querySelector("textarea").value).toBe("https://example.com"))
    await vi.waitFor(() => expect(host.querySelector("svg.qr path")?.getAttribute("d")).toBe(drawn("https://example.com")))
    expect(host.querySelector(".read-result .badge").textContent).toBe("Enlace")
    expect(host.querySelector(".history").textContent).toContain("https://example.com")
  })

  it("fills in the WiFi fields with a pasted network", async () => {
    vi.mocked(scanImageFile).mockResolvedValue("WIFI:S:casa;T:WEP;P:1234;H:true;;")
    const { host } = await mount(Workspace)

    paste(image())

    await vi.waitFor(() => expect(host.querySelector("input[name=ssid]")?.value).toBe("casa"))
    expect(host.querySelector("select[name=security]").value).toBe("WEP")
    expect(host.querySelector("input[name=password]").value).toBe("1234")
    expect(host.querySelector("input[name=hidden]").checked).toBe(true)
    const network = { ssid: "casa", password: "1234", security: "WEP", hidden: true }
    await vi.waitFor(() => expect(host.querySelector("svg.qr path")?.getAttribute("d")).toBe(drawn(wifiPayload(network))))
    expect(host.querySelector(".read-result .badge").textContent).toBe("Red WiFi")
    // the instances of the earlier tests are gone from the page and don't read it too
    expect(scanImageFile).toHaveBeenCalledTimes(1)
  })

  it("drops the details of what was read once the form is edited", async () => {
    vi.mocked(scanImageFile).mockResolvedValue("hola")
    const { host } = await mount(Workspace)

    paste(image())
    await vi.waitFor(() => expect(host.querySelector(".read-result")).not.toBeNull())

    type(host.querySelector("textarea"), "hola mundo")
    await vi.waitFor(() => expect(host.querySelector(".read-result")).toBeNull())
    expect(host.querySelector("svg.qr path").getAttribute("d")).toBe(drawn("hola mundo"))
  })

  it("says so when a picture has no code", async () => {
    vi.mocked(scanImageFile).mockResolvedValue(null)
    const { host } = await mount(Workspace)
    type(host.querySelector("textarea"), "hola")

    paste(image())

    await vi.waitFor(() => expect(host.querySelector(".error[role=alert]")).not.toBeNull())
    expect(host.querySelector("textarea").value).toBe("hola")
  })

  it("leaves pasted text to the form", async () => {
    const { host } = await mount(Workspace)
    expect(paste().defaultPrevented).toBe(false)
    expect(scanImageFile).not.toHaveBeenCalled()
    expect(host.querySelector(".error[role=alert]")).toBeNull()
  })

  it("reads an image pasted into the stage, and says so when it isn't one", async () => {
    vi.mocked(scanImageFile).mockResolvedValue("hola")
    const { host } = await mount(Workspace)
    const target = host.querySelector(".stage .paste-target")
    expect(target.getAttribute("contenteditable")).toBe("true")

    pasteInto(target)
    await vi.waitFor(() => expect(host.querySelector(".error[role=alert]")?.textContent).toContain("no es una imagen"))

    expect(pasteInto(target, image()).defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(host.querySelector("textarea").value).toBe("hola"))
    expect(host.querySelector(".error[role=alert]")).toBeNull()
  })

  it("takes Ctrl+V to the stage wherever the focus is, and then gives it back", async () => {
    const { host } = await mount(Workspace)
    const pressCtrlV = element =>
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true }))

    const button = host.querySelector(".segmented button")
    button.focus()
    pressCtrlV(button)
    expect(document.activeElement).toBe(host.querySelector(".paste-target"))
    await vi.waitFor(() => expect(document.activeElement).toBe(button))

    // a text field pastes on its own
    const textarea = host.querySelector("textarea")
    textarea.focus()
    pressCtrlV(textarea)
    expect(document.activeElement).toBe(textarea)
  })
})

describe("ScanResult", () => {
  it("offers to open links", async () => {
    const { host } = await mount(ScanResult, { payload: "https://example.com" })
    const link = host.querySelector("a.btn")
    expect(host.querySelector(".badge").textContent).toBe("Enlace")
    expect(link.getAttribute("href")).toBe("https://example.com/")
    expect(link.getAttribute("target")).toBe("_blank")
  })

  it("shows WiFi details", async () => {
    const { host } = await mount(ScanResult, { payload: "WIFI:T:WPA;S:casa;P:1234;;" })
    expect(host.querySelector(".badge").textContent).toBe("Red WiFi")
    expect(host.querySelector(".details").textContent).toContain("casa")
    expect(host.querySelector(".details").textContent).toContain("1234")
  })

  it("never links a script", async () => {
    const { host } = await mount(ScanResult, { payload: "javascript:alert(1)" })
    expect(host.querySelector("a")).toBeNull()
    expect(host.querySelector(".content").textContent).toBe("javascript:alert(1)")
  })
})

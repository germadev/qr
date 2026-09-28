// What a QR code carries is just text; these helpers build the well-known
// formats on the generator side and recognise them on the reader side

export const WIFI_SECURITY = {
  WPA: "WPA/WPA2/WPA3",
  WEP: "WEP",
  nopass: "Sin contraseña",
}

const escapeWifi = value => String(value).replace(/([\\;,":])/g, "\\$1")

export function wifiPayload({ ssid = "", password = "", security = "WPA", hidden = false } = {}) {
  const fields = [`T:${security}`, `S:${escapeWifi(ssid)}`]
  if (security !== "nopass") fields.push(`P:${escapeWifi(password)}`)
  if (hidden) fields.push("H:true")
  return `WIFI:${fields.join(";")};;`
}

function parseWifi(text) {
  const fields = {}
  let key = ""
  let value = ""
  let inKey = true

  for (let i = "WIFI:".length; i < text.length; i++) {
    let char = text[i]
    if (char === "\\" && i + 1 < text.length) {
      char = text[++i]
    } else if (char === ":" && inKey) {
      inKey = false
      continue
    } else if (char === ";") {
      if (key) fields[key.toUpperCase()] = value
      key = value = ""
      inKey = true
      continue
    }
    if (inKey) key += char
    else value += char
  }
  if (key) fields[key.toUpperCase()] = value

  const security = fields.T || (fields.P ? "WPA" : "nopass")
  return {
    ssid: fields.S ?? "",
    password: security === "nopass" ? "" : fields.P ?? "",
    security,
    securityLabel: WIFI_SECURITY[security] ?? security,
    hidden: /^true$/i.test(fields.H ?? ""),
  }
}

const cleanNumber = number => number.replace(/[^\d+*#]/g, "")

const decode = value => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const sms = (number, body) => {
  const clean = cleanNumber(decode(number))
  return {
    type: "sms",
    label: "SMS",
    number: clean,
    body,
    href: `sms:${clean}${body ? `?body=${encodeURIComponent(body)}` : ""}`,
    action: "Enviar SMS",
  }
}

const webUrl = candidate => {
  try {
    const url = new URL(candidate)
    return /^https?:$/.test(url.protocol) ? url : null
  } catch {
    return null
  }
}

// Recognises the content of a scanned code. Every `href` it returns uses a
// scheme that is safe to open (http, https, mailto, tel, sms): a code saying
// `javascript:…` is plain text here, never a link
export function parsePayload(raw) {
  const text = String(raw ?? "").trim()

  if (/^WIFI:/i.test(text)) {
    const wifi = parseWifi(text)
    if (wifi.ssid) return { type: "wifi", label: "Red WiFi", ...wifi }
  }

  const url = /^https?:\/\//i.test(text)
    ? webUrl(text)
    : /^www\.[^\s/]+\.[^\s]+$/i.test(text)
      ? webUrl(`https://${text}`)
      : null
  if (url) return { type: "url", label: "Enlace", href: url.href, action: "Abrir enlace" }

  if (/^mailto:\S/i.test(text)) {
    const address = decode(text.slice("mailto:".length).split("?")[0])
    return { type: "email", label: "Email", address, href: text, action: "Escribir email" }
  }

  if (/^tel:/i.test(text)) {
    const number = decode(text.slice("tel:".length)).trim()
    if (cleanNumber(number)) {
      return { type: "tel", label: "Teléfono", number, href: `tel:${cleanNumber(number)}`, action: "Llamar" }
    }
  }

  if (/^smsto:/i.test(text)) {
    const [, number = "", ...body] = text.split(":")
    if (cleanNumber(number)) return sms(number, body.join(":"))
  }

  if (/^sms:/i.test(text)) {
    const [number, query = ""] = text.slice("sms:".length).split("?")
    if (cleanNumber(number)) return sms(number, new URLSearchParams(query).get("body") ?? "")
  }

  const geo = text.match(/^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i)
  if (geo) {
    const [, lat, lon] = geo
    return {
      type: "geo",
      label: "Ubicación",
      lat,
      lon,
      href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`,
      action: "Ver en el mapa",
    }
  }

  if (/^BEGIN:VCARD/i.test(text)) {
    const name = text.match(/^FN[^:\r\n]*:(.*)$/im)?.[1]?.trim() ?? ""
    return { type: "contact", label: "Contacto", name }
  }

  return { type: "text", label: "Texto" }
}

// the generator's WiFi form only knows these; WPA2, WPA3 and SAE are all its WPA
const FORM_SECURITY = [
  [/^WPA\d?$|^SAE$/i, "WPA"],
  [/^WEP$/i, "WEP"],
  [/^nopass$/i, "nopass"],
]

// The generator's form filled in with a code that was read: a WiFi network
// goes into the WiFi fields and anything else into the text, as it is. An
// enterprise network (WPA2-EAP…) carries fields the form doesn't have, so it
// stays text, which encodes it again unchanged
export function formFromPayload(raw) {
  const text = String(raw ?? "")
  const info = parsePayload(text)
  const security = info.type === "wifi" && FORM_SECURITY.find(([pattern]) => pattern.test(info.security))?.[1]
  if (!security) return { mode: "text", text }
  return { mode: "wifi", wifi: { ssid: info.ssid, password: info.password, security, hidden: info.hidden } }
}

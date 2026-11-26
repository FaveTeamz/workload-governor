import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'
import { afterAll, afterEach } from 'vitest'

// jsdom doesn't implement HTMLDialogElement — polyfill enough for tests
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open')
}

configure({ asyncUtilTimeout: 3000 })

const unmockedRequests = new Set<string>()
const originalFetch = globalThis.fetch
const originalXhrSend = XMLHttpRequest.prototype.send

function unmockedRequest(transport: string, target: string) {
  const description = `${transport} ${target}`
  unmockedRequests.add(description)
  return new Error(`Unmocked network request: ${description}`)
}

globalThis.fetch = async (input) => {
  const target = typeof input === 'object' && 'url' in input ? input.url : String(input)
  throw unmockedRequest('fetch', target)
}
XMLHttpRequest.prototype.send = function () {
  throw unmockedRequest('XMLHttpRequest', 'send')
}

afterEach(() => {
  const requests = [...unmockedRequests]
  unmockedRequests.clear()
  if (requests.length) throw new Error(`Unmocked network requests: ${requests.join(', ')}`)
})

afterAll(() => {
  globalThis.fetch = originalFetch
  XMLHttpRequest.prototype.send = originalXhrSend
})

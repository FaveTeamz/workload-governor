import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'

// jsdom doesn't implement HTMLDialogElement — polyfill enough for tests
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open')
}

configure({ asyncUtilTimeout: 3000 })

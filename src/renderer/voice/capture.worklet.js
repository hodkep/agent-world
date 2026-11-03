// Runs on the audio thread: hands each block of microphone samples to the page.
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const c = inputs[0] && inputs[0][0]
    if (c) this.port.postMessage(c.slice())
    return true
  }
}
registerProcessor('aw-capture', Capture)

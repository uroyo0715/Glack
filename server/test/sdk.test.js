import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startServer, stopServer, getBaseUrl } from './helpers.js'

before(startServer)
after(stopServer)

test('GET /sdk/unity streams a non-empty zip without requiring auth', async () => {
  const res = await fetch(`${getBaseUrl()}/sdk/unity`)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'application/zip')
  assert.match(res.headers.get('content-disposition') ?? '', /glank-unity-sdk\.zip/)
  const bytes = await res.arrayBuffer()
  assert.ok(bytes.byteLength > 1000) // 空/壊れたzipでないことのざっくりした確認

  // zipのファイル名はローカルファイルヘッダに平文で入るため、圧縮後のバイト列を
  // そのまま文字列として見てもファイル名の有無は確認できる（中身までは見ない）。
  const asText = Buffer.from(bytes).toString('latin1')
  assert.match(asText, /VERSION\.txt/)
})

test('GET /sdk/godot streams a non-empty zip without requiring auth', async () => {
  const res = await fetch(`${getBaseUrl()}/sdk/godot`)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'application/zip')
  assert.match(res.headers.get('content-disposition') ?? '', /glank-godot-sdk\.zip/)
  const bytes = await res.arrayBuffer()
  assert.ok(bytes.byteLength > 1000)
})

test('GET /sdk/:engine 404s for an unknown engine', async () => {
  const res = await fetch(`${getBaseUrl()}/sdk/unreal`)
  assert.equal(res.status, 404)
})

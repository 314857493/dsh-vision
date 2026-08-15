// Standalone test of the GLM transcription path (no harness needed).
import { readFile } from 'node:fs/promises'
import { transcribeAttachment, resolveApiKey, callGlm } from './index.js'

const key = await resolveApiKey()
console.log('api key resolved:', key ? key.slice(0, 8) + '...' : 'NO KEY')

const fakeAttachments = {
  readImage: async (ref) => ({
    ref: { attachmentId: ref.attachmentId, mediaType: 'image/png', bytes: (await readFile('D:/vibe/dsh-pc/.tmp/test.png')).byteLength },
    data: new Uint8Array(await readFile('D:/vibe/dsh-pc/.tmp/test.png')),
  }),
}

const text = await transcribeAttachment(
  fakeAttachments,
  { attachmentId: 'probe', mediaType: 'image/png' },
  undefined,
)
console.log('--- transcription ---')
console.log(text)
console.log('--- direct callGlm with key ---')
if (key) {
  const t = await callGlm('glm-4v-flash', `data:image/png;base64,${Buffer.from(await readFile('D:/vibe/dsh-pc/.tmp/test.png')).toString('base64')}`, '一句话回答：这张图片主色调是什么？', key, undefined)
  console.log(t)
}

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

function loadDevVars(): Record<string, string> {
  try {
    const content = readFileSync('.dev.vars', 'utf-8')
    return Object.fromEntries(
      content.trim().split('\n')
        .filter(line => line.includes('='))
        .map(line => {
          const idx = line.indexOf('=')
          return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
        })
    )
  } catch { return {} }
}

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true, // 포트 사용 중이면 다른 포트로 넘어가지 않고 에러 발생
  },
  plugins: [
    react(),
    {
      name: 'local-api',
      configureServer(server) {
        server.middlewares.use('/api/analyze', (req, res) => {
          if (req.method === 'OPTIONS') {
            res.writeHead(204)
            res.end()
            return
          }
          if (req.method !== 'POST') {
            res.writeHead(405)
            res.end()
            return
          }

          const vars = loadDevVars()
          const apiKey = vars.OPENAI_API_KEY

          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', async () => {
            try {
              const { height, weight, imageBase64 } = JSON.parse(body)

              const input: object[] = [
                {
                  role: 'system',
                  content: [{
                    type: 'input_text',
                    text: `당신은 10년 경력의 전문 퍼스널 스타일리스트입니다.
사용자의 신체 정보와 사진을 바탕으로 구체적이고 실용적인 스타일 컨설팅 보고서를 작성해주세요.
보고서는 다음 항목을 포함해야 합니다:
1. 체형 분석
2. 어울리는 스타일 키워드 (3~5개)
3. 추천 상의 스타일
4. 추천 하의 스타일
5. 추천 아우터
6. 피해야 할 스타일
7. 컬러 팔레트 추천
8. 종합 스타일링 팁

각 항목을 명확하게 구분하여 작성해주세요.`
                  }]
                }
              ]

              if (imageBase64) {
                input.push({
                  role: 'user',
                  content: [
                    { type: 'input_text', text: `키: ${height}cm, 몸무게: ${weight}kg\n위 사진과 신체 정보를 바탕으로 퍼스널 스타일 컨설팅 보고서를 작성해주세요.` },
                    { type: 'input_image', image_url: imageBase64 }
                  ]
                })
              } else {
                input.push({
                  role: 'user',
                  content: [
                    { type: 'input_text', text: `키: ${height}cm, 몸무게: ${weight}kg\n이 신체 정보를 바탕으로 퍼스널 스타일 컨설팅 보고서를 작성해주세요.` }
                  ]
                })
              }

              // 헤어스타일 이미지 생성 (이미지가 있을 때만, 텍스트 분석과 병렬 실행)
              let hairstyleFetch: Promise<Response> | null = null
              if (imageBase64) {
                const [header, b64data] = imageBase64.split(',')
                const mimeMatch = header.match(/:(.*?);/)
                const mime = mimeMatch ? mimeMatch[1] : 'image/png'
                const buffer = Buffer.from(b64data, 'base64')
                const imageBlob = new Blob([buffer], { type: mime })

                const imgForm = new FormData()
                imgForm.append('image', imageBlob, 'photo.png')
                imgForm.append('prompt', '너는 최고의 헤어스타일리스트야. 3x3 그리드로, 어떤 헤어스타일인지 설명과 함께 첨부한 사진 속 사람이랑 최고로 잘 어울리는 헤어스타일 9개 생성해줘. 단 첨부한 사람의 얼굴은 절대 바꾸지말고 기존 얼굴 그대로 유지하고 헤어스타일만 바꿔.')
                imgForm.append('model', 'gpt-image-1.5')
                imgForm.append('n', '1')
                imgForm.append('size', '1024x1024')
                imgForm.append('quality', 'auto')
                imgForm.append('background', 'auto')
                imgForm.append('moderation', 'auto')
                imgForm.append('input_fidelity', 'high')

                hairstyleFetch = fetch('https://api.openai.com/v1/images/edits', {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${apiKey}` },
                  body: imgForm,
                })
              }

              const textFetch = fetch('https://api.openai.com/v1/responses', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'gpt-4.1-mini',
                  input,
                  text: { format: { type: 'text' } },
                  reasoning: {},
                  tools: [],
                  temperature: 1,
                  max_output_tokens: 2048,
                  top_p: 1,
                  store: true,
                  include: ['web_search_call.action.sources'],
                }),
              })

              // 텍스트 분석 + 헤어스타일 이미지 병렬 실행
              const [openaiRes, hairstyleRes] = await Promise.all([textFetch, hairstyleFetch])

              if (!openaiRes.ok) {
                const err = await openaiRes.json() as { error?: { message?: string } }
                res.writeHead(openaiRes.status, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: err.error?.message || 'OpenAI API 오류가 발생했습니다.' }))
                return
              }

              const data = await openaiRes.json() as {
                output: { type: string; content?: { type: string; text: string }[] }[]
              }
              const messageItem = data.output?.find(
                (item: { type: string; content?: { type: string; text: string }[] }) =>
                  item.type === 'message' && item.content && item.content.length > 0
              )
              const result = messageItem?.content?.[0]?.text ?? '분석 결과가 없습니다.'

              let hairstyleImage: string | null = null
              if (hairstyleRes && hairstyleRes.ok) {
                const hairstyleData = await hairstyleRes.json() as { data: { b64_json: string }[] }
                hairstyleImage = `data:image/png;base64,${hairstyleData.data[0].b64_json}`
              }

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ result, hairstyleImage }))

            } catch (e) {
              console.error('API error:', e)
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: '서버 오류가 발생했습니다.' }))
            }
          })
        })
      }
    }
  ],
})

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
                    text: `You are a professional personal stylist with 10 years of experience. Based on the user's body information and provided photo, generate a concrete and practical style consulting report. The report must clearly separate and address the following items:

1. Body Shape Analysis (체형 분석): Provide detailed observations and reasoning based on the user's body data and photo before offering any analytic conclusion.
2. Suitable Style Keywords (어울리는 스타일 키워드, 3~5개): After analyzing, select 3-5 concise keywords that encapsulate the user's best style directions, making sure the reasoning precedes the keywords.
3. Recommended Tops (추천 상의 스타일): Support the recommendations by explaining why these tops suit the user's body type, then provide the list at the end.
4. Recommended Bottoms (추천 하의 스타일): Use analysis first, then conclude with specific styles that flatter the user.
5. Recommended Outerwear (추천 아우터): Reason about the user's silhouette and needs, and then suggest precise outerwear examples.
6. Styles to Avoid (피해야 할 스타일): First reason why certain styles are less suitable for the user's characteristics, and then list what should be avoided.
7. Recommended Color Palette (컬러 팔레트 추천): Reason about tone, contrast, and associated factors, then close with the recommended color palette.
8. Comprehensive Styling Tips (종합 스타일링 팁): Summarize and synthesize the above insights, ensuring initial reasoning steps are presented and a clear practical tip list concludes this section.

**Guidelines:**
- For every section, reasoning must precede conclusions, suggestions, keywords, or lists. Explicitly avoid giving conclusions or recommendations before showing your analysis.
- Organize the report with clear bold section headers and numbered items matching the above list.
- Be specific and actionable in all recommendations.
- If the user data or photo is ambiguous or unclear, note any assumptions you must make.
- All output should be in Korean.
- The response should be structured as a well-formatted markdown document, with each section separated and clearly titled.
- Length: Each section should be at least 2-3 sentences, with keywords and item lists separated for clarity.

**REMEMBER:**
- Begin each section with reasoning/observation, with the conclusion, keywords, or recommendations last.
- Keep all responses in clear, professional Korean.
- Use at least 2-3 sentences per section.
- Output the response as a structured, clearly formatted markdown article addressed to the client.

**Important Objective Reminder:**
For each numbered item, provide reasoning and observations FIRST, with any conclusions or lists LAST. Respond in professional Korean, using section headers, in markdown, with actionable and specific advice.`
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
                imgForm.append('prompt', '너는 최고의 헤어스타일리스타야. 첨부한 사진과 어울리는 헤어스타일로 바꿔줘')
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

interface Env {
    OPENAI_API_KEY: string;
}

interface RequestBody {
    height: string;
    weight: string;
    imageBase64?: string;
}

function dataURLtoBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    };

    try {
        const body: RequestBody = await context.request.json();
        const { height, weight, imageBase64 } = body;

        if (!height || !weight) {
            return new Response(JSON.stringify({ error: "키와 몸무게를 입력해주세요." }), {
                status: 400,
                headers: corsHeaders,
            });
        }

        const apiKey = context.env.OPENAI_API_KEY;
        if (!apiKey) {
            return new Response(JSON.stringify({ error: "서버 API Key가 설정되지 않았습니다." }), {
                status: 500,
                headers: corsHeaders,
            });
        }

        // 메시지 구성 (이미지가 있으면 Vision 모델 사용)
        const input: object[] = [
            {
                role: "system",
                content: [
                    {
                        type: "input_text",
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
For each numbered item, provide reasoning and observations FIRST, with any conclusions or lists LAST. Respond in professional Korean, using section headers, in markdown, with actionable and specific advice.`,
                    },
                ],
            },
        ];

        if (imageBase64) {
            input.push({
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: `키: ${height}cm, 몸무게: ${weight}kg\n위 사진과 신체 정보를 바탕으로 퍼스널 스타일 컨설팅 보고서를 작성해주세요.`,
                    },
                    {
                        type: "input_image",
                        image_url: imageBase64,
                    },
                ],
            });
        } else {
            input.push({
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: `키: ${height}cm, 몸무게: ${weight}kg\n이 신체 정보를 바탕으로 퍼스널 스타일 컨설팅 보고서를 작성해주세요.`,
                    },
                ],
            });
        }

        // 텍스트 분석 API 호출
        const textFetch = fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-4.1-mini",
                input,
                text: { format: { type: "text" } },
                reasoning: {},
                tools: [],
                temperature: 1,
                max_output_tokens: 2048,
                top_p: 1,
                store: true,
            }),
        });

        // 헤어스타일 이미지 생성 API 호출 (이미지가 있을 때만)
        let hairstyleFetch: Promise<Response> | null = null;
        if (imageBase64) {
            const imageBlob = dataURLtoBlob(imageBase64);
            const formData = new FormData();
            formData.append('image', imageBlob, 'photo.png');
            formData.append('prompt', '너는 최고의 헤어스타일리스타야. 첨부한 사진과 어울리는 헤어스타일로 바꿔줘');
            formData.append('model', 'gpt-image-1.5');
            formData.append('n', '1');
            formData.append('size', '1024x1024');
            formData.append('quality', 'auto');
            formData.append('background', 'auto');
            formData.append('moderation', 'auto');
            formData.append('input_fidelity', 'high');

            hairstyleFetch = fetch("https://api.openai.com/v1/images/edits", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
                body: formData,

            });
        }

        // 텍스트 분석 + 헤어스타일 생성을 병렬로 실행
        const [openaiResponse, hairstyleResponse] = await Promise.all([
            textFetch,
            hairstyleFetch,
        ]);

        if (!openaiResponse.ok) {
            const errorData = await openaiResponse.json() as { error?: { message?: string } };
            return new Response(
                JSON.stringify({ error: errorData.error?.message || "OpenAI API 오류가 발생했습니다." }),
                { status: openaiResponse.status, headers: corsHeaders }
            );
        }

        const data = await openaiResponse.json() as {
            output: { type: string; content?: { type: string; text: string }[] }[];
        };
        const messageItem = data.output.find(item => item.type === 'message' && item.content && item.content.length > 0);
        const result = messageItem?.content?.[0]?.text ?? '분석 결과가 없습니다.';

        // 헤어스타일 이미지 처리
        let hairstyleImage: string | null = null;
        if (hairstyleResponse) {
            if (hairstyleResponse.ok) {
                const hairstyleData = await hairstyleResponse.json() as {
                    data: { b64_json: string }[];
                };
                hairstyleImage = `data:image/png;base64,${hairstyleData.data[0].b64_json}`;
            }
            // 이미지 생성 실패 시 텍스트 결과만 반환
        }

        return new Response(JSON.stringify({ result, hairstyleImage }), {
            status: 200,
            headers: corsHeaders,
        });
    } catch (error) {
        console.error("Function error:", error);
        return new Response(JSON.stringify({ error: "서버 오류가 발생했습니다." }), {
            status: 500,
            headers: corsHeaders,
        });
    }
};

// OPTIONS 요청 처리 (CORS preflight)
export const onRequestOptions: PagesFunction = async () => {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
};

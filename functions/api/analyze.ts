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
        const messages: object[] = [
            {
                role: "system",
                content: `당신은 10년 경력의 전문 퍼스널 스타일리스트입니다.
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

각 항목을 명확하게 구분하여 작성해주세요.`,
            },
        ];

        if (imageBase64) {
            messages.push({
                role: "user",
                content: [
                    {
                        type: "text",
                        text: `키: ${height}cm, 몸무게: ${weight}kg\n위 사진과 신체 정보를 바탕으로 퍼스널 스타일 컨설팅 보고서를 작성해주세요.`,
                    },
                    {
                        type: "image_url",
                        image_url: { url: imageBase64 },
                    },
                ],
            });
        } else {
            messages.push({
                role: "user",
                content: `키: ${height}cm, 몸무게: ${weight}kg\n이 신체 정보를 바탕으로 퍼스널 스타일 컨설팅 보고서를 작성해주세요.`,
            });
        }

        // 텍스트 분석 API 호출
        const textFetch = fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages,
                max_tokens: 2000,
                temperature: 0.7,
            }),
        });

        // 헤어스타일 이미지 생성 API 호출 (이미지가 있을 때만)
        let hairstyleFetch: Promise<Response> | null = null;
        if (imageBase64) {
            const imageBlob = dataURLtoBlob(imageBase64);
            const formData = new FormData();
            formData.append('image', imageBlob, 'photo.png');
            formData.append('prompt', '너는 최고의 헤어스타일리스트야. 3x3 그리드로, 어떤 헤어스타일인지 설명과 함께 첨부한 사진 속 사람이랑 최고로 잘 어울리는 헤어스타일 9개 생성해줘. 단 첨부한 사람의 얼굴은 절대 바꾸지말고 기존 얼굴 그대로 유지하고 헤어스타일만 바꿔.');
            formData.append('model', 'gpt-image-1');
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
            choices: { message: { content: string } }[];
        };
        const result = data.choices[0].message.content;

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

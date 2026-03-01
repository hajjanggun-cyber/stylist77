import { createClient } from '@supabase/supabase-js'

interface Env {
    GEMINI_API_KEY: string;
    OPENAI_API_KEY: string;
    SUPABASE_URL: string;
    SUPABASE_SERVICE_KEY: string;
    POLAR_ACCESS_TOKEN: string;
}

interface RequestBody {
    height: string;
    weight: string;
    styleGoal?: string;
    imageBase64?: string;
    lang?: 'ko' | 'en';
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

const SYSTEM_PROMPT_KO = `당신은 10년 경력의 전문 퍼스널 스타일리스트 'Aura'입니다.
사용자의 신체 정보와 사진을 바탕으로 구체적이고 실용적인 스타일 컨설팅 보고서를 작성해주세요.
Gemini 3.1 Pro의 강력한 분석 능력을 사용하여 체형의 미세한 특징까지 잡아내어 조언해주세요.

보고서는 다음 항목을 포함해야 합니다:
1. 체형 분석 (상세히)
2. 어울리는 스타일 키워드 (3~5개)
3. 추천 상의 스타일
4. 추천 하의 스타일
5. 추천 아우터
6. 피해야 할 스타일
7. 컬러 팔레트 추천
8. 종합 스타일링 팁

각 항목을 마크다운 형식을 사용하여 명확하게 구분하여 작성해주세요.`;

const SYSTEM_PROMPT_EN = `You are 'Aura', a professional personal stylist with 10 years of experience.
Based on the user's body measurements and photo, write a detailed and practical style consulting report.
Utilize the advanced reasoning of Gemini 3.1 Pro to analyze subtle body characteristics and provide professional advice.

The report must include the following sections:
1. Detailed Body Type Analysis
2. Style Keywords (3–5 keywords)
3. Recommended Tops
4. Recommended Bottoms
5. Recommended Outerwear
6. Styles to Avoid
7. Color Palette Recommendations
8. Overall Styling Tips

Clearly separate each section using Markdown formatting.`;

const HAIRSTYLE_PROMPT_KO = '당신은 최고의 헤어스타일리스트입니다. 3x3 그리드 형태로, 어떤 헤어스타일인지 설명과 함께 첨부한 사진 속 인물에게 가장 잘 어울리는 헤어스타일 9개를 제안하는 이미지를 생성해주세요. 원본 인물의 얼굴 특징을 그대로 유지하며 헤어스타일만 변경해야 합니다.';

const HAIRSTYLE_PROMPT_EN = 'You are the world\'s best hairstylist. Generate a 3x3 grid of 9 hairstyles that best suit the person in the attached photo, with brief descriptions for each. Keep the person\'s original facial features exactly as they are and only change the hairstyles.';

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Guest-Mode, X-Guest-Token",
        "Content-Type": "application/json",
    };

    const guestMode = context.request.headers.get('X-Guest-Mode') === 'true'

    let supabase: ReturnType<typeof createClient> | null = null
    let paymentId: string | null = null

    if (guestMode) {
        // ── Guest: X-Guest-Token(checkout_id)으로 Polar에서 직접 결제 검증 ──
        const guestToken = context.request.headers.get('X-Guest-Token')
        if (!guestToken) {
            return new Response(JSON.stringify({ error: 'Guest token required' }), { status: 401, headers: corsHeaders })
        }
        const polarRes = await fetch(`https://api.polar.sh/v1/checkouts/${guestToken}`, {
            headers: { 'Authorization': `Bearer ${context.env.POLAR_ACCESS_TOKEN}` },
        })
        const checkout = await polarRes.json() as { status?: string }
        const confirmed = checkout.status === 'confirmed' || checkout.status === 'succeeded'
        if (!confirmed) {
            return new Response(JSON.stringify({ error: 'Payment not confirmed' }), { status: 402, headers: corsHeaders })
        }
    } else {
        // ── Auth: JWT 검증 ──
        const authHeader = context.request.headers.get('Authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
        }
        const token = authHeader.replace('Bearer ', '')

        supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_KEY)
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)

        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
        }

        // ── Payment: 미사용 결제 확인 ──
        const { data: payments, error: paymentFetchError } = await supabase
            .from('payments')
            .select('id')
            .eq('user_id', user.id)
            .is('used_at', null)
            .limit(1)

        if (paymentFetchError || !payments || payments.length === 0) {
            return new Response(JSON.stringify({ error: 'No valid payment found' }), { status: 402, headers: corsHeaders })
        }

        paymentId = payments[0].id as string

        // ── Payment: used_at atomic 업데이트 (double-use 방지) ──
        const { error: updateError } = await supabase
            .from('payments')
            .update({ used_at: new Date().toISOString() })
            .eq('id', paymentId)
            .is('used_at', null)

        if (updateError) {
            return new Response(JSON.stringify({ error: 'Payment already used or update failed' }), { status: 402, headers: corsHeaders })
        }
    }

    const rollback = async () => {
        if (supabase && paymentId) {
            await supabase.from('payments').update({ used_at: null }).eq('id', paymentId)
        }
    }

    try {
        const body: RequestBody = await context.request.json();
        const { height, weight, styleGoal, imageBase64, lang = 'ko' } = body;

        if (!height || !weight) {
            const msg = lang === 'en' ? "Please enter your height and weight." : "키와 몸무게를 입력해주세요.";
            await rollback()
            return new Response(JSON.stringify({ error: msg }), {
                status: 400,
                headers: corsHeaders,
            });
        }

        const geminiApiKey = context.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
            const msg = lang === 'en' ? "Gemini API key is not configured." : "Gemini API Key가 설정되지 않았습니다.";
            await rollback()
            return new Response(JSON.stringify({ error: msg }), {
                status: 500,
                headers: corsHeaders,
            });
        }

        const systemPrompt = lang === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_KO;
        const userText = lang === 'en'
            ? `Height: ${height}cm, Weight: ${weight}kg, Preferred Style: ${styleGoal || 'General'}\nAnalyze this person's body type and provide a style report.`
            : `키: ${height}cm, 몸무게: ${weight}kg, 선호 스타일: ${styleGoal || '일반'}\n이 사용자의 체형을 분석하고 스타일 리포트를 작성해주세요.`;

        // 1. Gemini 3.1 Pro 텍스트/이미지 분석
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${geminiApiKey}`;
        
        const contents: any[] = [{
            parts: [{ text: `${systemPrompt}\n\n${userText}` }]
        }];

        if (imageBase64) {
            const base64Data = imageBase64.split(',')[1];
            const mimeType = imageBase64.split(',')[0].split(':')[1].split(';')[0];
            contents[0].parts.push({
                inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                }
            });
        }

        const textFetch = fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2048,
                    topP: 0.95,
                    topK: 40
                }
            }),
        });

        // 2. 헤어스타일 이미지 생성 (OpenAI DALL-E 3)
        let hairstyleFetch: Promise<Response> | null = null;
        if (imageBase64 && context.env.OPENAI_API_KEY) {
            const hairstylePrompt = lang === 'en' ? HAIRSTYLE_PROMPT_EN : HAIRSTYLE_PROMPT_KO;
            hairstyleFetch = fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${context.env.OPENAI_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    prompt: hairstylePrompt,
                    n: 1,
                    size: "1024x1024",
                    model: "dall-e-3"
                })
            });
        }

        const [geminiResponse, hairstyleResponse] = await Promise.all([
            textFetch,
            hairstyleFetch,
        ]);

        if (!geminiResponse.ok) {
            const errorData = await geminiResponse.json() as any;
            console.error("Gemini API Error:", errorData);
            const fallback = lang === 'en' ? "Gemini API error occurred." : "Gemini API 오류가 발생했습니다.";
            await rollback()
            return new Response(
                JSON.stringify({ error: errorData.error?.message || fallback }),
                { status: geminiResponse.status, headers: corsHeaders }
            );
        }

        const geminiData = await geminiResponse.json() as any;
        const result = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || (lang === 'en' ? 'No result.' : '결과가 없습니다.');

        let hairstyleImage: string | null = null;
        if (hairstyleResponse && hairstyleResponse.ok) {
            const hsData = await hairstyleResponse.json() as any;
            hairstyleImage = hsData.data?.[0]?.url || (hsData.data?.[0]?.b64_json ? `data:image/png;base64,${hsData.data[0].b64_json}` : null);
        }

        return new Response(JSON.stringify({ result, hairstyleImage }), {
            status: 200,
            headers: corsHeaders,
        });
    } catch (error) {
        console.error("Function error:", error);
        await rollback()
        return new Response(JSON.stringify({ error: "서버 오류가 발생했습니다." }), {
            status: 500,
            headers: corsHeaders,
        });
    }
};

export const onRequestOptions: PagesFunction = async () => {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Guest-Mode, X-Guest-Token",
        },
    });
};

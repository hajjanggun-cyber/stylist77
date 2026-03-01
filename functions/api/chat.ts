interface Env {
    GEMINI_API_KEY: string;
}

interface ChatMessage {
    role: 'user' | 'model';
    content: string;
}

interface RequestBody {
    history: ChatMessage[];
    message: string;
    context?: string; // Original report context
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
        const { history, message, context: reportContext } = body;

        const geminiApiKey = context.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
            return new Response(JSON.stringify({ error: "Gemini API Key missing" }), { status: 500, headers: corsHeaders });
        }

        const model = "gemini-3.1-pro-preview";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

        const systemPrompt = `당신은 퍼스널 스타일리스트 'Aura'입니다. 
다음은 사용자의 초기 스타일 분석 결과입니다:
---
${reportContext || "분석 결과 없음"}
---
사용자의 질문에 대해 친절하고 전문적으로 답변해주세요. 스타일링 팁, 구체적인 아이템 추천 등을 제공하세요.`;

        const contents = history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        // Add current prompt
        contents.push({
            role: 'user',
            parts: [{ text: `${systemPrompt}

사용자 질문: ${message}` }]
        });

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents,
                generationConfig: {
                    temperature: 0.8,
                    maxOutputTokens: 1024,
                }
            }),
        });

        if (!response.ok) {
            const error = await response.json() as any;
            return new Response(JSON.stringify({ error: error.error?.message || "Gemini API Error" }), { status: response.status, headers: corsHeaders });
        }

        const data = await response.json() as any;
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "답변을 생성할 수 없습니다.";

        return new Response(JSON.stringify({ reply }), { status: 200, headers: corsHeaders });

    } catch (error) {
        return new Response(JSON.stringify({ error: "Server Error" }), { status: 500, headers: corsHeaders });
    }
};

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

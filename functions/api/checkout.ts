interface Env {
  POLAR_ACCESS_TOKEN: string
}

const PRODUCT_ID = '540885e1-0cb7-439f-a2aa-07bd02a8604a'

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { successUrl } = await ctx.request.json<{ successUrl: string }>()

  const polarRes = await fetch('https://sandbox-api.polar.sh/v1/checkouts/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ctx.env.POLAR_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ product_id: PRODUCT_ID, success_url: successUrl }),
  })

  const data = await polarRes.json() as { url?: string }
  if (!polarRes.ok) {
    return new Response(JSON.stringify({ error: '결제 세션 생성 실패' }), { status: 500 })
  }

  return new Response(JSON.stringify({ checkoutUrl: data.url }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

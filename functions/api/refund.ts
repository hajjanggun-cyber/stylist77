interface Env {
  POLAR_ACCESS_TOKEN: string
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { orderId } = await ctx.request.json<{ orderId: string }>()

  const refundRes = await fetch('https://sandbox-api.polar.sh/v1/refunds/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ctx.env.POLAR_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ order_id: orderId, reason: 'service_unavailable' }),
  })

  if (!refundRes.ok) {
    const err = await refundRes.json()
    return new Response(JSON.stringify({ error: '환불 처리 실패', detail: err }), {
      status: refundRes.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
